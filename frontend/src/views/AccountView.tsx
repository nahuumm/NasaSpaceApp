import { useState, type FormEvent } from 'react';
import { LogOut } from 'lucide-react';
import { iniciarSesion, useSession } from '../lib/session';
import { useStore } from '../store/useStore';

const CAMPO =
  'mt-1 w-full rounded-xl border border-line bg-surface-raised px-3 py-2 text-sm normal-case tracking-normal text-ink-900 focus-visible:outline-2 focus-visible:outline-leaf-600';

export default function AccountView() {
  const { usuario, cerrarSesion } = useSession();
  const goTo = useStore((s) => s.goTo);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [granja, setGranja] = useState('');
  const [error, setError] = useState<string | null>(null);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    const c = correo.trim();
    if (!n) { setError('Escribe tu nombre.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(c)) { setError('Escribe un correo válido.'); return; }
    setError(null);
    iniciarSesion({ nombre: n, correo: c, granja: granja.trim() || 'Mi granja' });
    goTo('select');
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-3xl font-semibold">{usuario ? 'Tu cuenta' : 'Iniciar sesión'}</h1>
        <p className="mt-2 rounded-xl border border-line bg-surface-raised p-3 text-sm text-ink-700">
          Perfil local: tus datos se guardan solo en este navegador. No hay contraseña ni servidor.
        </p>

        {usuario ? (
          <div className="mt-6 rounded-card border border-line bg-surface-raised p-5 shadow-card">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-600 font-display text-2xl text-paper">
                {usuario.nombre.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="font-display text-xl font-semibold">{usuario.nombre}</p>
                <p className="text-sm text-ink-500">{usuario.correo}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-700"><strong>Granja:</strong> {usuario.granja}</p>
            <button onClick={cerrarSesion}
              className="mt-5 flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-700 hover:bg-surface-sunken">
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} className="mt-6 space-y-4 rounded-card border border-line bg-surface-raised p-5 shadow-card" noValidate>
            <label className="block text-xs font-semibold uppercase tracking-widest text-ink-500">
              Nombre
              <input className={CAMPO} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-widest text-ink-500">
              Correo
              <input className={CAMPO} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-widest text-ink-500">
              Nombre de tu granja o rancho (opcional)
              <input className={CAMPO} value={granja} onChange={(e) => setGranja(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button type="submit"
              className="w-full rounded-2xl bg-leaf-600 px-4 py-3 font-medium text-paper transition-colors hover:bg-leaf-700">
              Entrar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
