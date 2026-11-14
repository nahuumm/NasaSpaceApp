import type { Season } from '../api/types';

export const CROPS = [
  { id: 'maize', name: 'Maíz' },
  { id: 'wheat', name: 'Trigo' },
  { id: 'soy', name: 'Soya' },
  { id: 'bean', name: 'Frijol' },
  { id: 'chile', name: 'Chile' },
  { id: 'tomato', name: 'Tomate' },
  { id: 'oat', name: 'Avena' },
  { id: 'sorghum', name: 'Sorgo' },
];

export const cropName = (id: string) => CROPS.find((c) => c.id === id)?.name ?? id;

export const SEASON_LABEL: Record<Season, string> = {
  autumn: 'Otoño', winter: 'Invierno', spring: 'Primavera', summer: 'Verano',
};

export const SEASON_BG: Record<Season, string> = {
  autumn: 'bg-clay-100', winter: 'bg-sky-50', spring: 'bg-leaf-50', summer: 'bg-sun-100',
};