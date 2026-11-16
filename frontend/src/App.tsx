import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, type ComponentType } from 'react';
import { useStore, type ViewId } from './store/useStore';
import AppShell from './components/AppShell';
import AvisoError from './components/AvisoError';
// SelectView es la vista inicial: se carga de inmediato. El resto se descarga al abrirse.
import SelectView from './views/SelectView';
const DiagnosisView = lazy(() => import('./views/DiagnosisView'));
const HistoryView = lazy(() => import('./views/HistoryView'));
const AlertsView = lazy(() => import('./views/AlertsView'));
const CalendarView = lazy(() => import('./views/CalendarView'));
const CompareView = lazy(() => import('./views/CompareView'));
const AccountView = lazy(() => import('./views/AccountView'));

const VIEWS: Record<ViewId, ComponentType> = {
  select: SelectView,
  diagnosis: DiagnosisView,
  history: HistoryView,
  alerts: AlertsView,
  calendar: CalendarView,
  compare: CompareView,
  account: AccountView,
};

export default function App() {
  const view = useStore((s) => s.view);
  const View = VIEWS[view];
  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.main key={view} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          {/* key={view} en motion.main: al cambiar de vista el aviso de error se reinicia solo */}
          <AvisoError>
            <Suspense fallback={null}>
              <View />
            </Suspense>
          </AvisoError>
        </motion.main>
      </AnimatePresence>
    </AppShell>
  );
}
