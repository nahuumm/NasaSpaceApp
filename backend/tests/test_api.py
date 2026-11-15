"""Endpoints de punta a punta. NASA, el catálogo y la BD se reemplazan con datos falsos (monkeypatch).

Las pruebas contra PostgreSQL de verdad están en test_repositories.py.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import get_db
from app.main import app
from app.repositories import analyses as analyses_repo
from app.services import climate as climate_service
from app.services import crops as crops_service
from app.services import soil as soil_service
from app.services.crops import CatalogUnavailableError
from app.services.nasa_power import NasaUnavailableError
from tests.conftest import make_climate

client = TestClient(app)


@pytest.fixture(autouse=True)
def bd_falsa(monkeypatch):
    """Sin PostgreSQL: get_db da None y analyses_repo guarda en una lista."""
    filas: list[SimpleNamespace] = []

    def create(db, *, geometry, lat, lon, area_ha, current_crop, priority, climate_summary, result, soil=None,
               irrigated=None, device_id=None):
        fila = SimpleNamespace(id=len(filas) + 1, created_at=datetime.now(timezone.utc), geometry=geometry, lat=lat,
                               lon=lon, area_ha=area_ha, current_crop=current_crop, priority=priority, soil=soil,
                               climate_summary=climate_summary, result=result, device_id=device_id)
        filas.append(fila)
        return fila

    def list_recent(db, limit=20, device_id=None):
        return [f for f in reversed(filas) if device_id is None or f.device_id == device_id][:limit]

    monkeypatch.setattr(analyses_repo, "create", create)
    monkeypatch.setattr(analyses_repo, "list_recent", list_recent)
    monkeypatch.setattr(analyses_repo, "delete", lambda db, fila: filas.remove(fila))
    monkeypatch.setattr(analyses_repo, "get", lambda db, id: next((f for f in filas if f.id == id), None))
    app.dependency_overrides[get_db] = lambda: None

    async def sin_soilgrids(lat, lon, client=None):
        return None

    monkeypatch.setattr(soil_service, "get_soil", sin_soilgrids)
    yield filas
    app.dependency_overrides.clear()

BODY = {
    "geometry": {"type": "Polygon",
                 "coordinates": [[[-116.61, 31.85], [-116.59, 31.85], [-116.59, 31.87], [-116.61, 31.85]]]},
    "currentCrop": "maize",
    "priority": "water",
}


def test_health_responde():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_coordenadas_invalidas_dan_422():
    r = client.get("/api/v1/climate", params={"lat": 120, "lon": 0})
    assert r.status_code == 422


def test_analisis_valida_el_body():
    r = client.post("/api/v1/analyses", json={"currentCrop": "maize"})
    assert r.status_code == 422


def test_poligono_sin_cerrar_da_422():
    abierto = [[[-116.61, 31.85], [-116.59, 31.85], [-116.59, 31.87], [-116.6, 31.86]]]
    body = {**BODY, "geometry": {"type": "Polygon", "coordinates": abierto}}
    assert client.post("/api/v1/analyses", json=body).status_code == 422


def falsear(monkeypatch, catalog):
    async def get_climate(lat, lon, today=None, db=None):
        return make_climate(lat=lat)

    monkeypatch.setattr(climate_service, "get_climate", get_climate)
    monkeypatch.setattr(crops_service, "load_catalog", lambda db=None: catalog)


def test_analisis_completo(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    r = client.post("/api/v1/analyses", json=BODY)
    assert r.status_code == 201, r.text
    data = r.json()
    # JSON en camelCase, como lo espera el frontend
    assert {"id", "createdAt", "areaHa", "location", "metrics", "rotation", "impact", "soilHealth", "climate",
            "uncertainty"} <= data.keys()
    assert len(data["rotation"]) == 3
    assert "cropId" in data["rotation"][0] and "waterSavingPct" in data["rotation"][0]
    assert data["areaHa"] > 0
    assert 31.85 < data["location"]["lat"] < 31.87


def test_analisis_se_guarda_y_se_lee(monkeypatch, catalog, bd_falsa):
    falsear(monkeypatch, catalog)
    creado = client.post("/api/v1/analyses", json=BODY).json()
    assert creado["id"] == "1"  # id de la BD (entero) como texto, según el contrato
    fila = bd_falsa[0]
    assert fila.current_crop == "maize" and fila.priority == "water"
    assert fila.geometry["type"] == "Polygon"
    assert "id" not in fila.result and "rotation" in fila.result
    assert fila.climate_summary["period"] == "2016-2025"

    # El detalle devuelve exactamente lo mismo que el POST
    detalle = client.get(f"/api/v1/analyses/{creado['id']}")
    assert detalle.status_code == 200
    assert detalle.json() == creado


def test_analisis_sin_guardar_no_entra_al_historial(monkeypatch, catalog, bd_falsa):
    falsear(monkeypatch, catalog)
    r = client.post("/api/v1/analyses", params={"guardar": "false"}, json=BODY)
    assert r.status_code == 200, r.text  # 200, no 201: no se creó nada
    data = r.json()
    assert data["id"].startswith("preview-")
    assert len(data["rotation"]) == 3 and "createdAt" in data
    assert bd_falsa == []
    assert client.get("/api/v1/analyses").json() == []
    assert client.get(f"/api/v1/analyses/{data['id']}").status_code == 404


def test_analisis_sin_guardar_da_el_mismo_resultado(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    guardado = client.post("/api/v1/analyses", params={"guardar": "true"}, json=BODY).json()
    previa = client.post("/api/v1/analyses", params={"guardar": "false"}, json=BODY).json()
    quitar = lambda d: {k: v for k, v in d.items() if k not in ("id", "createdAt")}  # noqa: E731
    assert quitar(previa) == quitar(guardado)


def test_dos_escenarios_dan_resultados_distintos(monkeypatch, catalog):
    """Lo que hace «Comparar escenarios»: misma parcela, distinta prioridad."""
    falsear(monkeypatch, catalog)
    agua = client.post("/api/v1/analyses", params={"guardar": "false"}, json=BODY).json()
    nitro = client.post("/api/v1/analyses", params={"guardar": "false"},
                        json={**BODY, "priority": "nitrogen"}).json()
    assert agua["rotation"] != nitro["rotation"]


def test_guardar_invalido_da_422():
    assert client.post("/api/v1/analyses", params={"guardar": "quizas"}, json=BODY).status_code == 422


def test_historial(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    primero = client.post("/api/v1/analyses", json=BODY).json()
    segundo = client.post("/api/v1/analyses", json={**BODY, "priority": "nitrogen"}).json()
    r = client.get("/api/v1/analyses", params={"limit": 10})
    assert r.status_code == 200
    historial = r.json()
    assert [h["id"] for h in historial] == [segundo["id"], primero["id"]]  # más reciente primero
    h = historial[0]
    assert {"id", "createdAt", "location", "areaHa", "currentCrop", "priority", "rotationCrops"} == h.keys()
    assert h["priority"] == "nitrogen"
    assert h["rotationCrops"] == [paso["cropId"] for paso in segundo["rotation"]]


def test_historial_limit_fuera_de_rango_da_422():
    assert client.get("/api/v1/analyses", params={"limit": 0}).status_code == 422
    assert client.get("/api/v1/analyses", params={"limit": 101}).status_code == 422


@pytest.mark.parametrize("id_", ["999", "abc", "0", "-1", "99999999999", "²"])
def test_analisis_inexistente_da_404(id_):
    r = client.get(f"/api/v1/analyses/{id_}")
    assert r.status_code == 404
    assert r.json() == {"detail": "Análisis no encontrado"}


def test_cultivo_desconocido_da_422(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    r = client.post("/api/v1/analyses", json={**BODY, "currentCrop": "papaya"})
    assert r.status_code == 422
    assert "papaya" in r.json()["detail"]


def test_nasa_caida_da_503(monkeypatch, catalog):
    async def falla(lat, lon, today=None, db=None):
        raise NasaUnavailableError("caído")

    monkeypatch.setattr(climate_service, "get_climate", falla)
    monkeypatch.setattr(crops_service, "load_catalog", lambda db=None: catalog)
    r = client.post("/api/v1/analyses", json=BODY)
    assert r.status_code == 503
    assert r.json() == {"detail": "NASA POWER no disponible"}


def test_sin_catalogo_da_503(monkeypatch):
    def falta(db=None):
        raise CatalogUnavailableError("Catálogo de cultivos no disponible (falta app/data/crops.json)")

    monkeypatch.setattr(crops_service, "load_catalog", falta)
    assert client.post("/api/v1/analyses", json=BODY).status_code == 503
    assert client.get("/api/v1/crops").status_code == 503


# ---------------------------------------------------------------- historial por dispositivo y borrado

YO = {"X-Device-Id": "dispositivo-aaa-111"}
OTRO = {"X-Device-Id": "dispositivo-bbb-222"}


def test_historial_por_dispositivo(monkeypatch, catalog, bd_falsa):
    falsear(monkeypatch, catalog)
    mio = client.post("/api/v1/analyses", json=BODY, headers=YO).json()
    ajeno = client.post("/api/v1/analyses", json=BODY, headers=OTRO).json()
    assert bd_falsa[0].device_id == "dispositivo-aaa-111"
    assert [f["id"] for f in client.get("/api/v1/analyses", headers=YO).json()] == [mio["id"]]
    # El de otro dispositivo no existe para mí
    assert client.get(f"/api/v1/analyses/{ajeno['id']}", headers=YO).status_code == 404
    assert client.get(f"/api/v1/analyses/{mio['id']}", headers=YO).status_code == 200
    # Sin header (clientes viejos) se ve todo, como antes
    assert len(client.get("/api/v1/analyses").json()) == 2


def test_device_id_invalido_da_422():
    r = client.get("/api/v1/analyses", headers={"X-Device-Id": "corto"})
    assert r.status_code == 422


def test_require_device_id(monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_DEVICE_ID", True)
    r = client.get("/api/v1/analyses")
    assert r.status_code == 400 and "X-Device-Id" in r.json()["detail"]
    assert client.get("/api/v1/analyses", headers=YO).status_code == 200


def test_borrar_analisis(monkeypatch, catalog, bd_falsa):
    falsear(monkeypatch, catalog)
    mio = client.post("/api/v1/analyses", json=BODY, headers=YO).json()
    assert client.delete(f"/api/v1/analyses/{mio['id']}", headers=OTRO).status_code == 404  # no es suyo
    r = client.delete(f"/api/v1/analyses/{mio['id']}", headers=YO)
    assert r.status_code == 204 and r.content == b""
    assert bd_falsa == []
    assert client.delete(f"/api/v1/analyses/{mio['id']}", headers=YO).status_code == 404
    assert client.delete("/api/v1/analyses/abc", headers=YO).status_code == 404


def test_borrar_ajeno_sin_header_da_404(monkeypatch, catalog, bd_falsa):
    """Un cliente sin header no puede borrar análisis que tienen dueño."""
    falsear(monkeypatch, catalog)
    mio = client.post("/api/v1/analyses", json=BODY, headers=YO).json()
    assert client.delete(f"/api/v1/analyses/{mio['id']}").status_code == 404
    assert len(bd_falsa) == 1


# ---------------------------------------------------------------- límite de peticiones


def test_limite_de_analisis_por_ip(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANALYSES_PER_MIN", 2)
    params = {"guardar": "false"}
    assert client.post("/api/v1/analyses", params=params, json=BODY).status_code == 200
    assert client.post("/api/v1/analyses", params=params, json=BODY).status_code == 200
    r = client.post("/api/v1/analyses", params=params, json=BODY)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) >= 1 and "Intenta de nuevo" in r.json()["detail"]
    # El historial (GET) no cuenta para el límite
    assert client.get("/api/v1/analyses").status_code == 200


def test_borrar_permite_cors_con_device_id():
    r = client.options("/api/v1/analyses/1", headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "DELETE",
        "Access-Control-Request-Headers": "x-device-id"})
    assert r.status_code == 200


def test_parcela_fuera_de_la_region_da_422(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    guatemala = [[[-90.51, 14.60], [-90.49, 14.60], [-90.49, 14.62], [-90.51, 14.60]]]
    r = client.post("/api/v1/analyses", json={**BODY, "geometry": {"type": "Polygon", "coordinates": guatemala}})
    assert r.status_code == 422
    assert "México, Estados Unidos o Canadá" in r.json()["detail"]


def test_el_analisis_dice_el_pais(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    assert client.post("/api/v1/analyses", json=BODY).json()["country"] == "MX"
    iowa = [[[-93.61, 41.85], [-93.59, 41.85], [-93.59, 41.87], [-93.61, 41.85]]]
    r = client.post("/api/v1/analyses", json={**BODY, "geometry": {"type": "Polygon", "coordinates": iowa}})
    assert r.status_code == 201
    assert r.json()["country"] == "US"


def test_parcela_gigante_da_422(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    gigante = [[[-116.0, 31.0], [-115.5, 31.0], [-115.5, 31.5], [-116.0, 31.5], [-116.0, 31.0]]]
    r = client.post("/api/v1/analyses", json={**BODY, "geometry": {"type": "Polygon", "coordinates": gigante}})
    assert r.status_code == 422
    assert "muy grande" in r.json()["detail"]


def test_analisis_trae_estrategias(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    r = client.post("/api/v1/analyses?guardar=false", json=BODY)
    assert r.status_code == 200
    estrategias = r.json()["strategies"]
    assert len(estrategias) >= 3 and estrategias[0]["id"] == "current"
    assert {"isRecommended", "waterMm", "bareSeasons", "evidence"} <= estrategias[0].keys()
    assert r.json()["climateShift"] is None


def test_escenario_con_guardar_da_422(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    r = client.post("/api/v1/analyses", json={**BODY, "climateShift": {"rainPct": -20, "tempC": 1}})
    assert r.status_code == 422


def test_escenario_fuera_de_rango_da_422(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    r = client.post("/api/v1/analyses?guardar=false", json={**BODY, "climateShift": {"rainPct": -90, "tempC": 0}})
    assert r.status_code == 422


def test_escenario_sin_guardar_responde_estrategias(monkeypatch, catalog):
    falsear(monkeypatch, catalog)
    r = client.post("/api/v1/analyses?guardar=false", json={**BODY, "climateShift": {"rainPct": -20, "tempC": 1}})
    assert r.status_code == 200
    assert len(r.json()["strategies"]) >= 3 and r.json()["climateShift"]["rainPct"] == -20
