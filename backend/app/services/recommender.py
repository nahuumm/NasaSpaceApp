"""Motor de reglas: clima + catálogo + petición → rotación, impacto, métricas e incertidumbre.

Función PURA: no lee BD, no llama a internet, no consulta la hora (la fecha llega como parámetro).
Así se prueba con datos inventados y cada número de la respuesta se explica con ARQUITECTURA §7.

Fuentes de las reglas (docs/INVESTIGACION-CULTIVOS.md):
- Rangos de temperatura, helada (KTMP) y pH: FAO ECOCROP (vía el catálogo).
- Agua del cultivo: FAO-56, ETc = Kc × ET₀; ET₀ por Hargreaves con Tmax/Tmin de NASA POWER.
- Rotación: no repetir familia botánica (plagas y enfermedades compartidas).
- Qué se siembra en cada país: FAOSTAT, área cosechada (solo se recomienda lo que ahí se cultiva).
- Pesos del puntaje y nitrógeno: reglas simplificadas propias (se etiquetan como estimación).
"""

import calendar
import dataclasses
import math
from dataclasses import dataclass, field
from datetime import date

from app.schemas.analysis import (
    FALLOW_ID,
    AnalysisRequest,
    ClimateShift,
    DetectedSoil,
    ImpactItem,
    MonthlyClimate,
    NasaMetric,
    Priority,
    RotationStep,
    Season,
    SoilHealth,
    Status,
    Strategy,
    Uncertainty,
    UncertaintyLevel,
)
from app.services.climate import ClimateData
from app.services.crops import CropParams

MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
SEASON_ORDER: list[Season] = ["spring", "summer", "autumn", "winter"]
SEASON_LABEL: dict[Season, str] = {"spring": "primavera", "summer": "verano", "autumn": "otoño", "winter": "invierno"}
# Meses de cada temporada en el hemisferio norte (en el sur se invierten)
NORTH_MONTHS: dict[Season, tuple[int, int, int]] = {
    "spring": (3, 4, 5),
    "summer": (6, 7, 8),
    "autumn": (9, 10, 11),
    "winter": (12, 1, 2),
}
OPPOSITE: dict[Season, Season] = {"spring": "autumn", "autumn": "spring", "summer": "winter", "winter": "summer"}

# Pesos del puntaje (suman 1)
W_TEMP, W_WATER, W_SOIL, W_PRIORITY = 0.40, 0.30, 0.15, 0.15
SAME_FAMILY_PENALTY = 0.7
OUT_OF_SEASON_PENALTY = 0.9  # la temporada es preferencia, no filtro: en climas fríos los cultivos de
                             # 'invierno' (trigo, canola, chícharo) se siembran en verano
SYSTEM_CHANGE_PENALTY = 0.85  # pasar de granos a hortalizas (o al revés) exige equipo, mano de obra y mercado
BASE_NITROGEN_KG_HA = 40
FROST_MARGIN_C = 2  # mínima media a menos de 2 °C del umbral de helada → riesgo
DEFAULT_FROST_KILL_C = 0.0  # cultivos sin KTMP en ECOCROP: se asume que la helada (0 °C) los daña
KC_SEASON_FACTOR = 0.8  # Kc promedio del ciclo ≈ 80 % del Kc de media estación (simplificación de FAO-56)
EFFECTIVE_RAIN = 0.8  # fracción de la lluvia que aprovecha el cultivo (simplificación)
PH_TOLERANCE = 0.5  # fuera del óptimo de ECOCROP ± 0.5 → penaliza
MIN_COUNTRY_AREA_HA = 10_000  # se recomienda un cultivo solo si en el país se cosechan ≥ 10 000 ha al año (FAOSTAT)
TOP_CROPS_IN_COUNTRY = 5  # "uno de los cultivos más sembrados del país"

PRIORITIES: tuple[Priority, ...] = ("water", "nitrogen", "yield")
STRATEGY_TITLE = {"current": "Seguir como hoy", "water": "Ahorrar agua", "nitrogen": "Regenerar el suelo",
                  "yield": "Más rendimiento"}
STRATEGY_WHY = {
    "current": "Tu cultivo actual en las temporadas en que el clima lo permite; descanso en las demás.",
    "water": "En cada temporada elige lo que menos agua necesita entre lo que el clima permite.",
    "nitrogen": "Da más peso a leguminosas y coberturas, que devuelven nitrógeno y protegen el suelo.",
    "yield": "Da más peso a los cultivos de mayor valor productivo que el clima permite.",
}
MAX_TRADEOFFS = 4


