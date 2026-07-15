// Cliente mínimo de las vistas públicas de Supabase (solo agregados, sin PII).
// El anon key es público por diseño: RLS solo deja leer agregados y las vistas v_*.
// Overridable por env en build (NEXT_PUBLIC_*) — defaults del proyecto panel-datos-rofe.

const URL_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://kbxptoowtnteflhrfwid.supabase.co';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtieHB0b293dG50ZWZsaHJmd2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MzU4MDUsImV4cCI6MjA5OTIxMTgwNX0.xfj_GJYdRgPHUCpyxReKm7G7SMGTVn4oscDhakV6DSo';

async function leer<T>(recurso: string): Promise<T[]> {
  const resp = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!resp.ok) throw new Error(`Supabase ${recurso}: HTTP ${resp.status}`);
  return resp.json();
}

export interface CohorteStats {
  cohorte: string;
  programa: 'jc' | 'mr' | 'stand';
  total_participantes: number;
  con_emprendimiento: number;
  sin_emprendimiento: number;
  porcentaje_con_emprendimiento: string | null;
  edad_promedio: string | null;
  computed_at: string;
}

export interface CursoCompletion {
  curso: string;
  cohorte: string;
  matriculados: number;
  completados: number;
  en_progreso: number;
  sin_iniciar: number;
  pct_completados: string | null;
  promedio_avance: string | null;
  programa: 'jc' | 'mr' | 'stand' | null;
}

export interface ProgramaStats {
  programa: 'jc' | 'mr' | 'stand';
  participantes: number;
  matriculas: number;
  completadas: number;
  promedio_avance: string | null;
  cohorte: string;
}

export interface HistorialCurso {
  fecha: string;
  curso: string;
  programa: 'jc' | 'mr' | 'stand' | null;
  matriculados: number;
  promedio_avance: string | null;
  completados: number | null;
  fuente: string;
}

export interface DemografiaGrupo {
  grupo_ciudad: string;
  total: number;
  edad_promedio: string | null;
  mujeres: number;
  hombres: number;
  otros_genero: number;
}

export interface EmprendimientoSituacion {
  situacion: string;
  total: number;
}

export interface EmprendimientoVsCursos {
  situacion: string;
  participantes: number;
  prom_cursos_completados: string | null;
  prom_avance: string | null;
}

export interface EdadDistribucion {
  rango: string;
  orden: number;
  total: number;
}

// cohorte_ingresos: total canónico de ingresados por cohorte × programa (fuente
// docs/aprobacion/data.json — cohorte completa: activos + retirados, sin perfiles de
// prueba ni retiros institucionales). JC 2026 = 832.
export interface CohorteIngresos {
  cohorte: string;
  programa: 'jc' | 'mr' | 'stand';
  ingresados: number;
  activos: number;
  retirados: number;
  pct_aprobados?: number | string | null;
}

// v_cohorte_estudiantes: desglose de ESTUDIANTES (personas únicas) por estado de avance —
// complementa aprobacion_cursos, que cuenta MATRÍCULAS. Solo conteos agregados, sin PII.
// Los retirados no salen aquí (sin enrollments); se toman de cohorte_ingresos.
export interface CohorteEstudiantes {
  cohorte: string;
  programa: 'jc' | 'mr' | 'stand';
  activos: number;
  al_dia: number;
  en_progreso: number;
  en_riesgo: number;
  prom_cursos_aprobados: number | string | null;
  prom_cursos_inscritos: number | string | null;
}

// v_cohorte_estudiantes_distribucion: cuántos estudiantes han aprobado N cursos (>80%) en la
// cohorte. Complementa la vista por curso (matrículas). Solo conteos agregados, sin PII.
export interface CohorteEstudiantesDistribucion {
  cohorte: string;
  programa: 'jc' | 'mr' | 'stand';
  cursos_aprobados: number;
  estudiantes: number;
}

// aprobacion_cursos: avance de la cohorte COMPLETA por curso (cursaron = activos + retirados)
export interface AprobacionCurso {
  cohorte: string;
  curso: string;
  programa: 'jc' | 'mr' | 'stand' | null;
  cursaron: number;
  activos: number;
  aprobados: number;
  aprobados_retirados: number;
  retirados: number;
  banda_0_25: number | null;
  banda_26_80: number | null;
  banda_81_100: number | null;
  aprobados_total: number | null;
  no_aprobados: number | null;
  sin_finalizar: number | null;
  promedio: string | null;
  pct_aprobados: string | null;
  finalizado: boolean | null;
}

