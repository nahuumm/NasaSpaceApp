// Cliente único de la API (docs/ARQUITECTURA.md §9): los componentes no hacen fetch directo.
// Versión mínima: por ahora solo incluye el historial.
// Dueño: menaxmn (PWA). Ampliar aquí recommend(), climate(), fallback a caché, etc.

import type { HistoryItem } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Error de la API con un mensaje legible en español (§5.5). */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiError("No se pudo conectar con el servidor.", 0);
  }

  if (!res.ok) {
    let detail = `El servidor respondió con un error (${res.status}).`;
    try {
      const body: unknown = await res.json();
      if (
        body !== null &&
        typeof body === "object" &&
        "detail" in body &&
        typeof body.detail === "string"
      ) {
        detail = body.detail;
      }
    } catch {
      // La respuesta de error no era JSON: se queda el mensaje genérico.
    }
    throw new ApiError(detail, res.status);
  }

  return (await res.json()) as T;
}

/** Últimas consultas guardadas (§5.3). */
export function getHistory(limit = 20, signal?: AbortSignal): Promise<HistoryItem[]> {
  return request<HistoryItem[]>(`/api/v1/history?limit=${limit}`, { signal });
}
