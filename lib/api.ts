// Cliente mínimo de las vistas públicas de Supabase (solo agregados, sin PII).
// El anon key es público por diseño: RLS solo deja leer agregados y las vistas v_*.
// Overridable por env en build (NEXT_PUBLIC_*) — defaults del proyecto panel-datos-rofe.

const URL_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://kbxptoowtnteflhrfwid.supabase.co';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtieHB0b293dG50ZWZsaHJmd2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MzU4MDUsImV4cCI6MjA5OTIxMTgwNX0.xfj_GJYdRgPHUCpyxReKm7G7SMGTVn4oscDhakV6DSo';

// Webhook n8n (workflow `rerun-dispatcher`, en el droplet n8n.tocaunavida.org) para forzar el ETL manualmente desde el
// panel. La URL NO es secreta. La clave (header `x-rerun-key`) NUNCA se guarda aquí ni en el
// bundle: la escribe el usuario y vive solo en localStorage (ver components/BotonActualizar.tsx).
// Overridable por env en build.
export const WEBHOOK_RERUN =
  process.env.NEXT_PUBLIC_WEBHOOK_RERUN ??
  'https://n8n.tocaunavida.org/webhook/rerun-pipeline';

async function leer<T>(recurso: string): Promise<T[]> {
  const resp = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!resp.ok) throw new Error(`Supabase ${recurso}: HTTP ${resp.status}`);
  return resp.json();
}

// Igual que leer() pero NUNCA rompe el panel: si el recurso no existe todavía (ej. una vista
// pública recién agregada que aún no se aplicó en Supabase) devuelve [] en vez de lanzar. Se usa
// para vistas nuevas cuyo despliegue de datos va por detrás del despliegue del frontend.
async function leerSeguro<T>(recurso: string): Promise<T[]> {
  try {
    return await leer<T>(recurso);
  } catch {
    return [];
  }
}

// PostgREST corta en 1000 filas por request (aunque se pida limit mayor). Para tablas
// grandes paginamos con el header Range hasta traer todo — si no, se pierden filas
// (justo las más recientes cuando el orden es fecha.asc).
async function leerPaginado<T>(recurso: string, paso = 1000): Promise<T[]> {
  const out: T[] = [];
  let desde = 0;
  for (;;) {
    const resp = await fetch(`${URL_BASE}/rest/v1/${recurso}`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Range-Unit': 'items',
        Range: `${desde}-${desde + paso - 1}`,
      },
    });
    if (!resp.ok && resp.status !== 206) {
      throw new Error(`Supabase ${recurso}: HTTP ${resp.status}`);
    }
    const lote = (await resp.json()) as T[];
    out.push(...lote);
    if (lote.length < paso) break;
    desde += paso;
  }
  return out;
}

