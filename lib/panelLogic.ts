// Port 1:1 de scripts/zoom-asistencia/panel_logic.py (repo admin-usable) -- la lógica de
// resolución de horario y match por nombre del panel de clase en vivo. Corre client-side acá
// (antes corría en Python, del lado del servidor/n8n) porque panel-datos-rofe es
// output:'export' (estático, sin server-side) -- ver docs/procesos/panel-clase-vivo.md
// "Pivote a Vercel" (sesión 2026-08-18) para el porqué completo.
//
// Cualquier cambio de lógica acá debe reflejarse TAMBIÉN en panel_logic.py -- son 2
// implementaciones de la misma regla mientras el panel viejo de Sheets siga vivo en paralelo
// (no se apaga en este cambio, ver plan de la sesión).

export interface CupoRow {
  area: string | null;
  clase: string;
  alias_zoom: string | null;
  dia: string | null;
  hora: number | null;
  inscritos: number | null;
}

export interface PersonaRoster {
  nombre: string;
  correo: string;
}

export interface EventoLive {
  uuid: string;
  evento: string; // 'joined' | 'left'
  nombre: string | null;
  correo: string | null;
  hora_ms: number | null;
  hora_bogota: string | null;
  curso: string | null;
}

const DIAS_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const INSTITUCIONAL_SUFIJO = 'tocaunavida.org';
const TOKENS_MIN = 3;
const SOLAPE_MIN = 2;
export const UMBRAL_LECTURA_MIN = 10;

const RANGO_DIACRITICOS = new RegExp('[̀-ͯ]', 'g');

export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(RANGO_DIACRITICOS, '') // quita acentos (equivalente a encode ascii ignore)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function tokensLargos(nombreNorm: string): Set<string> {
  return new Set(nombreNorm.split(' ').filter((t) => t.length >= TOKENS_MIN));
}

/** (día_es, hora_decimal_24h) desde 'YYYY-MM-DD HH:MM[:SS]', o [null, null] si no parsea. */
function parsearDiaHora(apertura: string): [string | null, number | null] {
  const m = apertura.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return [null, null];
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (isNaN(dt.getTime())) return [null, null];
  const diaIdx = (dt.getDay() + 6) % 7; // JS: domingo=0 -> reindexar a lunes=0
  return [DIAS_ES[diaIdx], Number(h)];
}

/** Fila completa de zoom_cupos_config que resulta de la cascada de desambiguación
 * (puntaje día+hora), o null si el topic no coincide con ninguna fila. */
export function resolverFilaCupos(topic: string, cupos: CupoRow[], apertura = ''): CupoRow | null {
  const t = (topic || '').trim();
  if (!t) return null;
  const filas = cupos.filter((r) => r.clase.trim() === t || (r.alias_zoom ?? '').trim() === t);
  if (filas.length === 0) return null;
  if (filas.length === 1) return filas[0];
  const [dia, horaApertura] = parsearDiaHora(apertura);
  if (dia === null) return filas[0]; // respaldo: sin fecha parseable -- 1a coincidencia

  const puntaje = (r: CupoRow) => {
    const diaR = (r.dia ?? '').trim();
    const horaR = r.hora ?? 9999;
    return (diaR === dia ? 0 : 1000) + Math.abs(horaR - (horaApertura ?? 0));
  };
  return filas.reduce((mejor, r) => (puntaje(r) < puntaje(mejor) ? r : mejor), filas[0]);
}

export function resolverHorario(topic: string, cupos: CupoRow[], apertura = ''): string | null {
  const fila = resolverFilaCupos(topic, cupos, apertura);
  return fila ? fila.clase.trim() : null;
}

export function resolverHoraOficial(
  topic: string,
  cupos: CupoRow[],
  apertura = ''
): [string | null, number | null] {
  const fila = resolverFilaCupos(topic, cupos, apertura);
  if (!fila) return [null, null];
  return [fila.dia?.trim() || null, fila.hora ?? null];
}

/** Instante de "lectura oficial" = fecha real de `apertura` + `horaOficial` (zoom_cupos_config)
 * + UMBRAL_LECTURA_MIN. Devuelve Date naive en hora Bogotá, o null. */
