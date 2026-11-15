import { useSyncExternalStore } from 'react';

export type Tema = 'light' | 'dark';

const CLAVE = 'fieldshift:tema';
const oyentes = new Set<() => void>();

export function temaActual(): Tema {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function fijarTema(t: Tema): void {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(CLAVE, t);
  } catch {
    /* modo privado: el tema vale solo en esta sesión */
  }
  oyentes.forEach((avisar) => avisar());
}

export const alternarTema = () => fijarTema(temaActual() === 'dark' ? 'light' : 'dark');

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

export function useTema(): Tema {
  return useSyncExternalStore(suscribir, temaActual, () => 'light');
}