@dataclass(frozen=True)
class RecommendationResult:
    metrics: list[NasaMetric]
    rotation: list[RotationStep]
    impact: list[ImpactItem]
    soil_health: SoilHealth
    climate: list[MonthlyClimate]
    uncertainty: Uncertainty
    strategies: list[Strategy] = field(default_factory=list)
    local_checks: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SeasonClimate:
    season: Season
    months: tuple[int, int, int]
    temp_c: float  # promedio de los 3 meses
    rain_mm: float  # suma de los 3 meses
    temp_min_c: float = 99.0  # promedio de la mínima diaria de los 3 meses (riesgo de helada)
    et0_mm_day: float = 0.0  # evapotranspiración de referencia promedio (Hargreaves)
    days: int = 91

    @property
    def rain_mm_day(self) -> float:
        return self.rain_mm / self.days


@dataclass(frozen=True)
class SoilInput:
    """El suelo que usa el motor: el que dio el usuario y, si falta algo, el detectado por SoilGrids."""

    texture: str | None
    ph: float | None


@dataclass(frozen=True)
class Candidate:
    crop: CropParams
    score: int
    temp_f: float
    water_f: float
    soil_f: float
    priority_f: float
    same_family: bool
    water_need_mm: float  # agua del ciclo en este lugar y temporada
    irrigation_mm: float  # lo que la lluvia no cubre
    frost_risk: bool = False
    ph_ok: bool = True
    in_season: bool = True
    system_change: bool = False


# ---------------------------------------------------------------- temporadas


def season_months(season: Season, lat: float) -> tuple[int, int, int]:
    return NORTH_MONTHS[season if lat >= 0 else OPPOSITE[season]]


def season_of(month: int, lat: float) -> Season:
    for season in SEASON_ORDER:
        if month in season_months(season, lat):
            return season
    raise ValueError(month)  # inalcanzable: los 12 meses están cubiertos


def next_seasons(today: date, lat: float, n: int = 3) -> list[Season]:
    """Las n temporadas que siguen a la actual. En noviembre (norte) → invierno, primavera, verano."""
    i = SEASON_ORDER.index(season_of(today.month, lat))
    return [SEASON_ORDER[(i + k) % 4] for k in range(1, n + 1)]


def extraterrestrial_radiation(lat: float, month: int, day: int = 15) -> float:
    """Ra (MJ/m²/día), por defecto a mitad de mes. FAO-56, ecuaciones 21–25."""
    j = date(2021, month, day).timetuple().tm_yday
    phi = math.radians(lat)
    dr = 1 + 0.033 * math.cos(2 * math.pi * j / 365)
    delta = 0.409 * math.sin(2 * math.pi * j / 365 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(phi) * math.tan(delta))))
    return 24 * 60 / math.pi * 0.0820 * dr * (
        ws * math.sin(phi) * math.sin(delta) + math.cos(phi) * math.cos(delta) * math.sin(ws))


def et0_hargreaves(t_mean: float, t_max: float, t_min: float, lat: float, month: int) -> float:
    """ET₀ en mm/día. FAO-56 ec. 52 (Hargreaves): 0.0023 · (T+17.8) · √(Tmax−Tmin) · Ra · 0.408."""
    ra = extraterrestrial_radiation(lat, month)
    return max(0.0, 0.0023 * (t_mean + 17.8) * math.sqrt(max(0.0, t_max - t_min)) * ra * 0.408)


def season_climate(season: Season, data: ClimateData) -> SeasonClimate:
    lat = data.summary.lat
    months = season_months(season, lat)
    by_month = {p.month: p for p in data.summary.monthly}
    points = [by_month[m] for m in months]
    return SeasonClimate(
        season=season,
        months=months,
        temp_c=sum(p.temp_c for p in points) / 3,
        rain_mm=sum(p.rain_mm for p in points),
        temp_min_c=sum(p.temp_min_c for p in points) / 3,
        et0_mm_day=sum(et0_hargreaves(p.temp_c, p.temp_max_c, p.temp_min_c, lat, p.month) for p in points) / 3,
        days=sum(calendar.monthrange(2021, m)[1] for m in months),
    )


# ---------------------------------------------------------------- factores (0 a 1)


def water_need(crop: CropParams, sc: SeasonClimate) -> float:
    """Agua del ciclo (mm). Con Kc y ET₀: FAO-56 adaptado al clima del lugar; si no, el valor típico de FAO."""
    if crop.kc_mid is not None and sc.et0_mm_day > 0:
        return crop.kc_mid * KC_SEASON_FACTOR * sc.et0_mm_day * crop.cycle_days
    return crop.water_need_mm


def cycle_rain(crop: CropParams, sc: SeasonClimate) -> float:
    """Lluvia efectiva durante el ciclo (se extiende el ritmo de lluvia de la temporada a todo el ciclo)."""
    return EFFECTIVE_RAIN * sc.rain_mm_day * crop.cycle_days


def frost_limit(crop: CropParams) -> float:
    return crop.frost_kill_c if crop.frost_kill_c is not None else DEFAULT_FROST_KILL_C


