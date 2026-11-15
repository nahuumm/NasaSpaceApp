import { Moon, Sun } from 'lucide-react';
import { alternarTema, useTema } from '../lib/tema';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const oscuro = useTema() === 'dark';
  return (
    <button onClick={alternarTema} aria-pressed={oscuro}
      className={`flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-leaf-600 ${className}`}>
      {oscuro ? <Sun size={16} /> : <Moon size={16} />}
      {oscuro ? 'Modo claro' : 'Modo oscuro'}
    </button>
  );
}