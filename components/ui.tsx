'use client';

// Piezas de UI compartidas por el panel principal (app/page.tsx) y el panel JC-ON
// (components/PanelJcOn.tsx). El color de los KPI sale de --acento del tema activo.

import { motion } from 'framer-motion';

export function Kpi({ titulo, valor, detalle, acento }: { titulo: string; valor: string; detalle?: string; acento?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="tarjeta-glass p-3"
      style={acento ? { borderTop: `3px solid ${acento}` } : undefined}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="text-2xl font-bold kpi-valor mt-1" style={acento ? { color: acento } : undefined}>{valor}</p>
      {detalle && <p className="text-xs text-slate-400 mt-1">{detalle}</p>}
    </motion.div>
  );
}

export function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="tarjeta-glass p-4 mb-5"
    >
      <h2 className="font-bold text-slate-700 mb-1">{titulo}</h2>
      {nota && <p className="text-xs text-slate-400 mb-3">{nota}</p>}
      {children}
    </motion.section>
  );
}

// Tarjeta "No aplica" — regla dura del rediseño (§2.3): nunca desaparecer una sección o
// mostrar 0%/vacío sin explicar por qué. Se usa tanto para incompatibilidades estructurales
// (JC sin estrato, MR sin Emoflow) como, en un tono más suave, cuando el filtro vigente
// simplemente no tiene datos todavía.
export function NoAplica({ motivo, suave = false }: { motivo: string; suave?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300/70 bg-white/20 p-5 text-center">
      <p className="text-sm text-slate-400">{suave ? 'Sin datos — ' : 'No aplica — '}{motivo}</p>
    </div>
  );
}
