// Identificador anónimo de este navegador. El backend lo pide en el header X-Device-Id
// (8 a 64 caracteres: letras, números, _ y -) para que cada quien vea solo su historial.
// No es autenticación: solo separa el historial de cada dispositivo (docs/ARQUITECTURA.md §5).
const KEY = 'agrobytes:deviceId'; // prefijo agrobytes: (lib/migrarClaves.ts mueve las claves fieldshift:*)
const VALIDO = /^[A-Za-z0-9_-]{8,64}$/;

let enMemoria: string | null = null; // por si localStorage no está disponible

/** crypto.randomUUID solo existe en https o localhost; por IP de la red local (http://192.168…) no. */
function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export function getDeviceId(): string {
  if (enMemoria) return enMemoria;
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !VALIDO.test(id)) {
      id = nuevoId();
      localStorage.setItem(KEY, id);
    }
    enMemoria = id;
  } catch {
    enMemoria = nuevoId();
  }
  return enMemoria;
}