export function calcularLectura(apertura: string, horaOficial: number | null): Date | null {
  if (horaOficial === null) return null;
  const [dia] = parsearDiaHora(apertura);
  if (dia === null) return null;
  const fechaParte = apertura.split(' ')[0];
  const m = fechaParte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const horas = Math.floor(horaOficial);
  const minutos = Math.round((horaOficial - horas) * 60);
  const base = new Date(Number(y), Number(mo) - 1, Number(d), horas, minutos);
  base.setMinutes(base.getMinutes() + UMBRAL_LECTURA_MIN);
  return base;
}

/** roster: lista {nombre, correo}. Devuelve la persona con mejor match por nombre, o null.
 * Exacto normalizado gana; si no, mayor solapamiento de tokens largos (>=SOLAPE_MIN). */
export function matchPorNombre(nombreZoom: string, roster: PersonaRoster[]): PersonaRoster | null {
  const nz = norm(nombreZoom);
  if (!nz) return null;
  const tz = tokensLargos(nz);
  let mejor: PersonaRoster | null = null;
  let mejorScore = 0;
  for (const p of roster) {
    const rnn = norm(p.nombre);
    if (rnn === nz) return p; // exacto gana siempre
    const tr = tokensLargos(rnn);
    let score = 0;
    for (const t of tz) if (tr.has(t)) score++;
    if (score > mejorScore) {
      mejorScore = score;
      mejor = p;
    }
  }
  return mejorScore >= SOLAPE_MIN ? mejor : null;
}

export interface CandidatoDB {
  nombre: string;
  correo: string;
  fuente: string;
}

/** Como matchPorNombre pero contra el universo pre-cargado (nombre, correo, fuente) de
 * postulantes_jc/mr -- ver universo_postulantes_panel_vivo() en Supabase. */
export function buscarCandidatoEnUniverso(
  nombreZoom: string,
  universo: CandidatoDB[]
): CandidatoDB | null {
  const nz = norm(nombreZoom);
  if (!nz) return null;
  const tz = tokensLargos(nz);
  let mejor: CandidatoDB | null = null;
  let mejorScore = 0;
  for (const c of universo) {
    const rnn = norm(c.nombre);
    if (rnn === nz) return c;
    const tr = tokensLargos(rnn);
    let score = 0;
    for (const t of tz) if (tr.has(t)) score++;
    if (score > mejorScore) {
      mejorScore = score;
      mejor = c;
    }
  }
  return mejorScore >= SOLAPE_MIN ? mejor : null;
}

export interface Presencia {
  nombre: string;
  ultimo: string;
  ultimoMs: number;
}

/** {correo: {nombre, ultimo, ultimoMs}} de quien sigue adentro (joined>left) en CUALQUIERA de
 * los uuids dados. Excluye cuentas institucionales. Ver presentes_por_uuids() en
 * panel_logic.py para el porqué de agrupar por varios uuids (reconexiones). */
export function presentesPorUuids(live: EventoLive[], uuids: Set<string>): Map<string, Presencia> {
  const saldo = new Map<string, number>();
  const nombre = new Map<string, string>();
  const ultimo = new Map<string, string>();
  const ultimoMs = new Map<string, number>();
  for (const r of live) {
    if (!uuids.has(r.uuid)) continue;
    const correo = (r.correo ?? '').trim().toLowerCase();
    if (!correo || correo.endsWith(INSTITUCIONAL_SUFIJO)) continue;
    const delta = r.evento === 'joined' ? 1 : r.evento === 'left' ? -1 : 0;
    saldo.set(correo, (saldo.get(correo) ?? 0) + delta);
    if ((r.nombre ?? '').trim()) nombre.set(correo, r.nombre!.trim());
    const hb = (r.hora_bogota ?? '').trim();
    if (hb) ultimo.set(correo, hb);
    const ms = r.hora_ms ?? 0;
    if (ms > (ultimoMs.get(correo) ?? 0)) ultimoMs.set(correo, ms);
  }
  const out = new Map<string, Presencia>();
  for (const [correo, n] of saldo) {
    if (n > 0) {
      out.set(correo, {
        nombre: nombre.get(correo) ?? '',
        ultimo: ultimo.get(correo) ?? '',
        ultimoMs: ultimoMs.get(correo) ?? 0,
      });
    }
  }
  return out;
}
