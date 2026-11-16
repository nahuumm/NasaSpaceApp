// Atrapa errores de React y muestra un aviso en lugar de dejar la pantalla en blanco.
// - Alrededor de cada vista (App.tsx): si una vista falla, el menú sigue funcionando.
// - Alrededor de toda la app (main.tsx, `completa`): último respaldo; solo ofrece recargar.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useStore } from '../store/useStore';

interface Props { children: ReactNode; completa?: boolean }
interface State { error: Error | null }

/** Una vista que se carga aparte (lazy) no se pudo descargar: casi siempre es falta de internet. */
const esDescarga = (e: Error) =>
  /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(e.message);

export default class AvisoError extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la interfaz:', error, info.componentStack);
  }

  private reintentar = () => this.setState({ error: null });

  private volverAlInicio = () => {
    useStore.getState().goTo('select');
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { completa } = this.props;
    const descarga = esDescarga(error);
    const boton = 'rounded-full px-5 py-2 text-sm font-medium';
    return (
      <div role="alert" className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${completa ? 'min-h-dvh bg-canvas text-ink-900' : 'h-full'}`}>
        <h1 className="font-display text-2xl font-semibold">
          {descarga ? 'No se pudo cargar esta sección' : 'Algo salió mal'}
        </h1>
        <p className="max-w-sm text-sm text-ink-500">
          {descarga
            ? 'Revisa tu conexión a internet e inténtalo de nuevo. Tu último análisis sigue guardado en este dispositivo.'
            : 'Ocurrió un error al mostrar esta pantalla. Tus datos no se perdieron.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {completa || descarga ? (
            <button onClick={() => location.reload()} className={`${boton} bg-leaf-600 text-paper hover:bg-leaf-700`}>
              Recargar la página
            </button>
          ) : (
            <button onClick={this.reintentar} className={`${boton} bg-leaf-600 text-paper hover:bg-leaf-700`}>
              Intentar de nuevo
            </button>
          )}
          {!completa && (
            <button onClick={this.volverAlInicio} className={`${boton} border border-line text-ink-700 hover:bg-surface-sunken`}>
              Volver al inicio
            </button>
          )}
        </div>
        <details className="max-w-md text-xs text-ink-400">
          <summary className="cursor-pointer">Detalle técnico</summary>
          <p className="mt-1 break-words font-mono">{error.message}</p>
        </details>
      </div>
    );
  }
}
