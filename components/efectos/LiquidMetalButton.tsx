'use client';

// Botón "metal líquido" (inspirado en liquid-metal-button de johuniq/21st.dev,
// implementación propia en CSS puro — sin shaders WebGL). Borde metálico giratorio
// + barrido de brillo al hover. Keyframes en globals.css (metal-girar, metal-brillo).

import { ReactNode } from 'react';

export function LiquidMetalButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`liquid-metal group relative inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold text-white transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98] ${className}`}
    >
      {/* barrido de brillo */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
      >
        <span className="liquid-metal-shine absolute inset-y-0 w-1/3" />
      </span>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  );
}
