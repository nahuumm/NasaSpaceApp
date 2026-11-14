// Tipos del contrato de la API (espejo de docs/ARQUITECTURA.md §5).
// Versión mínima: por ahora solo incluye el historial (§5.3).
// Dueño: menaxmn (PWA). Ampliar aquí los demás tipos del contrato.

/** Un registro de `GET /api/v1/history` (§5.3). */
export interface HistoryItem {
  id: number;
  /** Fecha ISO 8601 en UTC, ej. "2026-11-14T18:22:10Z". */
  fecha: string;
  lat: number;
  lon: number;
  farm_nombre: string | null;
  tipo_suelo: string;
  cultivo_actual: string;
  temp_media_anual_c: number;
  lluvia_anual_mm: number;
  /** Fracción de 0 a 1 (se muestra como %). */
  humedad_suelo_raiz: number;
  cultivos_recomendados: string[];
}
