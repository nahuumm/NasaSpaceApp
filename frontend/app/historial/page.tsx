"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHistory } from "@/app/lib/api";
import type { HistoryItem } from "@/app/lib/types";
import { HISTORY_MOCK } from "./mock";

const LIMITE = 20;

type Estado =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "listo"; datos: HistoryItem[]; demo: boolean };

// ---------- Formato ----------

const formatoFecha = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatFecha(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "—" : formatoFecha.format(fecha);
}

// Los valores numéricos se revisan aunque el tipo diga `number`: si el backend
// todavía manda el formato viejo, la página muestra "—" en lugar de romperse.
function formatNumero(valor: number | null | undefined, decimales = 1): string {
  return typeof valor === "number"
    ? valor.toLocaleString("es-MX", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      })
    : "—";
}

function formatPorcentaje(fraccion: number | null | undefined): string {
  return typeof fraccion === "number" ? `${Math.round(fraccion * 100)} %` : "—";
}

function formatUbicacion(item: HistoryItem): string {
  if (item.farm_nombre) return item.farm_nombre;
  if (typeof item.lat === "number" && typeof item.lon === "number") {
    return `${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`;
  }
  return "—";
}

function Cultivos({ cultivos }: { cultivos: string[] | undefined }) {
  if (!Array.isArray(cultivos) || cultivos.length === 0) {
    return <span className="text-gray-500">—</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {cultivos.map((cultivo) => (
        <li
          key={cultivo}
          className="rounded-full border border-green-800 bg-green-950/60 px-2.5 py-0.5 text-xs text-green-300"
        >
          {cultivo}
        </li>
      ))}
    </ul>
  );
}

// ---------- Página ----------

export default function HistorialPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    const controller = new AbortController();

    const carga = demo
      ? Promise.resolve(HISTORY_MOCK)
      : getHistory(LIMITE, controller.signal);

    carga
      .then((datos) => setEstado({ tipo: "listo", datos, demo }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setEstado({
          tipo: "error",
          mensaje:
            err instanceof Error ? err.message : "Ocurrió un error inesperado.",
        });
      });

    return () => controller.abort();
  }, [intento]);

  function reintentar() {
    setEstado({ tipo: "cargando" });
    setIntento((n) => n + 1);
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-green-500 sm:text-3xl">
            Historial de consultas
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Últimas {LIMITE} recomendaciones calculadas con datos de NASA POWER.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm transition-colors hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-green-500"
        >
          Nueva consulta
        </Link>
      </div>

      {estado.tipo === "cargando" && (
        <p role="status" className="py-12 text-center text-gray-400">
          Cargando historial…
        </p>
      )}

      {estado.tipo === "error" && (
        <div
          role="alert"
          className="rounded-xl border border-red-900 bg-red-950/40 p-6 text-center"
        >
          <p className="font-medium text-red-300">No se pudo cargar el historial.</p>
          <p className="mt-1 text-sm text-red-200/80">{estado.mensaje}</p>
          <button
            type="button"
            onClick={reintentar}
            className="mt-4 rounded-lg bg-red-900/60 px-4 py-2 text-sm text-red-100 transition-colors hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-red-400"
          >
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === "listo" && (
        <>
          {estado.demo && (
            <p className="mb-4 rounded-lg border border-yellow-800 bg-yellow-950/40 px-4 py-2 text-sm text-yellow-200">
              Mostrando datos de ejemplo (modo demo).
            </p>
          )}

          {estado.datos.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
              <p className="text-gray-300">Todavía no hay consultas guardadas.</p>
              <Link
                href="/"
                className="mt-3 inline-block text-green-400 underline-offset-4 hover:underline"
              >
                Hacer la primera consulta
              </Link>
            </div>
          ) : (
            <>
              {/* Tabla: pantallas medianas y grandes */}
              <div className="hidden overflow-x-auto rounded-xl border border-gray-800 bg-gray-900 md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Historial de consultas</caption>
                  <thead>
                    <tr className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-400">
                      <th scope="col" className="p-3 font-medium">Fecha</th>
                      <th scope="col" className="p-3 font-medium">Ubicación</th>
                      <th scope="col" className="p-3 font-medium">Suelo</th>
                      <th scope="col" className="p-3 font-medium">Cultivo actual</th>
                      <th scope="col" className="p-3 text-right font-medium">Temp. media (°C)</th>
                      <th scope="col" className="p-3 text-right font-medium">Lluvia anual (mm)</th>
                      <th scope="col" className="p-3 text-right font-medium">Humedad del suelo</th>
                      <th scope="col" className="p-3 font-medium">Recomendados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.datos.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40"
                      >
                        <td className="whitespace-nowrap p-3 text-gray-400">
                          <time dateTime={item.fecha}>{formatFecha(item.fecha)}</time>
                        </td>
                        <td className="whitespace-nowrap p-3 font-medium text-gray-200">
                          {formatUbicacion(item)}
                        </td>
                        <td className="p-3 capitalize">{item.tipo_suelo ?? "—"}</td>
                        <td className="p-3 capitalize">{item.cultivo_actual ?? "—"}</td>
                        <td className="p-3 text-right tabular-nums">
                          {formatNumero(item.temp_media_anual_c)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatNumero(item.lluvia_anual_mm)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-blue-300">
                          {formatPorcentaje(item.humedad_suelo_raiz)}
                        </td>
                        <td className="p-3">
                          <Cultivos cultivos={item.cultivos_recomendados} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas: móvil */}
              <ul className="space-y-3 md:hidden">
                {estado.datos.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-gray-800 bg-gray-900 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-gray-200">{formatUbicacion(item)}</p>
                      <time dateTime={item.fecha} className="shrink-0 text-xs text-gray-400">
                        {formatFecha(item.fecha)}
                      </time>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-gray-500">Suelo</dt>
                        <dd className="capitalize">{item.tipo_suelo ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Cultivo actual</dt>
                        <dd className="capitalize">{item.cultivo_actual ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Temp. media</dt>
                        <dd className="tabular-nums">{formatNumero(item.temp_media_anual_c)} °C</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Lluvia anual</dt>
                        <dd className="tabular-nums">{formatNumero(item.lluvia_anual_mm)} mm</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Humedad del suelo</dt>
                        <dd className="tabular-nums text-blue-300">
                          {formatPorcentaje(item.humedad_suelo_raiz)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3">
                      <p className="mb-1.5 text-xs text-gray-500">Recomendados</p>
                      <Cultivos cultivos={item.cultivos_recomendados} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
