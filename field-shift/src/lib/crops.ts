import type { Season } from '../api/types';

export interface Crop {
  id: string;
  name: string;
}

// Catálogo de cultivos. El `id` es lo que se envía al backend como `currentCrop`.
export const CROPS: Crop[] = [
  { id: 'maize', name: 'Maíz' },
  { id: 'wheat', name: 'Trigo' },
  { id: 'sorghum', name: 'Sorgo' },
  { id: 'bean', name: 'Frijol' },
  { id: 'oat', name: 'Avena' },
  { id: 'alfalfa', name: 'Alfalfa' },
];

const BY_ID = Object.fromEntries(CROPS.map((c) => [c.id, c.name]));

export function cropName(id: string): string {
  return BY_ID[id] ?? id;
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Primavera',
  summer: 'Verano',
  autumn: 'Otoño',
  winter: 'Invierno',
};

// Fondo de la tarjeta de cada temporada (colores del tema en index.css)
export const SEASON_BG: Record<Season, string> = {
  spring: 'bg-leaf-50',
  summer: 'bg-sun-100',
  autumn: 'bg-clay-100',
  winter: 'bg-sky-50',
};
