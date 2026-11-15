import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { motion } from 'framer-motion';
import { Droplets, Sprout, TrendingUp, ArrowRight, Check } from 'lucide-react';
import { useStore } from '../store/useStore';
import { CROPS } from '../lib/crops';
import type { Priority } from '../api/types';

const PRIORITIES: { id: Priority; title: string; text: string; icon: typeof Droplets; tone: string }[] = [
  { id: 'water', title: 'Ahorrar agua', text: 'Menos riego, más retención', icon: Droplets, tone: 'text-sky-500' },
  { id: 'nitrogen', title: 'Regenerar nitrógeno', text: 'Suelo más fértil con leguminosas', icon: Sprout, tone: 'text-nitro' },
  { id: 'yield', title: 'Maximizar rendimiento', text: 'Mayor producción por hectárea', icon: TrendingUp, tone: 'text-leaf-500' },
];

/**
 * En celular el panel es una hoja inferior con tres alturas:
 *  - recogido: solo título, estado y botón «Analizar» (deja ver el mapa para dibujar)
 *  - medio: la mitad de la pantalla
 *  - completo: casi toda la pantalla
 * Se arrastra desde la cabecera o se toca el asa para abrir/recoger. En pantallas de 1024 px o más es un panel lateral fijo (con el menú lateral no cabe antes).
 */
type Posicion = 'recogido' | 'medio' | 'completo';
const ORDEN: Posicion[] = ['recogido', 'medio', 'completo'];
const ES_ESCRITORIO = '(min-width: 1024px)'; // igual que el prefijo lg: de Tailwind

interface Props {
  onAnalyze: () => void;
  pending: boolean;
  error?: string | null;
}