def tolerates(crop: CropParams, sc: SeasonClimate) -> bool:
    """¿Puede crecer en esa temporada? Temperatura media dentro de los límites y sin heladas que lo maten."""
    return temperature_factor(sc.temp_c, crop) > 0 and sc.temp_min_c >= frost_limit(crop)


def temperature_factor(temp: float, crop: CropParams) -> float:
    """1 dentro del rango óptimo; baja en línea recta hasta 0 en los límites absolutos."""
    if crop.temp_opt_min <= temp <= crop.temp_opt_max:
        return 1.0
    if temp < crop.temp_opt_min:
        span = crop.temp_opt_min - crop.temp_abs_min
        return max(0.0, (temp - crop.temp_abs_min) / span) if span > 0 else 0.0
    span = crop.temp_abs_max - crop.temp_opt_max
    return max(0.0, (crop.temp_abs_max - temp) / span) if span > 0 else 0.0


def water_factor(need: float, rain: float, irrigated: bool, max_irrigation: float) -> float:
    """Temporal: qué fracción del agua cubre la lluvia. Con riego: menos riego que las otras opciones = mejor."""
    if irrigated:
        return 1.0 if max_irrigation <= 0 else 1 - max(0.0, need - rain) / max_irrigation
    return min(1.0, rain / need) if need > 0 else 1.0


def ph_in_range(ph: float | None, crop: CropParams) -> bool:
    if ph is None or crop.ph_min is None or crop.ph_max is None:
        return True
    return crop.ph_min - PH_TOLERANCE <= ph <= crop.ph_max + PH_TOLERANCE


def soil_factor(soil: SoilInput, crop: CropParams) -> float:
    texture = 1.0 if soil.texture is None or soil.texture in crop.soils else 0.5
    return texture * (1.0 if ph_in_range(soil.ph, crop) else 0.6)


def priority_factor(req: AnalysisRequest, crop: CropParams, need: float, max_need: float) -> float:
    if req.priority == "water":
        return 1 - need / max_need if max_need > 0 else 1.0
    if req.priority == "nitrogen":
        return {"legume": 1.0, "cover": 0.7}.get(crop.family, 0.0)
    return 1.0 if crop.family in ("cereal", "vegetable", "oilseed", "industrial") else 0.5  # yield


def family_of(crop: CropParams) -> str:
    """Familia botánica si el catálogo la trae; si no, el rol (catálogos viejos / pruebas)."""
    return crop.botanical_family or crop.family


@dataclass(frozen=True)
class SeasonContext:
    """Lo que comparten todos los candidatos de una temporada (para compararlos entre ellos)."""

    max_need: float
    max_irrigation: float


def season_context(crops: list[CropParams], sc: SeasonClimate) -> SeasonContext:
    needs = [(water_need(c, sc), cycle_rain(c, sc)) for c in crops]
    return SeasonContext(max_need=max(n for n, _ in needs),
                         max_irrigation=max(max(0.0, n - r) for n, r in needs))


def is_horticultural(crop: CropParams) -> bool:
    return crop.family == "vegetable"


def changes_system(crop: CropParams, current: CropParams) -> bool:
    """Granos/industriales ↔ hortalizas. Las coberturas encajan en ambos sistemas."""
    return crop.family != "cover" and is_horticultural(crop) != is_horticultural(current)


def evaluate(crop: CropParams, sc: SeasonClimate, req: AnalysisRequest, previous: CropParams,
             ctx: SeasonContext, soil: SoilInput, current: CropParams | None = None) -> Candidate:
    need, rain = water_need(crop, sc), cycle_rain(crop, sc)
    t = temperature_factor(sc.temp_c, crop)
    limit = frost_limit(crop)
    if sc.temp_min_c < limit:
        t = 0.0  # las mínimas del mes ya están por debajo de la temperatura que mata la planta
    w = water_factor(need, rain, bool(req.irrigated), ctx.max_irrigation)
    s = soil_factor(soil, crop)
    p = priority_factor(req, crop, need, ctx.max_need)
    raw = 100 * (W_TEMP * t + W_WATER * w + W_SOIL * s + W_PRIORITY * p)
    same_family = family_of(crop) == family_of(previous)
    if same_family:
        raw *= SAME_FAMILY_PENALTY  # regla de rotación: cambiar de familia corta plagas y enfermedades
    in_season = sc.season in crop.seasons
    if not in_season:
        raw *= OUT_OF_SEASON_PENALTY
    system_change = changes_system(crop, current or previous)
    if system_change:
        raw *= SYSTEM_CHANGE_PENALTY
    return Candidate(crop, max(0, min(100, round(raw))), t, w, s, p, same_family,
                     water_need_mm=need, irrigation_mm=max(0.0, need - rain),
                     frost_risk=sc.temp_min_c < limit + FROST_MARGIN_C, ph_ok=ph_in_range(soil.ph, crop),
                     in_season=in_season, system_change=system_change)


