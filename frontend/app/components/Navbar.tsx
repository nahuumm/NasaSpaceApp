"use client";

import { useState } from "react";
import Link from "next/link";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/historial", label: "Historial" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="text-lg font-bold text-green-500"
        >
          🚀 NasaSpaceApp
        </Link>

        {/* Enlaces: pantallas medianas y grandes */}
        <ul className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-gray-300 transition-colors hover:text-green-400"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Botón hamburguesa: solo en móvil */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          className="rounded p-2 text-gray-300 hover:bg-gray-800 md:hidden"
        >
          {open ? "✕" : "☰"}
        </button>
      </nav>

      {/* Menú desplegable: solo en móvil */}
      {open && (
        <ul className="border-t border-gray-800 px-4 py-2 md:hidden">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="block py-3 text-gray-300 hover:text-green-400"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}