// v_mr_demografia: agregados sociodemográficos de Mujeres ROFÉ (fuente BD-Mujeres ROFÉ).
// Formato largo: una fila por (dimension, categoria).
export interface MrDemografia {
  dimension:
    | 'estado_civil'
    | 'nivel_estudio'
    | 'tipo_vivienda'
    | 'estrato'
    | 'edad_rango'
    | 'emprendimiento';
  categoria: string;
  total: number;
}

// Datos filtrados por ciudad (JC solamente)
export interface CursoCompletionPorCiudad {
  curso: string;
  cohorte: string;
  programa: 'jc' | 'mr' | 'stand' | null;
  grupo_ciudad: string;
  matriculados: number;
  completados: number;
  promedio_avance: string | null;
  pct_completados: string | number | null; // Viene de Supabase como string, convertir en frontend
}

export interface ProgramaStatsPorCiudad {
  grupo_ciudad: string;
  participantes: number;
  matriculas: number;
  completadas: number;
  promedio_avance: string | null;
  con_emprendimiento: number;
}

// Emprendimiento por ciudad (JC solamente)
export interface EmprendimientoPorCiudad {
  grupo_ciudad: string;
  situacion: string;
  total: number;
}

// historial_cursos_ciudad: serie de tiempo por ciudad. Snapshot diario del ETL.
// Arranca 2026-07-14 — el histórico anterior no tiene dimensión ciudad y no es reconstruible.
export interface HistorialPorCiudad {
  fecha: string;
  curso: string;
  grupo_ciudad: string;
  programa: 'jc' | 'mr' | 'stand' | null;
  cohorte: string | null;
  matriculados: number | null;
  promedio_avance: string | number | null;
  completados: number | null;
}

// Emoflow: ingresos al sistema como proxy de uso/engagement. Solo JC, solo cohorte actual
// (la fuente no tiene dimensión de cohorte). Cubre 757 de 777 estudiantes (97%).
export interface EmoflowResumen {
  participantes: number;
  con_match_supabase: number;
  ingresos_promedio: string | number | null;
  ingresos_mediana: number | null;
  ingresos_max: number | null;
  activos_7d: number;
  activos_14d: number;
  inactivos_30d: number;
  fecha_corte: string | null;
}

export interface EmoflowPorCiudad {
  grupo_ciudad: string;
  participantes: number;
  ingresos_promedio: string | number | null;
  ingresos_mediana: number | null;
  activos_7d: number;
  inactivos_30d: number;
}

// historial_emoflow: snapshot diario de los agregados nacionales de Emoflow (sin PII).
// Serie de tiempo — arranca 2026-07-15, crece un punto por día con el sync diario.
export interface HistorialEmoflow {
  fecha: string;
  participantes: number;
  ingresos_promedio: number | string | null;
  activos_7d: number;
  inactivos_30d: number;
  fuente: string;
}

export interface EmoflowBanda {
  banda: string;
  orden: number;
  participantes: number;
  ingresos_promedio: string | number | null;
  avance_promedio: string | number | null;
  pct_aprobacion: string | number | null;
}

// Mismas bandas desglosadas por ciudad — sin esto, con una ciudad elegida el gráfico
// mostraría cifras NACIONALES dentro de una vista de ciudad.
export interface EmoflowBandaCiudad extends EmoflowBanda {
  grupo_ciudad: string;
}

export interface Datos {
  cohorte: CohorteStats[];
  cursos: CursoCompletion[];
  cursosPorCiudad: CursoCompletionPorCiudad[];
  demografia: DemografiaGrupo[];
  statsProgramaPorCiudad: ProgramaStatsPorCiudad[];
  emprendimiento: EmprendimientoSituacion[];
  emprendimientoPorCiudad: EmprendimientoPorCiudad[];
  empVsCursos: EmprendimientoVsCursos[];
  edades: EdadDistribucion[];
  programas: ProgramaStats[];
  historial: HistorialCurso[];
  historialPorCiudad: HistorialPorCiudad[];
  mrDemografia: MrDemografia[];
  ingresos: CohorteIngresos[];
  aprobacion: AprobacionCurso[];
  estudiantes: CohorteEstudiantes[];
  estudiantesDist: CohorteEstudiantesDistribucion[];
  emoflowResumen: EmoflowResumen[];
  emoflowPorCiudad: EmoflowPorCiudad[];
  emoflowBandas: EmoflowBanda[];
  emoflowBandasCiudad: EmoflowBandaCiudad[];
  historialEmoflow: HistorialEmoflow[];
}