def choose(crops: list[CropParams], sc: SeasonClimate, req: AnalysisRequest, previous: CropParams,
           soil: SoilInput, current: CropParams | None = None) -> tuple[Candidate | None, bool]:
    """Mejor cultivo de la temporada. Devuelve (candidato, fuera_de_temporada).

    Entre los cultivos que toleran el clima (temperatura y heladas), gana el de mayor puntaje; estar fuera de
    su temporada habitual o cambiar de sistema de producción solo resta. Si ninguno tolera el clima → None =
    barbecho (descanso). Nunca repite el cultivo anterior.
    """
    others = [c for c in crops if c.id != previous.id] or crops
    ctx = season_context(others, sc)
    evaluated = [evaluate(c, sc, req, previous, ctx, soil, current) for c in others]
    pool = [e for e in evaluated if e.temp_f > 0]
    if not pool:
        return None, False
    best = max(pool, key=lambda e: (e.score, -e.water_need_mm))
    return best, not best.in_season


# ---------------------------------------------------------------- textos


def grown_in_country(crops: list[CropParams], country_areas: dict[str, float] | None) -> list[CropParams]:
    """Cultivos que se siembran en el país (≥ MIN_COUNTRY_AREA_HA). Los de cobertura no se filtran: se incorporan
    al suelo y no aparecen en estadísticas de cosecha. Sin datos del país → todos."""
    if not country_areas:
        return crops
    return [c for c in crops if c.family == "cover" or country_areas.get(c.id, 0) >= MIN_COUNTRY_AREA_HA]


def top_in_country(country_areas: dict[str, float] | None) -> set[str]:
    if not country_areas:
        return set()
    ranked = sorted((a, crop_id) for crop_id, a in country_areas.items() if a >= MIN_COUNTRY_AREA_HA)
    return {crop_id for _, crop_id in ranked[-TOP_CROPS_IN_COUNTRY:]}


def reasons_for(c: Candidate, sc: SeasonClimate, previous: CropParams, current: CropParams,
                req: AnalysisRequest, country_name: str | None = None, popular: bool = False) -> list[str]:
    reasons: list[str] = []
    label = SEASON_LABEL[sc.season]
    if c.temp_f == 1:
        reasons.append(f"La temperatura de {label} ({sc.temp_c:.0f} °C) está en su rango óptimo")
    elif c.temp_f >= 0.6:
        reasons.append(f"Tolera la temperatura de {label} ({sc.temp_c:.0f} °C)")
    if popular and country_name:
        reasons.append(f"Es de los {TOP_CROPS_IN_COUNTRY} cultivos más sembrados en {country_name} (FAOSTAT): "
                       "hay mercado e insumos")
    if req.irrigated and c.water_f >= 0.8:
        reasons.append(f"Es de las opciones que menos riego necesitan (~{c.irrigation_mm:.0f} mm en el ciclo)")
    elif not req.irrigated and c.water_f >= 0.9:
        reasons.append(f"La lluvia de {label} ({sc.rain_mm:.0f} mm) cubre casi toda el agua que necesita")
    saving = water_saving_pct(water_need(current, sc), c.water_need_mm)
    if saving >= 10:
        reasons.append(f"Necesita {saving:.0f} % menos agua que {current.name.lower()}")
    if c.crop.family == "legume":
        reasons.append("Leguminosa: fija nitrógeno en el suelo (estimado)")
    elif c.crop.family == "cover":
        reasons.append("Cultivo de cobertura: protege el suelo de la erosión")
    elif req.priority == "yield" and c.priority_f == 1:
        reasons.append("Cultivo de alto valor productivo")
    if not c.system_change and current.id != c.crop.id and len(reasons) < 3:
        reasons.append("Encaja en tu sistema de producción actual ("
                       + ("hortalizas" if is_horticultural(current) else "granos y forrajes") + ")")
    if not c.same_family:
        reasons.append(f"Cambia de familia respecto a {previous.name.lower()} ({family_of(previous)} → "
                       f"{family_of(c.crop)}): corta el ciclo de plagas")
    return reasons[:3] or ["Es la mejor opción disponible para esta temporada"]


