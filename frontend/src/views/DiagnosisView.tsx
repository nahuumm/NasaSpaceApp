import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, Download } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useStore } from '../store/useStore';
import { cropName, SEASON_BG, SEASON_LABEL } from '../lib/crops';
import NasaMetricCard from '../components/NasaMetricCard';
import GaugeSoilHealth from '../components/GaugeSoilHealth';
import ImpactBar from '../components/ImpactBar';
import { exportarPlanPdf } from '../lib/pdf';
import { PRIORITY_LABEL } from '../lib/etiquetas';

const INCERTIDUMBRE = {
  low: { texto: 'baja', clase: 'bg-leaf-50 text-leaf-900' },
  medium: { texto: 'media', clase: 'bg-sun-100 text-ink-900' },
  high: { texto: 'alta', clase: 'bg-clay-100 text-ink-900' },
} as const;

export default function DiagnosisView() {
  const { analysis, crop, priority, backToSelect } = useStore();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(true);
  if (!analysis) return null;
  const step = analysis.rotation[active];

  return (
    <div className="h-full overflow-auto">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line-soft bg-canvas/90 px-6 py-3 backdrop-blur">
        <button onClick={backToSelect} className="flex items-center gap-1.5 text-sm text-ink-700 hover:text-leaf-700">
          <ArrowLeft size={16} /> Cambiar parcela
        </button>
        <span className="rounded-full bg-leaf-50 px-3 py-1 text-xs text-leaf-900">{analysis.areaHa.toFixed(1)} ha</span>
        {crop && <span className="rounded-full bg-leaf-50 px-3 py-1 text-xs text-leaf-900">{cropName(crop)}</span>}
        {priority && <span className="rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-700">{PRIORITY_LABEL[priority]}</span>}
        <button onClick={() => exportarPlanPdf(analysis, { crop, priority })}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-leaf-600 px-4 py-1.5 text-sm font-medium text-paper hover:bg-leaf-700">
          <Download size={16} /> Exportar PDF
        </button>
      </header>

      <motion.section className="bg-orbit px-6 py-6" initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-paper/60">
          <span className="h-2 w-2 rounded-full bg-nasa-mark" /> Datos de la NASA para tu parcela
        </p>
        <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}>
          {analysis.metrics.map((m) => (
            <motion.div key={m.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
              <NasaMetricCard m={m} />
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      <p role="note" className={`mx-6 mt-6 rounded-xl px-4 py-3 text-sm ${INCERTIDUMBRE[analysis.uncertainty.level].clase}`}>
        <strong>Incertidumbre {INCERTIDUMBRE[analysis.uncertainty.level].texto}.</strong> {analysis.uncertainty.reason}.
      </p>

      <div className="grid gap-6 p-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="font-display text-2xl font-semibold">Rotación recomendada</h2>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {analysis.rotation.map((r, i) => (
              <button key={r.season} onClick={() => { setActive(i); setOpen(true); }}
                className="relative rounded-full px-4 py-2 text-sm font-medium text-ink-700">
                {active === i && (
                  <motion.span layoutId="season-pill" className="absolute inset-0 rounded-full bg-leaf-100"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                )}
                <span className="relative">{SEASON_LABEL[r.season]} · {cropName(r.cropId)}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.article key={step.season}
              className={`mt-4 rounded-card border border-line p-5 shadow-card ${SEASON_BG[step.season]}`}
              initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }} whileHover={{ y: -4 }}>
              <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
                <div>
                  <p className="text-xs uppercase tracking-widest text-ink-500">{SEASON_LABEL[step.season]} · siembra {step.plantingWindow}</p>
                  <h3 className="font-display text-2xl font-semibold">{cropName(step.cropId)}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-leaf-600 px-3 py-1 text-sm font-medium text-paper">{step.score} / 100</span>
                  <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} size={20} />
                </div>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-700">
                      {step.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-surface-raised/70 p-3">
                        <p className="text-xs text-ink-500">Ahorro de agua</p>
                        <p className="font-display text-xl font-semibold text-sky-700">{step.waterSavingPct} %</p>
                      </div>
                      <div className="rounded-xl bg-surface-raised/70 p-3">
                        <p className="text-xs text-ink-500">Nitrógeno (estimado)</p>
                        <p className="font-display text-xl font-semibold text-nitro">{step.nitrogenDelta > 0 ? '+' : ''}{step.nitrogenDelta} kg/ha</p>
                      </div>
                    </div>
                    {step.risks.length > 0 && (
                      <p className="mt-3 text-sm text-clay-700">Riesgos: {step.risks.join('; ')}.</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>
          </AnimatePresence>
        </section>

        <section className="space-y-5 lg:col-span-2">
          <h2 className="font-display text-2xl font-semibold">Impacto comparado</h2>
          <div className="rounded-card border border-line bg-surface-raised p-5 shadow-card">
            <p className="text-sm font-medium">Salud del suelo</p>
            <div className="mt-2 flex items-center justify-around">
              <div className="text-center"><GaugeSoilHealth value={analysis.soilHealth.current} /><p className="text-xs text-ink-500">Actual</p></div>
              <div className="text-center"><GaugeSoilHealth value={analysis.soilHealth.recommended} /><p className="text-xs text-ink-500">Con la rotación</p></div>
            </div>
          </div>
          <div className="space-y-5 rounded-card border border-line bg-surface-raised p-5 shadow-card">
            {analysis.impact.map((it) => <ImpactBar key={it.label} item={it} />)}
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface-raised p-5 shadow-card lg:col-span-5">
          <h2 className="font-display text-xl font-semibold">Clima de la parcela</h2>
          <div className="mt-3 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analysis.climate}>
                <CartesianGrid stroke="#E6DFCF" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tickLine={false} axisLine={false} unit=" mm" />
                <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} unit="°" />
                <Tooltip />
                <Bar yAxisId="l" dataKey="rain" name="Lluvia (mm)" fill="#1F8FD6" radius={[6, 6, 0, 0]} />
                <Line yAxisId="r" dataKey="temp" name="Temperatura (°C)" stroke="#F08A24" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <p className="px-6 pb-6 text-xs text-ink-500">Clima: NASA POWER. Recomendación por reglas agronómicas; nitrógeno y salud del suelo son estimaciones.</p>
    </div>
  );
}