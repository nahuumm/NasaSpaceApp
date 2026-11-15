import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createAnalysis } from '../api/client';
import type { AnalysisResponse, ImpactItem, Priority } from '../api/types';
import { CROPS, cropName, SEASON_LABEL } from '../lib/crops';
import { useStore } from '../store/useStore';

interface Escenario {
  crop: string;
  priority: Priority;
}

const PRIORIDADES: { id: Priority; texto: string }[] = [
  { id: 'water', texto: 'Ahorrar agua' },
  { id: 'nitrogen', texto: 'Regenerar nitrógeno' },
  { id: 'yield', texto: 'Maximizar rendimiento' },
];

const CAMPO =
  'mt-1 w-full rounded-xl border border-line bg-surface-raised px-3 py-2 text-sm normal-case tracking-normal text-ink-900 focus-visible:outline-2 focus-visible:outline-leaf-600';

// Con datos de ejemplo (sin API) ambos escenarios devuelven lo mismo.
const ES_EJEMPLO = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_API_URL;

const promedio = (a: AnalysisResponse) =>
  Math.round(a.rotation.reduce((suma, r) => suma + r.score, 0) / (a.rotation.length || 1));

/** Quién sale mejor en un indicador: 'a', 'b' o null si empatan. */
function mejor(item: ImpactItem, a: number, b: number): 'a' | 'b' | null {
  if (a === b) return null;
  return (item.betterWhen === 'higher') === a > b ? 'a' : 'b';
}

function Selector({ titulo, valor, onChange }: { titulo: string; valor: Escenario; onChange: (e: Escenario) => void }) {
  return (
    <fieldset className="rounded-card border border-line bg-surface-raised p-4 shadow-card">
      <legend className="px-2 font-display text-lg font-semibold">{titulo}</legend>
      <label className="block text-xs font-semibold uppercase tracking-widest text-ink-500">
        Cultivo actual
        <select value={valor.crop} onChange={(e) => onChange({ ...valor, crop: e.target.value })} className={CAMPO}>
          {CROPS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={`Prioridad del ${titulo}`}>
        {PRIORIDADES.map((p) => (
          <button key={p.id} role="radio" aria-checked={valor.priority === p.id} onClick={() => onChange({ ...valor, priority: p.id })}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              valor.priority === p.id ? 'border-leaf-600 bg-leaf-50 font-medium text-leaf-900' : 'border-line text-ink-700 hover:border-leaf-300'}`}>
            {p.texto}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Columna({ titulo, a }: { titulo: string; a: AnalysisResponse }) {
  return (
    <section className="rounded-card border border-line bg-surface-raised p-5 shadow-card">
      <h2 className="font-display text-xl font-semibold">{titulo}</h2>
      <p className="text-sm text-ink-500">Puntaje promedio de la rotación: <strong className="text-ink-900">{promedio(a)} / 100</strong></p>
      <ul className="mt-3 space-y-2">
        {a.rotation.map((r) => (
          <li key={r.season} className="flex items-center justify-between rounded-xl bg-surface-sunken px-3 py-2 text-sm">
            <span>{SEASON_LABEL[r.season]} · <strong>{cropName(r.cropId)}</strong></span>
            <span className="rounded-full bg-leaf-600 px-2.5 py-0.5 text-xs font-medium text-paper">{r.score}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-700">Salud del suelo (estimada): {a.soilHealth.current} → <strong>{a.soilHealth.recommended}</strong> / 100</p>
    </section>
  );
}

export default function CompareView() {
  const geometry = useStore((s) => s.geometry);
  const soil = useStore((s) => s.soil);
  const crop = useStore((s) => s.crop);
  const priority = useStore((s) => s.priority);
  const goTo = useStore((s) => s.goTo);

  const [escA, setEscA] = useState<Escenario>({ crop: crop ?? 'maize', priority: priority ?? 'water' });
  const [escB, setEscB] = useState<Escenario>({ crop: crop ?? 'maize', priority: priority === 'yield' ? 'water' : 'yield' });

  const comparar = useMutation({
    mutationFn: async () => {
      if (!geometry) throw new Error('Dibuja una parcela primero.');
      const pedir = (e: Escenario) => createAnalysis({ geometry, currentCrop: e.crop, priority: e.priority, soil: soil ?? undefined });
      const [a, b] = await Promise.all([pedir(escA), pedir(escB)]);
      return { a, b };
    },
  });

  if (!geometry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Comparar escenarios</h1>
        <p className="max-w-sm text-sm text-ink-500">Para comparar necesitas tu parcela dibujada en el mapa.</p>
        <button onClick={() => goTo('select')} className="rounded-full bg-leaf-600 px-5 py-2 text-sm font-medium text-paper hover:bg-leaf-700">
          Dibujar parcela
        </button>
      </div>
    );
  }

  const r = comparar.data;
  const pa = r ? promedio(r.a) : 0;
  const pb = r ? promedio(r.b) : 0;

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="font-display text-3xl font-semibold">Comparar escenarios</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-500">Misma parcela, dos decisiones distintas. Elige cada escenario y compara la rotación y el impacto.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Selector titulo="Escenario A" valor={escA} onChange={setEscA} />
        <Selector titulo="Escenario B" valor={escB} onChange={setEscB} />
      </div>

      <button onClick={() => comparar.mutate()} disabled={comparar.isPending}
        className="mt-5 rounded-2xl bg-leaf-600 px-6 py-3 font-medium text-paper transition-colors hover:bg-leaf-700 disabled:opacity-60">
        {comparar.isPending ? 'Comparando…' : 'Comparar'}
      </button>
      {comparar.isError && <p role="alert" className="mt-3 text-sm text-danger">{comparar.error.message}</p>}

      {r && (
        <div className="mt-8 space-y-6">
          {ES_EJEMPLO && (
            <p className="rounded-xl bg-sun-100 p-3 text-sm text-ink-900">Estás viendo datos de ejemplo: ambos escenarios dan el mismo resultado hasta que el backend esté conectado.</p>
          )}
          <p className="font-display text-xl font-semibold">
            {pa === pb ? `Empate: ambos escenarios promedian ${pa} / 100.` : `Gana el escenario ${pa > pb ? 'A' : 'B'}: ${Math.max(pa, pb)} contra ${Math.min(pa, pb)} de puntaje promedio.`}
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Columna titulo="Escenario A" a={r.a} />
            <Columna titulo="Escenario B" a={r.b} />
          </div>

          <section className="overflow-x-auto rounded-card border border-line bg-surface-raised shadow-card">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-surface-sunken text-xs uppercase tracking-widest text-ink-500">
                <tr><th className="px-4 py-3">Impacto con la rotación</th><th className="px-4 py-3">A</th><th className="px-4 py-3">B</th></tr>
              </thead>
              <tbody>
                {r.a.impact.map((item) => {
                  const vb = r.b.impact.find((x) => x.label === item.label)?.recommended;
                  const gana = vb === undefined ? null : mejor(item, item.recommended, vb);
                  return (
                    <tr key={item.label} className="border-t border-line-soft">
                      <td className="px-4 py-3">{item.label} <span className="text-ink-500">({item.unit})</span></td>
                      <td className={`px-4 py-3 ${gana === 'a' ? 'font-semibold text-leaf-700' : ''}`}>{item.recommended}</td>
                      <td className={`px-4 py-3 ${gana === 'b' ? 'font-semibold text-leaf-700' : ''}`}>{vb ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
