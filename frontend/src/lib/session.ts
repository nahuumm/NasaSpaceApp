import { useSyncExternalStore } from 'react';

export interface Usuario {
  nombre: string;
  correo: string;
  granja: string;
}

const CLAVE = 'fieldshift:usuario';

function leer(): Usuario | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Usuario) : null;
  } catch {
    return null;
  }
}

let actual: Usuario | null = leer();   // misma referencia entre lecturas: lo exige useSyncExternalStore
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

export function iniciarSesion(u: Usuario): void {
  actual = u;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(u));
  } catch {
    /* modo privado: la sesión dura solo mientras la pestaña siga abierta */
  }
  avisar();
}

export function cerrarSesion(): void {
  actual = null;
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
  avisar();
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** La firma de este hook es el contrato con el menú de Ximena: no la cambies. */
export function useSession(): { usuario: Usuario | null; cerrarSesion: () => void } {
  const usuario = useSyncExternalStore(suscribir, () => actual, () => null);
  return { usuario, cerrarSesion };
}
