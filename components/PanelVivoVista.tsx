// Piezas visuales del panel de clase en vivo, compartidas entre la página real
// (app/panel-vivo/page.tsx, con login + datos reales) y la de demo
// (app/panel-vivo/demo/page.tsx, sin login + datos de ejemplo) -- una sola implementación de
// UI para las dos, así lo que se ve en la demo es EXACTAMENTE lo que se ve en producción.

import type { Sala, FilaRoster, EstadoPresencia } from '@/lib/panelVivo';

export const ESTILO_ESTADO: Record<EstadoPresencia, { bg: string; texto: string; etiqueta: string }> = {
  presente_exacto: { bg: 'bg-[#c6e7c8]', texto: 'text-[#1a5e20]', etiqueta: 'Presente' },
  presente_alterno: { bg: 'bg-[#f3d1e0]', texto: 'text-[#8a1a52]', etiqueta: 'Presente (correo alterno)' },
  presente_detectado: { bg: 'bg-[#ffb74d]', texto: 'text-[#663c00]', etiqueta: 'Presente (nombre detectado)' },
  nunca_entro: { bg: 'bg-[#f4c7c3]', texto: 'text-[#990000]', etiqueta: 'Nunca entró' },
};

export const NOMBRE_HOST: Record<string, string> = {
  comunicaciones: '🟡 Comunicaciones',
  jovenescreativos: '🔵 Jóvenes creaTIvos',
};

export function fmtHora(s: string | null) {
  if (!s) return '—';
  return s.replace(/^\d{4}-\d{2}-\d{2} /, '');
}

export function Centrado({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center px-4">{children}</div>;
}

export function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className={`rounded-full px-2.5 py-1 font-medium ${color}`}>{children}</span>;
}

// "Lectura oficial" (2026-08-18): a diferencia de los badges de arriba (viven, cambian en
// cada poll), esto es un número que dejó de moverse -- se congela solo, la primera vez que
// pasan hora_oficial(CUPOS)+10min, mismo criterio que ASISTENCIA-10MIN. 3 estados posibles:
// sin hora oficial (topic sin Alias Zoom en CUPOS, o clase sin patrón semanal) -> no se
// muestra nada; hora oficial pero aún no llega -> "pendiente, a las HH:MM"; ya se tomó -> el
// número congelado, con la hora en que se tomó.
function LecturaOficial({ sala }: { sala: Sala }) {
  if (!sala.hora_lectura) return null;
  const horaTxt = fmtHora(sala.hora_lectura);
  if (!sala.resumen_lectura) {
    return (
      <p className="text-xs text-slate-400 mt-2">
        📖 Lectura oficial pendiente — se toma a las {horaTxt}
      </p>
    );
  }
  const rl = sala.resumen_lectura;
  return (
    <p className="text-xs text-slate-500 mt-2">
      📖 <span className="font-medium">Lectura oficial ({horaTxt}):</span> {rl.presentes}
      {rl.presentes_alterno + rl.presentes_detectado > 0 &&
        ` (+${rl.presentes_alterno + rl.presentes_detectado} identificados aparte)`}{' '}
      de {rl.total_roster} — número fijo, no cambia aunque sigan entrando después
    </p>
  );
}

export function TarjetaSala({ sala }: { sala: Sala }) {
  const r = sala.resumen;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-700">
            {NOMBRE_HOST[sala.host] ?? sala.host}
          </span>
          <span className="text-xs text-slate-400">abierta {fmtHora(sala.abierta_desde)}</span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          {sala.horario_resuelto ?? (
            <span className="text-amber-600">
              SIN ALIAS — agregar Alias Zoom en CUPOS para &ldquo;{sala.topic}&rdquo;
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2 mt-2 text-xs">
          <Badge color="bg-[#c6e7c8] text-[#1a5e20]">🟢 {r.presentes} presentes</Badge>
          {r.presentes_alterno > 0 && (
            <Badge color="bg-[#f3d1e0] text-[#8a1a52]">🩷 {r.presentes_alterno} correo alterno</Badge>
          )}
          {r.presentes_detectado > 0 && (
            <Badge color="bg-[#ffb74d] text-[#663c00]">🟧 {r.presentes_detectado} nombre detectado</Badge>
          )}
          <Badge color="bg-[#f4c7c3] text-[#990000]">🔴 {r.nunca_entro} nunca entró</Badge>
          <Badge color="bg-slate-200 text-slate-600">Total {r.total_roster}</Badge>
          {r.sin_identificar > 0 && (
            <Badge color="bg-slate-700 text-white">⬛ {r.sin_identificar} sin identificar</Badge>
          )}
        </div>
        <LecturaOficial sala={sala} />
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left font-medium px-4 py-2">Nombre</th>
              <th className="text-left font-medium px-4 py-2">Estado</th>
              <th className="text-left font-medium px-4 py-2">Celular</th>
              <th className="text-left font-medium px-4 py-2">Ciudad</th>
            </tr>
          </thead>
          <tbody>
            {sala.roster.map((f) => (
              <FilaEstudiante key={f.correo} f={f} />
            ))}
          </tbody>
        </table>
      </div>

      {sala.sin_identificar.length > 0 && (
        <div className="bg-slate-800 text-white px-4 py-3 text-sm">
          <p className="font-medium mb-1.5">⬛ Sin identificar — contactar ya</p>
          <ul className="space-y-1">
            {sala.sin_identificar.map((p) => (
              <li key={p.correo} className="text-slate-200">
                <span className="font-medium">{p.nombre}</span>{' '}
                <span className="text-slate-400">&lt;{p.correo}&gt;</span>
                {p.candidato_db && (
                  <span className="block text-xs text-amber-300">
                    posible: {p.candidato_db.nombre} &lt;{p.candidato_db.correo}&gt; (
                    {p.candidato_db.fuente})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FilaEstudiante({ f }: { f: FilaRoster }) {
  const est = ESTILO_ESTADO[f.estado];
  return (
    <tr className={`${est.bg} ${est.texto} border-t border-white/50`}>
      <td className="px-4 py-1.5">
        <div className="font-medium">{f.nombre}</div>
        <div className="text-xs opacity-70">{f.correo}</div>
        {f.correo_zoom && (
          <div className="text-xs opacity-70">entró como: {f.correo_zoom}</div>
        )}
      </td>
      <td className="px-4 py-1.5">
        <div>{est.etiqueta}</div>
        {f.ultima_hora && <div className="text-xs opacity-70">{fmtHora(f.ultima_hora)}</div>}
      </td>
      <td className="px-4 py-1.5">{f.celular || '—'}</td>
      <td className="px-4 py-1.5">{f.ciudad || '—'}</td>
    </tr>
  );
}