def risks_for(c: Candidate, sc: SeasonClimate, high_uncertainty: bool, out_of_season: bool,
              irrigated: bool, soil: SoilInput) -> list[str]:
    risks: list[str] = []
    if c.frost_risk:
        risks.append(f"Riesgo de helada: mínimas de ~{sc.temp_min_c:.0f} °C (aguanta hasta {frost_limit(c.crop):.0f} °C)")
    if out_of_season:
        risks.append("Fuera de su temporada habitual de siembra; confirma las fechas locales")
    if c.system_change:
        risks.append("Cambia tu sistema de producción (requiere otro equipo, mano de obra y mercado)")
    if not irrigated and c.water_f < 0.6:
        risks.append(f"Requiere riego: la lluvia cubre ~{c.water_f * 100:.0f} % de lo que necesita")
    if not c.ph_ok and soil.ph is not None:
        risks.append(f"pH del suelo ({soil.ph:.1f}) fuera de su rango óptimo "
                     f"({c.crop.ph_min:.1f}–{c.crop.ph_max:.1f})")
    if c.same_family:
        risks.append("Misma familia que el cultivo anterior (más riesgo de plagas)")
    if high_uncertainty and not irrigated:
        risks.append("Lluvia muy variable entre años")
    return risks


def water_saving_pct(current_need: float, need: float) -> float:
    return round(100 * (current_need - need) / current_need) if current_need > 0 else 0.0


def planting_window(months: tuple[int, int, int]) -> str:
    return f"{MONTH_ABBR[months[0] - 1]} – {MONTH_ABBR[months[1] - 1]}"


# ---------------------------------------------------------------- impacto y salud del suelo


def impact(seq: list[CropParams | None], seasons: list[SeasonClimate]) -> tuple[float, float, float]:
    """(agua total del cultivo, riego necesario, nitrógeno estimado) para una secuencia de 3 pasos.
    `None` = barbecho: no consume agua ni nitrógeno.

    Agua total = ETc del ciclo (FAO-56), venga de la lluvia o del riego; riego = la parte que la lluvia no cubre.
    (Antes la primera fila era Σ(lluvia − ETc): en zonas áridas, donde ningún ciclo tiene excedente, salía
    idéntica a −riego y la fila no decía nada nuevo.)"""
    water = irrigation = 0.0
    for c, sc in zip(seq, seasons):
        if c is None:
            continue
        need, rain = water_need(c, sc), cycle_rain(c, sc)
        water += need
        irrigation += max(0.0, need - rain)
    # Sin tope en 0: negativo = la rotación consume más de lo que el suelo tenía al inicio (hay que fertilizar).
    nitrogen = BASE_NITROGEN_KG_HA + sum(c.nitrogen_delta_kg_ha for c in seq if c is not None)
    return round(water), round(irrigation), round(nitrogen)


# Materia orgánica que reporta el usuario → ajuste del índice de salud del suelo (regla propia, estimación)
ORGANIC_MATTER_POINTS = {"low": -10, "mid": 0, "high": 10}


def soil_health_index(seq: list[CropParams | None], organic_matter: str | None = None) -> int:
    """Índice estimado 0-100: premia leguminosas y coberturas, castiga repetir familia botánica.
    Parte de 50 (o 40/60 si el usuario dijo que su materia orgánica es baja/alta)."""
    crops = [c for c in seq if c is not None]
    score = 50 + ORGANIC_MATTER_POINTS.get(organic_matter or "mid", 0)
    score += 10 * sum(c.family == "legume" for c in crops)
    score += 8 * sum(c.family == "cover" for c in crops)
    score -= 10 * sum(family_of(a) == family_of(b) for a, b in zip(crops, crops[1:]))
    return max(0, min(100, score))


def fallow_step(sc: SeasonClimate) -> RotationStep:
    label = SEASON_LABEL[sc.season]
    return RotationStep(
        season=sc.season, crop_id=FALLOW_ID, score=0,
        reasons=[f"Ningún cultivo del catálogo tolera el {label} de este lugar "
                 f"({sc.temp_c:.0f} °C de media, mínimas de {sc.temp_min_c:.0f} °C)",
                 "Dejar el suelo en descanso, con rastrojo o cubierto, lo protege de la erosión"],
        water_saving_pct=100, nitrogen_delta=0, risks=[], planting_window="—", irrigation_mm=0,
    )


# ---------------------------------------------------------------- métricas NASA


def _status_by_threshold(value: float, danger_below: float, warn_below: float) -> Status:
    if value < danger_below:
        return "danger"
    if value < warn_below:
        return "warn"
    return "ok"


