// Cliente único de la API: los componentes NO hacen fetch directo. Ver docs/ARQUITECTURA.md §5 y §9.
import type { AnalysisRequest, AnalysisResponse, AnalysisSummary, DetectedSoil } from './types';
import { mockAnalysis, mockHistory } from './mock';
import { getDeviceId } from '../lib/deviceId';

const BASE = import.meta.env.VITE_API_URL as string | undefined;
// Si no hay API configurada (VITE_API_URL vacío) o VITE_USE_MOCK=true, usa datos de ejemplo.
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !BASE;

/** Error de la API con su código HTTP (el mensaje es el `detail` en español del backend). */
export class ErrorApi extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId(), ...init?.headers },
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }
  if (!res.ok) {
    // El backend responde los errores como {"detail": "mensaje en español"}
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === 'string' ? body.detail : `Error ${res.status}`;
    throw new ErrorApi(detail, res.status);
  }
  if (res.status === 204) return undefined as T; // sin cuerpo (p. ej. DELETE)
  return res.json() as Promise<T>;
}

export async function createAnalysis(req: AnalysisRequest): Promise<AnalysisResponse> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 2600)); // simula la espera y deja ver la animación de escaneo
    return mockAnalysis;
  }
  return request<AnalysisResponse>('/api/v1/analyses', { method: 'POST', body: JSON.stringify(req) });
}

/**
 * Analiza sin guardar en el historial (POST /api/v1/analyses?guardar=false, ARQUITECTURA §5.2).
 * Para comparar escenarios. Función aparte (no una opción de createAnalysis) porque createAnalysis se
 * pasa directo como mutationFn y React Query v5 le manda un segundo argumento propio.
 */
export async function previewAnalysis(req: AnalysisRequest): Promise<AnalysisResponse> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 1200));
    return mockAnalysis;
  }
  return request<AnalysisResponse>('/api/v1/analyses?guardar=false', { method: 'POST', body: JSON.stringify(req) });
}

/**
 * Suelo estimado de un punto (GET /api/v1/soil?lat=&lon=, ISRIC SoilGrids, ARQUITECTURA §5.6b).
 * Devuelve null si SoilGrids no tiene dato para ese punto (404: zona urbana, agua…).
 */
export async function getSoil(lat: number, lon: number): Promise<DetectedSoil | null> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return mockAnalysis.soilDetected ?? null;
  }
  try {
    return await request<DetectedSoil>(`/api/v1/soil?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`);
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 404) return null;
    throw e;
  }
}

/** Historial (GET /api/v1/analyses). */
export async function listAnalyses(limit = 20): Promise<AnalysisSummary[]> {
  if (USE_MOCK) return mockHistory;
  return request<AnalysisSummary[]>(`/api/v1/analyses?limit=${limit}`);
}

/** Detalle de un análisis guardado (GET /api/v1/analyses/{id}). */
export async function getAnalysis(id: string): Promise<AnalysisResponse> {
  if (USE_MOCK) return mockAnalysis;
  return request<AnalysisResponse>(`/api/v1/analyses/${encodeURIComponent(id)}`);
}

/** Borra un análisis del historial (DELETE /api/v1/analyses/{id}, responde 204 sin cuerpo; ARQUITECTURA §5.4b). */
export async function deleteAnalysis(id: string): Promise<void> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400));
    return;
  }
  await request<void>(`/api/v1/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
