// Datos de ejemplo con el formato de docs/ARQUITECTURA.md §5.3.
// Se usan al abrir /historial?demo=1, mientras el backend adopta el contrato nuevo.

import type { HistoryItem } from "@/app/lib/types";

export const HISTORY_MOCK: HistoryItem[] = [
  {
    id: 42,
    fecha: "2026-11-14T18:22:10Z",
    lat: 31.86,
    lon: -116.6,
    farm_nombre: null,
    tipo_suelo: "arcilloso",
    cultivo_actual: "maiz",
    temp_media_anual_c: 17.4,
    lluvia_anual_mm: 262.0,
    humedad_suelo_raiz: 0.31,
    cultivos_recomendados: ["Maíz", "Sorgo", "Garbanzo"],
  },
  {
    id: 41,
    fecha: "2026-11-13T16:05:42Z",
    lat: 32.09,
    lon: -116.57,
    farm_nombre: "Parcela Norte",
    tipo_suelo: "franco",
    cultivo_actual: "vid",
    temp_media_anual_c: 18.1,
    lluvia_anual_mm: 280.5,
    humedad_suelo_raiz: 0.27,
    cultivos_recomendados: ["Vid", "Olivo"],
  },
  {
    id: 40,
    fecha: "2026-11-12T09:48:00Z",
    lat: 30.56,
    lon: -115.94,
    farm_nombre: null,
    tipo_suelo: "arenoso",
    cultivo_actual: "tomate",
    temp_media_anual_c: 16.8,
    lluvia_anual_mm: 145.3,
    humedad_suelo_raiz: 0.18,
    cultivos_recomendados: ["Fresa", "Espárrago", "Cebada", "Garbanzo"],
  },
];