def metrics_for(data: ClimateData, current: CropParams) -> list[NasaMetric]:
    s, r = data.summary, data.recent
    monthly = s.monthly
    period_src = f"NASA POWER · {s.period}"
    recent_src = f"NASA POWER · {r.start:%d/%m}–{r.end:%d/%m/%Y}"

    # 1. Humedad del suelo (raíces): últimos 30 días
    sm_status = _status_by_threshold(r.soil_moisture_30d, 0.3, 0.5)
    sm_meaning = {
        "danger": "Suelo seco: las raíces tienen poca agua",
        "warn": f"Algo seco para {current.name.lower()}",
        "ok": "Humedad adecuada en la zona de raíces",
    }[sm_status]

    # 2. Lluvia de los últimos 90 días contra lo normal para esas fechas
    if r.rain_90d_normal_mm < 10:
        rain_status: Status = "ok"
        rain_meaning = f"Temporada normalmente seca (lo normal es {r.rain_90d_normal_mm:.0f} mm)"
    else:
        diff_pct = (r.rain_90d_mm - r.rain_90d_normal_mm) / r.rain_90d_normal_mm * 100
        rain_status = "danger" if diff_pct < -30 else "warn" if diff_pct < -10 else "ok"
        rain_meaning = f"{abs(diff_pct):.0f} % {'menos' if diff_pct < 0 else 'más'} que el promedio"

    # 3. Temperatura de los últimos 30 días contra lo normal
    diff_t = r.temp_30d_c - r.temp_30d_normal_c
    temp_status: Status = "danger" if diff_t > 2 else "warn" if diff_t > 1 else "ok"
    temp_meaning = f"{abs(diff_t):.1f} °C {'sobre' if diff_t >= 0 else 'bajo'} lo normal"

    # 4. Radiación solar: promedio anual (informativa)
    solar = sum(p.solar_radiation for p in monthly) / 12
    solar_meaning = (
        "Alta: buena para cultivos de sol" if solar >= 5 else "Moderada" if solar >= 3.5 else "Baja"
    )

    return [
        NasaMetric(id="soilMoisture", label="Humedad del suelo", value=round(r.soil_moisture_30d, 2), unit="0–1",
                   status=sm_status, meaning=sm_meaning,
                   series=[p.soil_moisture_root for p in monthly], source=recent_src),
        NasaMetric(id="rain90d", label="Lluvia 90 días", value=round(r.rain_90d_mm), unit="mm",
                   status=rain_status, meaning=rain_meaning,
                   series=[p.rain_mm for p in monthly], source=recent_src),
        NasaMetric(id="tempMean", label="Temperatura media", value=round(r.temp_30d_c, 1), unit="°C",
                   status=temp_status, meaning=temp_meaning,
                   series=[p.temp_c for p in monthly], source=recent_src),
        NasaMetric(id="solarRadiation", label="Radiación solar", value=round(solar, 1), unit="kWh/m²/día",
                   status="ok", meaning=solar_meaning,
                   series=[p.solar_radiation for p in monthly], source=period_src),
    ]


def uncertainty_for(data: ClimateData) -> Uncertainty:
    s = data.summary
    levels: list[UncertaintyLevel] = ["low", "medium", "high"]
    i = 0 if s.rain_cv_pct < 15 else 1 if s.rain_cv_pct <= 30 else 2
    reason = f"La lluvia anual varía {s.rain_cv_pct:.0f} % entre años (NASA POWER {s.period})"
    if s.soil_moisture_root < 0.3:
        i = min(2, i + 1)
        reason += "; además el suelo suele estar seco"
    return Uncertainty(level=levels[i], reason=reason)


def apply_shift(data: ClimateData, shift: ClimateShift | None) -> ClimateData:
    """Escenario «¿y si…?»: cambia la lluvia (%) y suma °C al clima histórico de cada mes. No toca el original.
    Lo reciente (90 días) no se toca: el escenario es sobre las temporadas típicas."""
    if shift is None or (shift.rain_pct == 0 and shift.temp_c == 0):
        return data
    f, d = 1 + shift.rain_pct / 100, shift.temp_c
    s = data.summary
    monthly = [p.model_copy(update={"temp_c": p.temp_c + d, "temp_max_c": p.temp_max_c + d,
                                    "temp_min_c": p.temp_min_c + d, "rain_mm": p.rain_mm * f}) for p in s.monthly]
    summary = s.model_copy(update={"monthly": monthly, "temp_mean_c": s.temp_mean_c + d,
                                   "rain_annual_mm": s.rain_annual_mm * f})
    return dataclasses.replace(data, summary=summary)


# ---------------------------------------------------------------- rotaciones y estrategias


def build_rotation(candidates: list[CropParams], seasons: list[SeasonClimate], req: AnalysisRequest,
                   current: CropParams, soil: SoilInput, uncertainty: Uncertainty, country_name: str | None,
                   popular: set[str]) -> tuple[list[RotationStep], list[CropParams | None]]:
    """Rotación de 3 temporadas para la prioridad de `req`. Devuelve (pasos, cultivo de cada paso o None)."""
    irrigated = bool(req.irrigated)
    rotation: list[RotationStep] = []
    chosen: list[CropParams | None] = []
    previous = current
    for sc in seasons:
        best, out_of_season = choose(candidates, sc, req, previous, soil, current)
        if best is None:
            rotation.append(fallow_step(sc))
            chosen.append(None)
            continue  # `previous` no cambia: la regla de familia compara con el último cultivo real
        rotation.append(RotationStep(
            season=sc.season,
            crop_id=best.crop.id,
            score=best.score,
            reasons=reasons_for(best, sc, previous, current, req, country_name, best.crop.id in popular),
            water_saving_pct=water_saving_pct(water_need(current, sc), best.water_need_mm),
            nitrogen_delta=best.crop.nitrogen_delta_kg_ha,
            risks=risks_for(best, sc, uncertainty.level == "high", out_of_season, irrigated, soil),
            planting_window=planting_window(sc.months),
            irrigation_mm=round(best.irrigation_mm),
        ))
        chosen.append(best.crop)
        previous = best.crop
    return rotation, chosen


