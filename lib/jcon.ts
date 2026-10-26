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

export interface JconResumen {
  cohorte_jcon: string;
  inscritos: number;
  manana: number;
  tarde: number;
  retirados: number;
  anios_jc: number;
  con_demografia: number;
  clases: number;
  asistencia_promedio_pct: number | null;
  actualizado: string | null;
}

// dimension: anio_jc | horario | genero | edad_rango | ciudad. total null = grupo < 5 (oculto).
export interface JconDemografia {
  cohorte_jcon: string;
  dimension: string;
  categoria: string;
  total: number | null;
  total_dimension: number;
}

export interface JconAsistenciaClase {
  cohorte_jcon: string;
  clase_id: number;
  fecha: string;
  horario: string | null;
  tema: string | null;
  inscritos: number;
  asistentes: number;
}

// dimension: anio_jc | horario | genero | ciudad. Nulls = grupo < 5 (oculto).
export interface JconAsistenciaGrupo {
  cohorte_jcon: string;
  dimension: string;
  categoria: string;
  estudiantes: number | null;
  pct_asistencia: number | null;
}

export interface DatosJcon {
  resumen: JconResumen[];
  demografia: JconDemografia[];
  asistenciaClase: JconAsistenciaClase[];
  asistenciaGrupo: JconAsistenciaGrupo[];
}

export async function cargarJcon(): Promise<DatosJcon> {
  const [resumen, demografia, asistenciaClase, asistenciaGrupo] = await Promise.all([
    leerJcon<JconResumen>('v_pub_resumen?order=cohorte_jcon.desc'),
    leerJcon<JconDemografia>('v_pub_demografia'),
    leerJcon<JconAsistenciaClase>('v_pub_asistencia_clase?order=fecha.asc'),
    leerJcon<JconAsistenciaGrupo>('v_pub_asistencia_grupo'),
  ]);
  return { resumen, demografia, asistenciaClase, asistenciaGrupo };
}

export const ETIQUETA_HORARIO: Record<string, string> = {
  manana: 'Mañana (10:00 a 12:00)',
  tarde: 'Tarde (2:00 a 4:00 p. m.)',
};
