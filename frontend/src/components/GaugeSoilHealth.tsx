import { motion } from 'framer-motion';

export default function GaugeSoilHealth({ value }: { value: number }) {
  const color = value < 40 ? '#D64545' : value < 65 ? '#F5A623' : '#2E9E5B';
  const arc = 'M10 60 A50 50 0 0 1 110 60';
  return (
    <svg viewBox="0 0 120 70" className="w-full max-w-[220px]" role="img" aria-label={`Salud del suelo ${Math.round(value)} de 100`}>
      <path d={arc} fill="none" className="stroke-surface-sunken" strokeWidth="12" strokeLinecap="round" />
      <motion.path d={arc} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: value / 100 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
      <text x="60" y="58" textAnchor="middle" fontSize="24" className="fill-ink-900" fontFamily="Fraunces, serif" fontWeight="600">
        {Math.round(value)}
      </text>
    </svg>
  );
}