def current_steps(current: CropParams, candidates: list[CropParams], seasons: list[SeasonClimate],
                  req: AnalysisRequest, soil: SoilInput, uncertainty: Uncertainty) -> list[RotationStep]:
    """Pasos de «Seguir como hoy»: el mismo cultivo en cada temporada que lo tolera (monocultivo)."""
    steps: list[RotationStep] = []
    for sc in seasons:
        label = SEASON_LABEL[sc.season]
        if not tolerates(current, sc):
            steps.append(RotationStep(
                season=sc.season, crop_id=FALLOW_ID, score=0, water_saving_pct=0, nitrogen_delta=0, risks=[],
                reasons=[f"El {current.name.lower()} no tolera el {label} de este lugar",
                         "Hoy la parcela queda sin cultivo en esta temporada"],
                planting_window="—", irrigation_mm=0))
            continue
        c = evaluate(current, sc, req, current, season_context([*candidates, current], sc), soil, current)
        steps.append(RotationStep(
            season=sc.season, crop_id=current.id, score=c.score,
            reasons=["Es lo que siembras hoy", *reasons_for(c, sc, current, current, req)[:2]],
            water_saving_pct=0, nitrogen_delta=current.nitrogen_delta_kg_ha,
            risks=risks_for(c, sc, uncertainty.level == "high", not c.in_season, bool(req.irrigated), soil),
            planting_window=planting_window(sc.months), irrigation_mm=round(c.irrigation_mm)))
    return steps


def describe(sid: str, steps: list[RotationStep], seq: list[CropParams | None], seasons: list[SeasonClimate],
             base: tuple[float, float, float, int], organic_matter: str | None, priority: Priority) -> Strategy:
    """Números y textos de una estrategia. `base` = (agua, riego, nitrógeno, suelo) de «Seguir como hoy»."""
    water, irrigation, nitrogen = impact(seq, seasons)
    soil_h = soil_health_index(seq, organic_matter)
    bare = sum(c is None for c in seq)
    b_water, b_irr, b_n, b_soil = base
    benefits: list[str] = []
    tradeoffs: list[str] = []
    if sid == "current":
        benefits.append("Ya conoces el cultivo, tienes el equipo y sabes dónde venderlo")
    else:
        if irrigation < b_irr:
            benefits.append(f"{b_irr - irrigation:.0f} mm menos de riego que seguir como hoy")
        if nitrogen > b_n:
            benefits.append(f"{nitrogen - b_n:+.0f} kg/ha de nitrógeno en el suelo (estimado)")
        if soil_h > b_soil:
            benefits.append(f"Salud del suelo de {b_soil} a {soil_h} / 100 (estimado)")
        if water > b_water:
            tradeoffs.append(f"Usa {water - b_water:.0f} mm más de agua en total: hay más temporadas con cultivo")
    # Misma regla que la rotación y el índice de suelo: se comparan cultivos consecutivos (el barbecho no cuenta)
    families = [family_of(c) for c in seq if c is not None]
    repeats = any(a == b for a, b in zip(families, families[1:]))
    if repeats:
        tradeoffs.append("Repite familia botánica: plagas y enfermedades se acumulan")
    elif len(families) >= 2:
        benefits.append("Cada temporada cambia de familia botánica: corta ciclos de plagas")
    if bare:
        tradeoffs.append(f"{bare} temporada(s) sin cultivo: deja rastrojo o una cobertura para evitar erosión")
    seen = {t.split(":")[0] for t in tradeoffs}
    for risk in (r for s in steps for r in s.risks):
        key = risk.split(":")[0]  # «Requiere riego: …7 %» y «…1 %» son el mismo aviso
        if key in seen or (repeats and risk.startswith("Misma familia")) or len(tradeoffs) >= MAX_TRADEOFFS:
            continue
        seen.add(key)
        tradeoffs.append(risk)
    evidence = [
        f"{c.name}, {SEASON_LABEL[sc.season]}: necesita ~{water_need(c, sc):.0f} mm y la lluvia aporta "
        f"~{cycle_rain(c, sc):.0f} mm (FAO-56 con clima de NASA POWER)"
        for c, sc in zip(seq, seasons) if c is not None
    ]
    return Strategy(
        id=sid, title=STRATEGY_TITLE[sid], is_current=sid == "current", is_recommended=sid == priority,
        steps=steps, water_mm=water, irrigation_mm=irrigation, nitrogen_kg_ha=nitrogen, soil_health=soil_h,
        bare_seasons=bare, why=STRATEGY_WHY[sid],
        benefits=benefits or ["Resultados parecidos a seguir como hoy"], tradeoffs=tradeoffs, evidence=evidence,
    )