export default function QuickPanel({ onAnalyze, pending, error }: Props) {
  const { geometry, areaHa, crop, priority, setCrop, setPriority } = useStore();
  const ready = !!geometry && !!crop && !!priority;
  const missing = !geometry ? 'Dibuja tu parcela en el mapa' : !crop ? 'Elige tu cultivo actual' : !priority ? 'Elige tu prioridad' : '';
  const estado = ready && areaHa ? `${areaHa.toFixed(1)} ha · listo para analizar` : missing;

  const [posicion, setPosicion] = useState<Posicion>(() => (useStore.getState().geometry ? 'medio' : 'recogido'));
  const [arrastre, setArrastre] = useState<number | null>(null); // altura mientras el dedo arrastra
  const [medidas, setMedidas] = useState({ contenedor: 0, recogido: 140 });

  const panelRef = useRef<HTMLElement>(null);
  const cabeceraRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ y: number; alto: number; movio: boolean } | null>(null);
  const finArrastre = useRef(0); // momento en que terminó el último arrastre (para ignorar el clic que lo sigue)

  // Mide el espacio disponible y lo que ocupa la versión recogida (cabecera + botón).
  useEffect(() => {
    const padre = panelRef.current?.parentElement;
    const cabecera = cabeceraRef.current;
    const pie = pieRef.current;
    if (!padre || !cabecera || !pie) return;
    const ro = new ResizeObserver(() =>
      setMedidas({ contenedor: padre.clientHeight, recogido: cabecera.offsetHeight + pie.offsetHeight }));
    [padre, cabecera, pie].forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, []);

  // Al empezar a dibujar se recoge para dejar ver el mapa; al terminar la parcela se abre para elegir cultivo.
  useEffect(
    () =>
      useStore.subscribe((s, antes) => {
        if (s.drawing && !antes.drawing) setPosicion('recogido');
        else if (s.geometry && !antes.geometry) setPosicion('medio');
      }),
    [],
  );

  const altos: Record<Posicion, number> = {
    recogido: medidas.recogido,
    medio: Math.max(medidas.recogido, Math.round(medidas.contenedor * 0.5)),
    completo: Math.max(medidas.recogido, Math.round(medidas.contenedor * 0.88)),
  };
  const alto = arrastre ?? altos[posicion];
  const limitar = (h: number) => Math.min(Math.max(h, altos.recogido), altos.completo);

  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia(ES_ESCRITORIO).matches) return;
    gesto.current = { y: e.clientY, alto, movio: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (!g) return;
    const dy = g.y - e.clientY; // positivo = hacia arriba
    if (!g.movio && Math.abs(dy) < 6) return;
    g.movio = true;
    setArrastre(limitar(g.alto + dy));
  };

  const alSoltar = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g?.movio) return; // fue un toque: lo resuelve el clic del asa
    finArrastre.current = Date.now();
    const final = limitar(g.alto + g.y - e.clientY);
    let destino = ORDEN.reduce((a, b) => (Math.abs(altos[b] - final) < Math.abs(altos[a] - final) ? b : a));
    // Un deslizamiento corto pero claro también cambia de altura.
    const movido = final - g.alto;
    if (destino === posicion && Math.abs(movido) > 40) {
      destino = ORDEN[Math.min(ORDEN.length - 1, Math.max(0, ORDEN.indexOf(posicion) + Math.sign(movido)))];
    }
    setPosicion(destino);
    setArrastre(null);
  };

  const alCancelar = () => {
    gesto.current = null;
    setArrastre(null);
  };

  const alTocarAsa = () => {
    if (Date.now() - finArrastre.current < 350) return; // el clic que sigue a un arrastre no cuenta como toque
    setPosicion((p) => (p === 'recogido' ? 'medio' : 'recogido'));
  };

  return (
    <aside ref={panelRef} style={{ '--alto': `${alto}px` } as CSSProperties}
      className={`absolute inset-x-0 bottom-0 z-[1100] flex h-(--alto) flex-col overflow-hidden rounded-t-panel border border-line bg-surface-raised/95 shadow-lift backdrop-blur
        lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:h-auto lg:w-[360px] lg:rounded-panel xl:w-[400px]
        ${arrastre === null ? 'transition-[height] duration-300 ease-out' : ''}`}>

      {/* Cabecera: en celular se arrastra para subir o bajar el panel */}
      <div ref={cabeceraRef} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alCancelar}
        className="shrink-0 touch-none select-none px-5 pb-3 lg:touch-auto lg:select-auto lg:pt-5">
        <button type="button" onClick={alTocarAsa} aria-expanded={posicion !== 'recogido'}
          aria-label={posicion === 'recogido' ? 'Mostrar opciones de la parcela' : 'Recoger panel'}
          className="flex h-7 w-full items-center justify-center lg:hidden">
          <span className="h-1.5 w-10 rounded-full bg-line-strong" />
        </button>
        <h1 className="font-display text-2xl font-semibold">Tu parcela</h1>
        <p aria-live="polite" className={`mt-0.5 text-sm ${ready ? 'text-leaf-700' : 'text-ink-500'}`}>{estado}</p>
      </div>

      {/* Opciones: se desplazan hacia arriba o abajo cuando no caben */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
        <section className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">1 · Terreno</p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${geometry ? 'bg-leaf-600 text-paper' : 'bg-surface-sunken text-ink-400'}`}>
              {geometry && <Check size={13} />}
            </span>
            <span className="text-ink-700">{geometry && areaHa ? `${areaHa.toFixed(1)} hectáreas marcadas` : 'Aún no has dibujado tu parcela'}</span>
          </div>
        </section>

        <section className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">2 · Cultivo actual</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CROPS.map((c) => (
              <motion.button key={c.id} whileTap={{ scale: 0.96 }} onClick={() => setCrop(c.id)}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  crop === c.id ? 'border-leaf-600 bg-leaf-50 font-medium text-leaf-900' : 'border-line bg-surface-raised text-ink-700 hover:border-leaf-300'}`}>
                {c.name}
              </motion.button>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">3 · Tu prioridad</p>
          <div className="mt-2 flex flex-col gap-2">
            {PRIORITIES.map(({ id, title, text, icon: Icon, tone }) => (
              <motion.button key={id} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => setPriority(id)}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                  priority === id ? 'border-leaf-600 bg-leaf-50' : 'border-line bg-surface-raised hover:border-leaf-300'}`}>
                <Icon size={22} className={`shrink-0 ${tone}`} />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-ink-500">{text}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </section>
      </div>

      {/* Pie: el botón siempre queda visible, también con el panel recogido */}
      <div ref={pieRef} className="shrink-0 border-t border-line-soft px-5 pb-4 pt-3 lg:pb-5">
        {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <button onClick={onAnalyze} disabled={!ready || pending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-leaf-600 px-4 py-3 font-medium text-paper transition-colors hover:bg-leaf-700 disabled:opacity-50">
          {pending ? 'Analizando…' : 'Analizar parcela'} {!pending && <ArrowRight size={18} />}
        </button>
      </div>
    </aside>
  );
}
