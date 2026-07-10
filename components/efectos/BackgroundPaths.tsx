'use client';

// Trazos SVG fluyendo en el fondo (inspirado en background-paths de kokonutd/21st.dev,
// implementación propia con framer-motion). Curvas en los azules secundarios ROFÉ,
// opacidad baja — presencia sin robar atención a los datos.

import { motion, useReducedMotion } from 'framer-motion';

function Trazos({ posicion }: { posicion: number }) {
  const reducido = useReducedMotion();
  const paths = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 6 * posicion} -${189 + i * 7}C-${380 - i * 6 * posicion} -${
      189 + i * 7
    } -${312 - i * 6 * posicion} ${216 - i * 7} ${152 - i * 6 * posicion} ${343 - i * 7}C${
      616 - i * 6 * posicion
    } ${470 - i * 7} ${684 - i * 6 * posicion} ${875 - i * 7} ${684 - i * 6 * posicion} ${
      875 - i * 7
    }`,
    width: 0.6 + i * 0.04,
    opacity: 0.04 + i * 0.012,
  }));

  return (
    <svg
      className="pointer-events-none h-full w-full text-rofe-azul"
      viewBox="0 0 696 316"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      {paths.map((p) =>
        reducido ? (
          <path
            key={p.id}
            d={p.d}
            stroke="currentColor"
            strokeWidth={p.width}
            strokeOpacity={p.opacity}
          />
        ) : (
          <motion.path
            key={p.id}
            d={p.d}
            stroke="currentColor"
            strokeWidth={p.width}
            strokeOpacity={p.opacity}
            initial={{ pathLength: 0.3, opacity: 0.5 }}
            animate={{
              pathLength: [0.3, 1, 0.3],
              opacity: [0.35, 0.7, 0.35],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 22 + p.id * 0.55,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ),
      )}
    </svg>
  );
}

export function BackgroundPaths() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 opacity-60">
        <Trazos posicion={1} />
      </div>
      <div className="absolute inset-0 opacity-40 -scale-x-100">
        <Trazos posicion={-1} />
      </div>
    </div>
  );
}