def merge_duplicates(strategies: list[Strategy]) -> list[Strategy]:
    """Si dos prioridades dan los mismos cultivos, se muestran como una sola («Ahorrar agua · Regenerar el suelo»)."""
    out: list[Strategy] = []
    for s in strategies:
        twin = next((o for o in out if [x.crop_id for x in o.steps] == [x.crop_id for x in s.steps]), None)
        if twin is None:
            out.append(s)
        else:
            twin.title = f"{twin.title} · {s.title}"
            twin.is_recommended = twin.is_recommended or s.is_recommended
    return out


# ---------------------------------------------------------------- función principal


def recommend(data: ClimateData, crops: list[CropParams], req: AnalysisRequest, today: date,
              detected_soil: DetectedSoil | None = None, country_areas: dict[str, float] | None = None,
              country_name: str | None = None) -> RecommendationResult:
    """`country_areas` = {crop_id: ha cosechadas al año} del país de la parcela (FAOSTAT). Solo se recomiendan
    cultivos que ahí se siembran; el cultivo actual del usuario puede ser cualquiera del catálogo."""
    by_id = {c.id: c for c in crops}
    current = by_id[req.current_crop]  # el router ya validó que existe
    candidates = grown_in_country(crops, country_areas)
    popular = top_in_country(country_areas)
    uncertainty = uncertainty_for(data)
    # Lo que dijo el usuario manda; lo que falte se completa con SoilGrids
    soil = SoilInput(
        texture=req.soil.texture if req.soil else (detected_soil.texture if detected_soil else None),
        ph=(req.soil.ph if req.soil and req.soil.ph is not None else (detected_soil.ph if detected_soil else None)),
    )
    data = apply_shift(data, req.climate_shift)
    if req.climate_shift is not None:
        uncertainty = uncertainty.model_copy(update={"reason": uncertainty.reason + (
            f"; escenario hipotético: lluvia {req.climate_shift.rain_pct:+.0f} %, "
            f"temperatura {req.climate_shift.temp_c:+.1f} °C")})
    seasons = [season_climate(s, data) for s in next_seasons(today, data.summary.lat)]
    organic_matter = req.soil.organic_matter if req.soil else None

    # 1. «Seguir como hoy»: el cultivo actual en las temporadas donde puede crecer y descanso en las demás
    #    (p. ej. trigo en Mexicali: invierno sí, verano no). Así el impacto compara contra algo realista.
    baseline: list[CropParams | None] = [current if tolerates(current, sc) else None for sc in seasons]
    base_numbers = (*impact(baseline, seasons), soil_health_index(baseline, organic_matter))
    # 2. Una rotación por prioridad (priority_factor cambia el puntaje). La elegida va primero, así al fusionar
    #    repetidas conserva su id.
    order = [req.priority, *[p for p in PRIORITIES if p != req.priority]]
    built = {p: build_rotation(candidates, seasons, req.model_copy(update={"priority": p}), current, soil,
                               uncertainty, country_name, popular) for p in order}
    rotation, chosen = built[req.priority]
    strategies = merge_duplicates([
        describe("current", current_steps(current, candidates, seasons, req, soil, uncertainty), baseline,
                 seasons, base_numbers, organic_matter, req.priority),
        *[describe(p, steps, seq, seasons, base_numbers, organic_matter, req.priority)
          for p, (steps, seq) in built.items()],
    ])
    water_cur, irr_cur, n_cur, soil_cur = base_numbers
    water_rec, irr_rec, n_rec = impact(chosen, seasons)

    return RecommendationResult(
        metrics=metrics_for(data, current),
        rotation=rotation,
        impact=[
            ImpactItem(label="Agua total del cultivo", unit="mm", current=water_cur, recommended=water_rec,
                       better_when="lower"),
            ImpactItem(label="Riego necesario", unit="mm", current=irr_cur, recommended=irr_rec, better_when="lower"),
            ImpactItem(label="Balance de nitrógeno (estimado)", unit="kg/ha", current=n_cur, recommended=n_rec,
                       better_when="higher"),
        ],
        soil_health=SoilHealth(current=soil_cur, recommended=soil_health_index(chosen, organic_matter)),
        climate=[MonthlyClimate(month=MONTH_ABBR[p.month - 1], rain=round(p.rain_mm), temp=round(p.temp_c, 1))
                 for p in data.summary.monthly],
        uncertainty=uncertainty,
        strategies=strategies,
    )