// leerPaginado() + nunca rompe el panel (mismo motivo que leerSeguro). Usar para cualquier
// vista nueva que pueda pasar de 1000 filas Y cuyo despliegue de datos pueda ir por detrás
// del despliegue del frontend.
async function leerSeguroPaginado<T>(recurso: string, paso = 1000): Promise<T[]> {
  try {
    return await leerPaginado<T>(recurso, paso);
  } catch {
    return [];
  }
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

// v_mr_curso_normalizado (migración 061, pedido 2026-08-31): las 5 rutas reales de MR
// (Q10 reutiliza un nombre de curso distinto cada año para la misma ruta), fusionando los
// cursos×cohorte de v_curso_completion en un solo total por ruta -- SOLO para el caso
// "Mujeres ROFÉ + Todos los años" del tab Datos Q10 (el resto sigue con v_curso_completion,
// cada año ya muestra sus propios 4-5 cursos sin necesidad de fusionar). Trae AMBAS unidades
// para el toggle matrículas/individuo: `matriculados`/`completados` son filas de enrollments
// crudas (una mujer que repitió el mismo curso en 2 años cuenta 2 veces); `personas`/
// `personas_completadas` son headcount real (DISTINCT participant_id, cuenta 1 vez aunque
// haya repetido). leerSeguro porque es una vista nueva.
export interface CursoNormalizadoMr {
  curso: string;
  matriculados: number;
  completados: number;
  pct_completados: number | string | null;
  personas: number;
  personas_completadas: number;
  pct_personas_completadas: number | string | null;
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

// v_pub_aprobacion_ciudad_jc (migración 2026-08-26, auditoría panel-datos-etl.md): espejo de
// aprobacion_cursos/v_aprobacion_cursos_jc_ajustado con grupo_ciudad — cierra el hueco de la
// vista canónica (cohorte vigente) que no tenía cómo responder al filtro de Ciudad. Solo JC
// (en_seguimiento_jc es un flag exclusivo de JC). k-anonimato: cursaron<5 -> toda la fila NULL
// (celda suprimida, no se pierde la fila). leerSeguro porque es una vista nueva.
export interface AprobacionCursoCiudad {
  cohorte: string;
  curso: string;
  programa: 'jc';
  grupo_ciudad: string;
  cursaron: number | null;
  activos: number | null;
  aprobados: number | null;
  aprobados_retirados: number | null;
  retirados: number | null;
  banda_0_25: number | null;
  banda_26_80: number | null;
  banda_81_100: number | null;
  aprobados_total: number | null;
  promedio: number | string | null;
  pct_aprobados: number | string | null;
}

// v_retiro_probable_jc: personas con en_seguimiento_jc=false — no aparecen en la pestaña
// Seguimiento del Sheet pero Q10 aún no las marca retiradas oficialmente. Alerta de retiro
// PENDIENTE DE CONFIRMAR, complementaria a cohorte_ingresos.retirados (oficial), no lo
// reemplaza. Solo JC. Ver docs/procesos/supabase-estructura.md.
export interface RetiroProbableJc {
  cohorte: string;
  retiro_probable_total: number;
  retiro_probable_aprobado: number;
  retiro_probable_no_aprobado: number;
  avance_promedio: string | number | null;
}

// v_aprobacion_cursos_jc_ajustado: espejo de aprobacion_cursos (mismas columnas) pero
// recalculado desde enrollments + en_seguimiento_jc en vez del pipeline Q10. Sirve como
// verificación cruzada — si algún día vuelve a divergir de aprobacion_cursos (ej. por un
// sync atrasado, como pasó el 2026-07-23), la diferencia queda visible en el panel.
export interface AprobacionCursoAjustado {
  cohorte: string;
  curso: string;
  programa: 'jc';
  cursaron: number;
  activos: number;
  aprobados: number;
  aprobados_retirados: number;
  retirados: number;
  banda_0_25: number;
  banda_26_80: number;
  banda_81_100: number;
  aprobados_total: number;
  promedio: string | number | null;
  pct_aprobados: string | number | null;
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

// emoflow_participacion_semanal: % de participación (Completado/Real) por ciudad, del bloque
// EMOFLOW de la pestaña Estadísticas (BD Seguimiento de Monitorias). Snapshot diario — arranca
// 2026-07-15; el mismo número de semana se re-lee varios días para capturar el avance intra-semana.
// emoflow_actividad_semanal: actividad SEMANAL real por ciudad, derivada del CSV de Emoflow
// (usuarios activos únicos por semana / roster de la ciudad). Semana etiquetada por su lunes.
// Reemplaza la participación semanal que venía de la hoja de monitorías (fuente externa).
export interface EmoflowActividadSemanal {
  semana_inicio: string;
  grupo_ciudad: string;
  usuarios_activos: number;
  roster: number;
  pct_activos: number | string;
  fuente: string;
}

// emoflow_ingresos_diario: serie DIARIA REAL de ingresos por ciudad (+ NACIONAL),
// derivada de los timestamps del CSV de registro-ingresos de Emoflow. Arranca 2026-03-18.
// Reemplaza el backfill plano de historial_emoflow (que repetía un mismo valor).
export interface EmoflowIngresoDiario {
  fecha: string;
  grupo_ciudad: string;
  ingresos: number;
  usuarios_activos: number;
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

// v_pub_geografia: programa x cohorte x grupo_ciudad x municipio, con supresión de celdas
// chicas (n<5, decisión de Lina 2026-07-30) agrupadas como "Área metropolitana". A diferencia
// de v_programa_stats_por_ciudad (solo JC), esta vista cubre ambos programas — es la que
// habilita el drill-down de municipio dentro de un grupo_ciudad.
export interface GeografiaMunicipio {
  programa: 'jc' | 'mr' | 'stand';
  cohorte: string;
  grupo_ciudad: string;
  municipio: string;
  personas: number;
  avance_promedio: string | number | null;
  aprobados: number;
}

// v_frescura: hace cuánto se actualizó cada proceso del pipeline. Un número correcto sin
// fecha es tan engañoso como uno equivocado (ver diccionario-metricas.md).
export interface Frescura {
  proceso: string;
  horas_desde_ultimo: string | number;
  vencido: boolean;
}

// ---------------------------------------------------------------------------------------
// Fase 1/2 del rediseño (plan-rediseno-panel-datos-2026-07-30.md, migración 037): backend
// del filtro global "Estado" (Activos/Todos/Retirados). Interfaces + llamadas nuevas.
// Las llamadas viejas (v_demografia_grupo, v_mr_demografia, v_edad_distribucion,
// v_emprendimiento_*) se mantienen SIN TOCAR hasta confirmar que las nuevas cuadran exacto
// (mismo principio de verificación cruzada usado con v_pub_avance, que encontró una vista
// duplicada — ver 036_fix_v_pub_avance_duplicado.sql). Todavía no se consumen desde
// app/page.tsx — eso es Fase 3.
// ---------------------------------------------------------------------------------------

// v_pub_demografia: formato LARGO (no una columna por dimensión) — decisión de diseño de la
// Fase 1: cruzar género×edad×estrato×civil×estudio×vivienda por persona rompía el criterio
// de k-anonimato (n<5) que ya usa v_demografia_grupo/v_pub_geografia. `total=null` = celda
// suprimida. Hasta 2026-08-05, estrato/estado_civil/nivel_estudio/tipo_vivienda solo traían
// filas para MR (JC no tenía ese dato capturado en Supabase) — desde 2026-08-06 JC también
// las tiene (ver docs/procesos/demografia-historica-jc.md en el repo admin-usable). La
// ausencia total de filas para un programa sigue siendo la señal de "no aplica" en el
// frontend, pero ya no se asume por programa — se decide con los datos reales que llegan.
export interface PubDemografia {
  programa: 'jc' | 'mr' | 'stand';
  cohorte: string;
  estado: 'activo' | 'retirado';
  grupo_ciudad: string | null;
  dimension:
    | 'genero'
    | 'edad_rango'
    | 'estrato'
    | 'estado_civil'
    | 'nivel_estudio'
    | 'tipo_vivienda';
  categoria: string;
  total: number | null;
}

// v_pub_segmento_poblacional_jc (migraciones 067/068): respuesta multivalor de Fase 1 para
// JC 2025/2026. `total=null` = celda suprimida por k-anonimato. `ninguna`, `no_respondio` y
// `sin_clasificar` son estados de respuesta y no categorías vulnerables inventadas.
export interface PubSegmentoPoblacional {
  programa: 'jc';
  cohorte: string;
  estado: 'activo' | 'retirado';
  grupo_ciudad: string | null;
  dimension: 'segmento_poblacional';
  categoria: string;
  total: number | null;
}

// v_pub_emprendimiento: solo JC tiene filas (situacion_emprendimiento es NULL en MR) — la
// ausencia total de filas programa=mr ES el "no aplica".
export interface PubEmprendimiento {
  programa: 'jc' | 'mr' | 'stand';
  cohorte: string;
  estado: 'activo' | 'retirado';
  grupo_ciudad: string | null;
  situacion: string;
  total: number | null;
  prom_cursos_completados: number | string | null;
  prom_avance: number | string | null;
}

// v_pub_asistencia: primera exposición pública de asistencia_promedio (antes solo PII vía
// panel_riesgo_gui.py). Cruce por email, mismo patrón que v_persona_360.
export interface PubAsistencia {
  programa: 'jc' | 'mr' | 'stand';
  cohorte: string;
  estado: 'activo' | 'retirado';
  grupo_ciudad: string | null;
  promedio: number | string | null;
  n_estudiantes: number | null;
}

// v_pub_seguimiento (migración 042): agregado público del flag `en_seguimiento_jc` (pestaña
// "Seguimiento" de la BD de Monitorias, recalculado en cada sync_sociodemograficos.py). JC-only,
// SOLO cohorte viva (NULL en MR/históricos → ausencia de filas = "no aplica"). `en_seguimiento_jc`
// true = la persona aparece esta semana en Seguimiento; false = ALERTA operativa (posible retiro
// aún no confirmado en Q10, por eso sigue "activa" en cohorte_ingresos). Solo agregados (n<5→null),
// sin PII — la ficha individual sigue exclusivamente en panel_control_gui.py (local).
export interface PubSeguimiento {
  programa: 'jc' | 'mr' | 'stand';
  cohorte: string;
  estado: 'activo' | 'retirado';
  // 'nacional' = rollup (total exacto, no se pierde por supresión por ciudad); 'ciudad' = desglose
  // por grupo_ciudad (n<5 → total null). Para el KPI de contraste usar SIEMPRE ambito='nacional'.
  ambito: 'nacional' | 'ciudad';
  grupo_ciudad: string | null;
  en_seguimiento_jc: boolean;
  total: number | null;
}

// v_pub_mr_universo (migración 054, propuesta 2026-08-26): agregado público del UNIVERSO
// COMPLETO de Mujeres ROFÉ (postulantes_mr: General+Inactivas+Plataforma MR+Cursos+Cursos%,
// TODAS, con y sin Q10) — equivalente público de la pestaña "👩 Mujeres ROFÉ" del panel de
// control local. NO discrimina por Q10 (pedido explícito): con_q10=false es la mayoría
// esperada (~89%), no un error — mostrarlo siempre al lado de con_q10=true, nunca solo.
// leerSeguro porque, como retencionCiudad/impactoFinancieroMr, la vista puede no existir
// aún si el frontend se despliega antes de aplicar la migración.
// Fix 2026-08-27 (bug real en producción, ver migración 057): la versión original agrupaba
// por (anio_registro x ciudad_norm x con_q10) — con 561 ciudades, cientos de celdas <5 se
// suprimían y sumar `total` (tratando NULL como 0) perdía 1.213 personas (24%) del KPI
// titular. `ambito` distingue 'nacional' (SIN ciudad_norm, casi sin supresión — usar SIEMPRE
// esto para el KPI titular, mismo patrón que PubSeguimiento) de 'ciudad' (con ciudad_norm,
// para filtrar una ciudad específica — ahí sí es esperable algo de supresión).
// Excepción 2026-08-27 (migración 058): en ambito='nacional', anio_registro='sin dato' NO se
// divide por con_q10 (con_q10 sale null en esa fila) -- eran 19 personas partidas en 4+15, la
// mitad de 4 quedaba bajo el umbral k-anonimato y se perdía. Fusionadas a propósito: se puede
// mostrar el total (19, seguro) pero no decir cuántas de esas 19 tienen Q10 sin arriesgar la
// celda chica. con_q10=null → sumar SIEMPRE al total, NUNCA a conQ10 ni a sinQ10 (ojo: `!null`
// es `true` en JS — hay que comparar `=== true` / `=== false` explícito, no negar directo).
export interface PubMrUniverso {
  ambito: 'nacional' | 'ciudad';
  anio_registro: string; // año de fecha_creacion (postulantes_mr), o 'sin dato'
  ciudad_norm: string | null; // null cuando ambito='nacional'
  con_q10: boolean | null; // null = "sin dato" de año, no distinguido a propósito (ver arriba)
  total: number | null; // null = supresión k-anonimato (n<5)
}

// v_pub_mr_demografia_universo (migración 056, 2026-08-27; +anio_registro en 059): demografía
// del universo COMPLETO de Mujeres ROFÉ (postulantes_mr, fuente_pestana='general' -- 5.111),
// NO Q10-gated -- a diferencia de v_mr_demografia/v_pub_impacto_financiero_mr, que solo ven a
// quien matriculó. Mismo formato largo que PubDemografia. Comparado contra el Power BI externo
// tocaunavida.org/reportes-mr (2026-08-26/27). dimension ∈ tipo_vivienda | estrato |
// nivel_estudio | estado_civil | edad_rango | ingresos_familiares | tipo_credito (categoria
// 'microcredito'|'icredit'). Filtrable por AÑO (anio_registro, misma derivación que
// v_pub_mr_universo) -- a propósito SIN ciudad: cruzar año x ciudad x 7 dimensiones perdía
// 32.4% de las personas a supresión k-anonimato (medido 2026-08-27), inaceptable (ver 059). El
// filtro de ciudad del panel solo aplica al KPI (v_pub_mr_universo), nunca aquí. leerSeguro por
// si el frontend se despliega antes que la vista.
export interface PubMrDemografiaUniverso {
  anio_registro: string;
  dimension: string;
  categoria: string;
  total: number | null;
}

// v_pub_mr_formacion_universo (migración 056, 2026-08-27): distribución del universo COMPLETO
// de MR por Nº de cursos completados (0 a 5+), TODOS los años juntos (pedido explícito: "un
// solo grupo", sin separar cohorte/año). "0" incluye a quien nunca tuvo matrícula Q10.
export interface PubMrFormacionUniverso {
  cursos_completados: string; // '0'..'4' | '5+'
  total: number | null;
}

// v_pub_retencion_ciudad (migración 046): retención por grupo_ciudad para la cohorte, agregada y
// k-anon (supresión si ingresados<5). activos = personas activas por ciudad (Seguimiento en la
// cohorte viva); retirados = retiros de esa cohorte cuyo participante tiene esa ciudad. Suman al
// canon (JC 2026: Σactivos=750, Σretirados=82). Habilita el ranking de ciudades por retención.
export interface RetencionCiudad {
  programa: 'jc' | 'mr' | 'stand';
  cohorte: string;
  grupo_ciudad: string;
  activos: number | null;
  retirados: number | null;
  ingresados: number | null;
  retencion_pct: number | string | null;
}

// v_pub_impacto_financiero_mr (migración 046, 2026-08-15): Fase 2 del plan de ampliación
// PBI externo (docs/procesos/plan-ampliacion-panel-datos-2026-08-10.md, repo admin-usable).
// Formato LARGO igual que PubDemografia. Solo MR (la vista ya filtra programa='mr').
// dimension='tiene_emprendimiento'|'tiene_credito' → categoria='si'|'no'.
// dimension='ingresos_familiares' → categoria = banda de texto libre capturada
// ("Menor a 1 SMLV", "Entre 1 y 2 SMLV", "Superior a 2 SMLV", etc.).
// "Sectores de emprendimiento" NO está — el dato no se captura (solo nombre de texto
// libre por persona), auditado y confirmado ausente el 2026-08-15 — no se inventa.
export interface PubImpactoFinancieroMr {
  cohorte: string;
  estado: 'activo' | 'retirado';
  grupo_ciudad: string | null;
  dimension: 'tiene_emprendimiento' | 'tiene_credito' | 'ingresos_familiares';
  categoria: string;
  total: number | null;
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
  geografiaMunicipio: GeografiaMunicipio[];
  frescura: Frescura[];
  // Fase 1/2 del rediseño (037) — ver sección de interfaces arriba.
  pubDemografia: PubDemografia[];
  segmentoPoblacional: PubSegmentoPoblacional[];
  pubEmprendimiento: PubEmprendimiento[];
  pubAsistencia: PubAsistencia[];
  pubSeguimiento: PubSeguimiento[];
  // Retención por ciudad (v_pub_retencion_ciudad, migración 046). Vacío hasta que la vista se
  // aplique en Supabase — la pestaña Retención lo detecta y muestra "en construcción".
  retencionCiudad: RetencionCiudad[];
  // Impacto financiero MR (Fase 2 ampliación, migración 046, 2026-08-15). leerSeguro por el
  // mismo motivo que retencionCiudad: si el frontend se despliega antes que la vista, no rompe.
  impactoFinancieroMr: PubImpactoFinancieroMr[];
  // Universo completo MR sin discriminar Q10 (v_pub_mr_universo, migración 054). leerSeguro
  // por el mismo motivo que retencionCiudad — vacío hasta que se aplique la vista.
  mrUniverso: PubMrUniverso[];
  // Aprobación canónica por ciudad, solo JC (v_pub_aprobacion_ciudad_jc, auditoría 2026-08-26).
  // leerSeguro por el mismo motivo que retencionCiudad.
  aprobacionCiudadJc: AprobacionCursoCiudad[];
  // Demografía + formación del universo COMPLETO MR, sin Q10 (migración 056, 2026-08-27).
  // leerSeguro por el mismo motivo que retencionCiudad.
  mrDemografiaUniverso: PubMrDemografiaUniverso[];
  mrFormacionUniverso: PubMrFormacionUniverso[];
  // v_mr_curso_normalizado (migración 061). leerSeguro por el mismo motivo que retencionCiudad.
  mrCursoNormalizado: CursoNormalizadoMr[];
  // v_pub_cohorte: canon oficial por cohorte (ingresados/activos/retirados/pct_aprobados).
  // Cerradas 2019–2025 desde cohorte_historico (culminantes+retirados=seleccionados); viva 2026
  // desde en_seguimiento_jc. Es la ÚNICA fuente con todos los años — cohorte_ingresos solo tiene
  // la viva. Se usa como fallback de `ingresos` para que las cohortes cerradas muestren el canon
  // (misma vista que panel_control_gui.py). NO recalcular por matrícula (contrato de datos).
  pubCohorte: CohorteIngresos[];
  // Emoflow serie diaria/semanal real + JC retiro probable/aprobación ajustada (producción jul-2026).
  emoflowActividadSemanal: EmoflowActividadSemanal[];
  emoflowDiario: EmoflowIngresoDiario[];
  retiroProbableJc: RetiroProbableJc[];
  aprobacionAjustada: AprobacionCursoAjustado[];
  // Trío del filtro "Estado" para Emoflow: Activos=canonico (migración 011), Todos=sin sufijo,
  // Retirados=retirado (migración 037). Espejos canónicos restringidos a Seguimiento (742 vs 827).
  emoflowResumenCanonico: EmoflowResumen[];
  emoflowPorCiudadCanonico: EmoflowPorCiudad[];
  emoflowBandasCanonico: EmoflowBanda[];
  emoflowBandasCiudadCanonico: EmoflowBandaCiudad[];
  emoflowResumenRetirado: EmoflowResumen[];
  emoflowPorCiudadRetirado: EmoflowPorCiudad[];
  emoflowBandasRetirado: EmoflowBanda[];
  emoflowBandasCiudadRetirado: EmoflowBandaCiudad[];
}

export async function cargarTodo(): Promise<Datos> {
  const [cohorte, cursos, cursosPorCiudad, demografia, statsProgramaPorCiudad, emprendimiento, emprendimientoPorCiudad, empVsCursos, edades, programas, historial, historialPorCiudad, mrDemografia, ingresos, aprobacion, estudiantes, estudiantesDist, emoflowResumen, emoflowPorCiudad, emoflowBandas, emoflowBandasCiudad, historialEmoflow, geografiaMunicipio, frescura, pubDemografia, segmentoPoblacional, pubEmprendimiento, pubAsistencia, emoflowActividadSemanal, emoflowDiario, retiroProbableJc, aprobacionAjustada, emoflowResumenCanonico, emoflowPorCiudadCanonico, emoflowBandasCanonico, emoflowBandasCiudadCanonico, emoflowResumenRetirado, emoflowPorCiudadRetirado, emoflowBandasRetirado, emoflowBandasCiudadRetirado, pubSeguimiento, pubCohorte, retencionCiudad, impactoFinancieroMr, mrUniverso, aprobacionCiudadJc, mrDemografiaUniverso, mrFormacionUniverso, mrCursoNormalizado] =
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
      leer<GeografiaMunicipio>('v_pub_geografia?order=personas.desc'),
      leer<Frescura>('v_frescura'),
      leer<PubDemografia>('v_pub_demografia'),
      leerSeguro<PubSegmentoPoblacional>('v_pub_segmento_poblacional_jc'),
      leer<PubEmprendimiento>('v_pub_emprendimiento'),
      leer<PubAsistencia>('v_pub_asistencia'),
      leer<EmoflowActividadSemanal>('emoflow_actividad_semanal?order=semana_inicio.asc'),
      leerPaginado<EmoflowIngresoDiario>('emoflow_ingresos_diario?order=fecha.asc'),
      leer<RetiroProbableJc>('v_retiro_probable_jc'),
      leer<AprobacionCursoAjustado>('v_aprobacion_cursos_jc_ajustado?order=cursaron.desc'),
      leer<EmoflowResumen>('v_emoflow_resumen_canonico'),
      leer<EmoflowPorCiudad>('v_emoflow_por_ciudad_canonico?order=participantes.desc'),
      leer<EmoflowBanda>('v_emoflow_bandas_canonico?order=orden.asc'),
      leer<EmoflowBandaCiudad>('v_emoflow_bandas_ciudad_canonico?order=orden.asc'),
      leer<EmoflowResumen>('v_emoflow_resumen_retirado'),
      leer<EmoflowPorCiudad>('v_emoflow_por_ciudad_retirado?order=participantes.desc'),
      leer<EmoflowBanda>('v_emoflow_bandas_retirado?order=orden.asc'),
      leer<EmoflowBandaCiudad>('v_emoflow_bandas_ciudad_retirado?order=orden.asc'),
      leer<PubSeguimiento>('v_pub_seguimiento'),
      leer<CohorteIngresos>('v_pub_cohorte'),
      leerSeguro<RetencionCiudad>('v_pub_retencion_ciudad'),
      leerSeguro<PubImpactoFinancieroMr>('v_pub_impacto_financiero_mr'),
      // BUG REAL 2026-08-27: v_pub_mr_universo tiene 1.003 filas (992 ambito=ciudad + 11
      // ambito=nacional, la vista existe para poder filtrar por ciudad específica); con
      // leer() simple, PostgREST corta en 1000 y — como 'ciudad' < 'nacional' alfabéticamente
      // en el ORDER BY de la vista — se perdían 3 de las 11 filas 'nacional' (2023 sin Q10 y
      // todo 2022), bajando el KPI titular de 5.111 a 1.940. leerSeguroPaginado trae TODO.
      leerSeguroPaginado<PubMrUniverso>('v_pub_mr_universo'),
      leerSeguro<AprobacionCursoCiudad>('v_pub_aprobacion_ciudad_jc?order=cursaron.desc'),
      leerSeguro<PubMrDemografiaUniverso>('v_pub_mr_demografia_universo'),
      leerSeguro<PubMrFormacionUniverso>('v_pub_mr_formacion_universo'),
      leerSeguro<CursoNormalizadoMr>('v_mr_curso_normalizado?order=matriculados.desc'),
    ]);
  return { cohorte, cursos, cursosPorCiudad, demografia, statsProgramaPorCiudad, emprendimiento, emprendimientoPorCiudad, empVsCursos, edades, programas, historial, historialPorCiudad, mrDemografia, ingresos, aprobacion, estudiantes, estudiantesDist, emoflowResumen, emoflowPorCiudad, emoflowBandas, emoflowBandasCiudad, historialEmoflow, geografiaMunicipio, frescura, pubDemografia, segmentoPoblacional, pubEmprendimiento, pubAsistencia, emoflowActividadSemanal, emoflowDiario, retiroProbableJc, aprobacionAjustada, emoflowResumenCanonico, emoflowPorCiudadCanonico, emoflowBandasCanonico, emoflowBandasCiudadCanonico, emoflowResumenRetirado, emoflowPorCiudadRetirado, emoflowBandasRetirado, emoflowBandasCiudadRetirado, pubSeguimiento, pubCohorte, retencionCiudad, impactoFinancieroMr, mrUniverso, aprobacionCiudadJc, mrDemografiaUniverso, mrFormacionUniverso, mrCursoNormalizado };
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
  microcredito: 'Microcrédito',
  icredit: 'iCredit',
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
