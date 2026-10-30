// Vistas públicas de JC-ON (esquema `jcon` de Supabase, separado de las tablas JC/MR de `public`).
// Mismo proyecto y anon key que lib/api.ts; el esquema se elige con el header Accept-Profile.
// Solo agregados: las tablas con PII de `jcon` tienen RLS sin políticas (anon recibe 401).
// SQL y carga: repo de automatizaciones → scripts/jc-on-transicion/panel/.

import { ANON_KEY, URL_BASE } from './api';

async function leerJcon<T>(recurso: string): Promise<T[]> {
  const resp = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Accept-Profile': 'jcon' },
  });
  if (!resp.ok) throw new Error(`Supabase jcon/${recurso}: HTTP ${resp.status}`);
  return resp.json();
}

// Todas las vistas traen una fila por combinación de filtro (002_vistas_filtro_jcon.sql):
// ciudad_f ∈ {BAQ, BOG, CAL, CTG, MED, 'todas'} × anio_f ∈ {2019…2025, 'todos'}.
// El panel elige la fila del filtro activo (no suma celdas). Sin ocultar grupos < 5 (2026-10-26);
// null solo cuando aún no hay dato (p. ej. asistencia antes de la primera clase).
interface Filtro {
  cohorte_jcon: string;
  ciudad_f: string;
  anio_f: string;
}

export interface JconResumen extends Filtro {
  inscritos: number | null;
  manana: number | null;
  tarde: number | null;
  anios_jc: number;
  con_demografia: number | null;
  clases: number;
  asistencia_promedio_pct: number | null;
  actualizado: string | null;
}

// dimension: anio_jc | horario | genero | edad_rango | ciudad.
export interface JconDemografia extends Filtro {
  dimension: string;
  categoria: string;
  total: number | null;
  total_dimension: number;
}

export interface JconAsistenciaClase extends Filtro {
  clase_id: number;
  fecha: string;
  horario: string | null;
  tema: string | null;
  inscritos: number | null;
  asistentes: number | null;
  // Estudiantes del grupo que entraron SOLO a la sala del otro grupo (migración 004); ya cuentan en `asistentes`.
  colados?: number | null;
}

// dimension: anio_jc | horario | genero | ciudad.
export interface JconAsistenciaGrupo extends Filtro {
  dimension: string;
  categoria: string;
  estudiantes: number | null;
  pct_asistencia: number | null;
}

// Población del botón de Asistencia/Tiempo (migración 005): 'todos' = todas las entradas, 'propia' = entró a
// la sala de su grupo, 'colados' = entró a la sala del otro grupo.
export type Poblacion = 'todos' | 'propia' | 'colados';

// Tiempo por clase y población: cuántos entraron y cuánto se quedaron (minutos y % de la duración).
export interface JconTiempoClase extends Filtro {
  clase_id: number;
  fecha: string;
  horario: string | null;
  tema: string | null;
  poblacion: Poblacion;
  asistentes: number;
  duracion_min: number | null;
  minutos_prom: number | null;
  permanencia_prom_pct: number | null;
  menos_25: number;
  de_25_a_49: number;
  de_50_a_79: number;
  de_80_o_mas: number;
}

// Por grupo (dimension: anio_jc | horario | genero | ciudad) y población.
export interface JconTiempoGrupo extends Filtro {
  dimension: string;
  categoria: string;
  poblacion: Poblacion;
  total: number;
  entraron: number;
  entradas: number;
  minutos_prom: number | null;
  permanencia_prom_pct: number | null;
}

export interface DatosJcon {
  resumen: JconResumen[];
  demografia: JconDemografia[];
  asistenciaClase: JconAsistenciaClase[];
  asistenciaGrupo: JconAsistenciaGrupo[];
  tiempoClase: JconTiempoClase[];
  tiempoGrupo: JconTiempoGrupo[];
}

export async function cargarJcon(): Promise<DatosJcon> {
  // Las vistas de tiempo (005) son opcionales: si aún no existen, el panel sigue funcionando sin ellas.
  const opcional = <T,>(recurso: string) => leerJcon<T>(recurso).catch(() => [] as T[]);
  const [resumen, demografia, asistenciaClase, asistenciaGrupo, tiempoClase, tiempoGrupo] = await Promise.all([
    leerJcon<JconResumen>('v_pub_resumen_filtro?order=cohorte_jcon.desc'),
    leerJcon<JconDemografia>('v_pub_demografia_filtro'),
    leerJcon<JconAsistenciaClase>('v_pub_asistencia_clase_filtro?order=fecha.asc'),
    leerJcon<JconAsistenciaGrupo>('v_pub_asistencia_grupo_filtro'),
    opcional<JconTiempoClase>('v_pub_tiempo_clase_filtro'),
    opcional<JconTiempoGrupo>('v_pub_tiempo_grupo_filtro'),
  ]);
  return { resumen, demografia, asistenciaClase, asistenciaGrupo, tiempoClase, tiempoGrupo };
}

export const ETIQUETA_HORARIO: Record<string, string> = {
  manana: 'Mañana (10:00 a 12:00)',
  tarde: 'Tarde (2:00 a 4:00 p. m.)',
};