export async function cargarTodo(): Promise<Datos> {
  const [cohorte, cursos, cursosPorCiudad, demografia, statsProgramaPorCiudad, emprendimiento, emprendimientoPorCiudad, empVsCursos, edades, programas, historial, historialPorCiudad, mrDemografia, ingresos, aprobacion, estudiantes, estudiantesDist, emoflowResumen, emoflowPorCiudad, emoflowBandas, emoflowBandasCiudad, historialEmoflow] =
    await Promise.all([
      leer<CohorteStats>('cohorte_stats'),
      leer<CursoCompletion>('v_curso_completion?order=matriculados.desc'),
      leer<CursoCompletionPorCiudad>('v_curso_completion_por_ciudad?order=matriculados.desc'),
      leer<DemografiaGrupo>('v_demografia_grupo?order=total.desc'),
      leer<ProgramaStatsPorCiudad>('v_programa_stats_por_ciudad?order=participantes.desc'),
      leer<EmprendimientoSituacion>('v_emprendimiento_situacion'),
      leer<EmprendimientoPorCiudad>('v_emprendimiento_por_ciudad'),
      leer<EmprendimientoVsCursos>('v_emprendimiento_vs_cursos'),
      leer<EdadDistribucion>('v_edad_distribucion?order=orden.asc'),
      leer<ProgramaStats>('v_programa_stats'),
      leer<HistorialCurso>('historial_cursos?order=fecha.asc&limit=5000'),
      leer<HistorialPorCiudad>('historial_cursos_ciudad?order=fecha.asc&limit=5000'),
      leer<MrDemografia>('v_mr_demografia?order=total.desc'),
      leer<CohorteIngresos>('cohorte_ingresos'),
      leer<AprobacionCurso>('aprobacion_cursos?order=cursaron.desc'),
      leer<CohorteEstudiantes>('v_cohorte_estudiantes'),
      leer<CohorteEstudiantesDistribucion>('v_cohorte_estudiantes_distribucion?order=cursos_aprobados.asc'),
      leer<EmoflowResumen>('v_emoflow_resumen'),
      leer<EmoflowPorCiudad>('v_emoflow_por_ciudad?order=participantes.desc'),
      leer<EmoflowBanda>('v_emoflow_bandas?order=orden.asc'),
      leer<EmoflowBandaCiudad>('v_emoflow_bandas_ciudad?order=orden.asc'),
      leer<HistorialEmoflow>('historial_emoflow?order=fecha.asc'),
    ]);
  return { cohorte, cursos, cursosPorCiudad, demografia, statsProgramaPorCiudad, emprendimiento, emprendimientoPorCiudad, empVsCursos, edades, programas, historial, historialPorCiudad, mrDemografia, ingresos, aprobacion, estudiantes, estudiantesDist, emoflowResumen, emoflowPorCiudad, emoflowBandas, emoflowBandasCiudad, historialEmoflow };
}

export const NOMBRE_PROGRAMA: Record<string, string> = {
  jc: 'Jóvenes creaTIvos',
  mr: 'Mujeres ROFÉ',
};

export const ETIQUETA_SITUACION: Record<string, string> = {
  en_marcha: 'Emprendimiento en marcha',
  idea: 'Tiene una idea de negocio',
  interesado: 'Le interesa emprender',
  no_interesado: 'Prefiere buscar empleo',
};

export const ORDEN_SITUACION = ['en_marcha', 'idea', 'interesado', 'no_interesado'];

// Etiquetas en femenino para las categorías de v_mr_demografia (los enums de la BD
// son genéricos — soltero, arrendado — pero la población MR es de mujeres).
export const ETIQUETA_MR: Record<string, string> = {
  soltero: 'Soltera',
  casado: 'Casada',
  'unión_libre': 'Unión libre',
  divorciado: 'Divorciada/Separada',
  otro: 'Otro',
  primaria: 'Primaria',
  secundaria: 'Bachillerato',
  'técnico': 'Técnica/Tecnóloga',
  profesional: 'Profesional',
  postgrado: 'Postgrado',
  arrendado: 'Arrendada',
  familiar: 'Familiar',
  propia: 'Propia',
  con_emprendimiento: 'Con emprendimiento',
  sin_emprendimiento: 'Sin emprendimiento',
};

// Orden de presentación dentro de cada dimensión (las no listadas van por total desc).
export const ORDEN_MR: Record<string, string[]> = {
  nivel_estudio: ['primaria', 'secundaria', 'técnico', 'profesional', 'postgrado'],
  estrato: ['1', '2', '3', '4', '5', '6'],
  edad_rango: ['18-25', '26-35', '36-45', '46-60', '60+'],
};

// Grupos operativos JC (BD de monitorias usa acrónimos) → nombre de ciudad completo
export const ETIQUETA_GRUPO: Record<string, string> = {
  BAQ: 'Barranquilla',
  BOG: 'Bogotá',
  CAL: 'Cali',
  CTG: 'Cartagena',
  MED: 'Medellín',
  GYL: 'Guayaquil',
  QTO: 'Quito',
  PAN: 'Panamá',
  UY: 'Uruguay',
};
