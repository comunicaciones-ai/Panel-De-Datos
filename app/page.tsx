'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  cargarTodo,
  Datos,
  PubDemografia,
  PubEmprendimiento,
  PubMrUniverso,
  ETIQUETA_GRUPO,
  ETIQUETA_MR,
  ETIQUETA_SITUACION,
  NOMBRE_PROGRAMA,
  ORDEN_MR,
  ORDEN_SITUACION,
} from '@/lib/api';
import {
  C,
  GraficoAprobacion,
  GraficoBarras,
  GraficoCursos,
  GraficoEmprendimiento,
  GraficoHistorial,
} from '@/components/graficos';
import { motion } from 'framer-motion';
import { Hero } from '@/components/efectos/Hero';
import { BackgroundPaths } from '@/components/efectos/BackgroundPaths';
import { BotonActualizar } from '@/components/BotonActualizar';

type Programa = 'jc' | 'mr';
// Todas las secciones están siempre disponibles (rediseño 2026-08-03): cada tab decide
// internamente si tiene algo que mostrar o si debe explicar "No aplica" — ya no se ocultan
// tabs según programa/cohorte (ver §1.4 y §2.2 de plan-rediseno-panel-datos-2026-07-30.md).
type Tab = 'Resumen' | 'Retención' | 'Cursos' | 'Demografía' | 'Historial' | 'Emprendimiento' | 'Emoflow' | 'Asistencia';
const TABS: Tab[] = ['Resumen', 'Retención', 'Cursos', 'Demografía', 'Historial', 'Emprendimiento', 'Emoflow', 'Asistencia'];

// Filtro global "Estado" (migración 037): reemplaza la exposición pasiva de
// activos/retirados por un control real que se propaga a Resumen, Cursos, Demografía,
// Emprendimiento, Emoflow y Asistencia (Historial queda fuera — su fuente no tiene
// dimensión de retiro, ver §3 del plan).
type Estado = 'activos' | 'todos' | 'retirados';
const ETIQUETA_ESTADO: Record<Estado, string> = { activos: 'Activos', todos: 'Todos', retirados: 'Retirados' };

// Orden de despliegue de v_pub_demografia (dimension). Hasta 2026-08-05, estrato/estado_civil/
// nivel_estudio/tipo_vivienda solo traían filas para MR (JC no tenía ese dato capturado). Desde
// 2026-08-06, JC también las tiene (Mongo + archivo maestro + formularios Fase 1, ver
// docs/procesos/demografia-historica-jc.md) — la tarjeta ya no asume "no aplica" por programa,
// decide solo con si `v_pub_demografia` trae filas o no (`dimensionAplicaPrograma` abajo).
const DIMENSIONES_DEMOGRAFIA = [
  'genero',
  'edad_rango',
  'estrato',
  'estado_civil',
  'nivel_estudio',
  'tipo_vivienda',
] as const;

const ETIQUETA_DIMENSION: Record<string, string> = {
  genero: 'Género',
  edad_rango: 'Distribución de edad',
  estrato: 'Estrato socioeconómico',
  estado_civil: 'Estado civil',
  nivel_estudio: 'Nivel de estudios',
  tipo_vivienda: 'Tipo de vivienda',
};

// Orden de edad para JC (v_pub_demografia no trae una columna de orden numérico para esta
// dimensión — a diferencia de ORDEN_MR, que ya cubre el rango MR). Puramente de presentación,
// no requiere SQL nuevo.
const ORDEN_EDAD_JC = ['< 15', '15-17', '18-20', '21-24', '25+'];

const COLOR_SITUACION: Record<string, string> = {
  en_marcha: C.verde,
  idea: C.azul2,
  interesado: C.amarillo,
  no_interesado: C.naranja,
};

const COLOR_GENERO: Record<string, string> = {
  Femenino: C.naranja,
  Masculino: C.azul2,
};

// ── Histórico Q10 MR 2022-2026 — DATOS ESTÁTICOS, no vienen de Supabase ─────────────────
// Fuente: informe oficial de Mujeres ROFÉ (Excel entregado por Samuel, 2026-08-27), tabla
// "Comparativo". ADR del mismo día: seguimiento Q10 completo y auditado arranca en 2027;
// para 2022-2026 no hay data ni auditoría del proceso, así que se congela como foto fija en
// vez de intentar reconstruirlo con los datos parciales/desfasados que sí tenemos en
// Supabase (`courses`/`enrollments` solo cubren 2025-2026 de forma incompleta, ver
// docs/procesos/postulantes-mr-supabase.md en admin-usable — "Supabase MR histórico
// incompleto"). Nunca editar a mano sin volver a esa fuente.
//
// Semántica de cada campo (aclarada por Samuel, 2026-08-27):
//   bd          = BD total de ese año — OJO, es ACUMULATIVO (total de mujeres registradas
//                 hasta ese año, no las nuevas de ese año). El total real del universo es el
//                 del año MÁS RECIENTE (2026), nunca la suma de los 5 años (sumarlos infla el
//                 número varias veces, ver bug corregido 2026-08-27 en VistaUniversoMr: para
//                 "Todos" el KPI usa bd del último año, no Σbd).
//   inscritas  = veces que se inscribieron al curso (una mujer puede reinscribirse varias
//                veces al mismo curso a lo largo del año, no es headcount de personas único)
//   iniciados  = de esas inscripciones, cuántas SÍ entraron a la plataforma Q10 (equivalente
//                a "llegó a Bienvenida" — las inscritas que nunca llegaron a esto son las que
//                cuentan como "0 cursos" / nunca empezaron)
//   completados = culminantes reales del curso
//   "Asistentes" (columna del Excel) se descarta a propósito — no se usa acá.
//
// Corrección 2026-08-27 (mismo día, más tarde): bd de 2026 baja de 5110 a 5109 -- Samuel
// confirmó la baja de una participante el mismo día, ver
// docs/procesos/postulantes-mr-supabase.md en admin-usable, sección "Remoción puntual".
//
// Normalización 2026-08-31 (pedido de Samuel): el Excel oficial usa un nombre de curso
// DISTINTO cada año para la misma ruta (ej. "Emprendimiento" 2022 → "Taller de
// Emprendimiento..." 2023 → "De la idea a la acción..." 2024-2026) — son solo 4 rutas reales
// (5ta desde 2025: "Empoderamiento en Ventas..."), no cursos nuevos cada año. Se unificó el
// `nombre` de cada fila al literal usado en 2026 (el más reciente) en los 5 años, para que la
// tabla por curso y cualquier agrupación por nombre trate cada ruta como una sola serie en el
// tiempo. "Mindfulness" (solo 2022, sin equivalente en años posteriores) se deja tal cual.
type CursoHistoricoMr = { nombre: string; inscritas: number | null; iniciados: number | null; completados: number | null };
type AnioHistoricoMr = { anio: string; bd: number; cursos: CursoHistoricoMr[] };
const HISTORICO_Q10_MR: AnioHistoricoMr[] = [
  {
    anio: '2022', bd: 704, cursos: [
      { nombre: 'Habilidades Clave para Emprender con Propósito', inscritas: 121, iniciados: 24, completados: 4 },
      { nombre: 'De la idea a la acción, tu guía para emprender con éxito', inscritas: 120, iniciados: 22, completados: 10 },
      { nombre: 'Finanzas inteligentes, gestión para emprendedoras', inscritas: 111, iniciados: 9, completados: 9 },
      { nombre: 'Transforma tu negocio con estrategias digitales', inscritas: 96, iniciados: 7, completados: 5 },
      { nombre: 'Mindfulness', inscritas: 90, iniciados: 10, completados: 4 },
    ],
  },
  {
    anio: '2023', bd: 3311, cursos: [
      { nombre: 'Habilidades Clave para Emprender con Propósito', inscritas: 244, iniciados: 67, completados: 6 },
      { nombre: 'De la idea a la acción, tu guía para emprender con éxito', inscritas: 292, iniciados: 128, completados: 27 },
      { nombre: 'Finanzas inteligentes, gestión para emprendedoras', inscritas: 298, iniciados: 76, completados: 22 },
      { nombre: 'Transforma tu negocio con estrategias digitales', inscritas: 233, iniciados: 53, completados: 12 },
    ],
  },
  {
    anio: '2024', bd: 4322, cursos: [
      { nombre: 'Habilidades Clave para Emprender con Propósito', inscritas: 600, iniciados: 154, completados: 34 },
      { nombre: 'De la idea a la acción, tu guía para emprender con éxito', inscritas: 416, iniciados: 148, completados: 41 },
      { nombre: 'Finanzas inteligentes, gestión para emprendedoras', inscritas: 105, iniciados: 35, completados: 19 },
      { nombre: 'Transforma tu negocio con estrategias digitales', inscritas: 235, iniciados: 67, completados: 29 },
    ],
  },
  // 2025: UNIÓN de 3 fuentes (Consolidado oficial + 8 archivos "Astrid" en
  // Downloads/DATOS 2025 + Q10 directo vía Supabase, cruzados por cédula real), quedándose
  // con el valor MÁS GRANDE por curso x métrica (pedido explícito 2026-09-01: "no sabemos
  // qué discriminar, toda información nos es de utilidad"). `inscritas` no cambió en ningún
  // curso (el oficial ya era el máximo); `iniciados`/`completados` sí subieron donde la unión
  // real de personas (Astrid ∪ Supabase, resuelta por cédula) superó al oficial -- ver
  // tools/unir_fuentes_2025.py. Es un PISO, no un dato auditado: cada fuente mide con un
  // criterio propio, unir así no reconcilia el porqué difieren, solo evita subestimar.
  {
    anio: '2025', bd: 4712, cursos: [
      { nombre: 'Habilidades Clave para Emprender con Propósito', inscritas: 268, iniciados: 80, completados: 43 },
      { nombre: 'De la idea a la acción, tu guía para emprender con éxito', inscritas: 334, iniciados: 85, completados: 43 },
      { nombre: 'Finanzas inteligentes, gestión para emprendedoras', inscritas: 155, iniciados: 83, completados: 41 },
      { nombre: 'Transforma tu negocio con estrategias digitales', inscritas: 108, iniciados: 47, completados: 32 },
      { nombre: 'Empoderamiento en Ventas: Lleva tu Negocio al Siguiente Nivel', inscritas: 182, iniciados: 70, completados: 60 },
    ],
  },
  {
    anio: '2026', bd: 5109, cursos: [
      { nombre: 'Habilidades Clave para Emprender con Propósito', inscritas: 246, iniciados: 86, completados: 67 },
      { nombre: 'De la idea a la acción, tu guía para emprender con éxito', inscritas: 133, iniciados: 88, completados: 46 },
      { nombre: 'Finanzas inteligentes, gestión para emprendedoras', inscritas: 179, iniciados: 56, completados: 44 },
      { nombre: 'Transforma tu negocio con estrategias digitales', inscritas: null, iniciados: null, completados: null },
      { nombre: 'Empoderamiento en Ventas: Lleva tu Negocio al Siguiente Nivel', inscritas: null, iniciados: null, completados: null },
    ],
  },
];

// ── Créditos — desembolso real, DATOS ESTÁTICOS ─────────────────────────────────────────
// Cifras oficiales de finanzas (mensaje de Samuel, 2026-08-27) — distintas de "Acceso a
// crédito" del tab Emprendimiento (esa cuenta personas en mr_microcreditos vinculadas a
// postulantes_mr; esta es el desembolso real reportado por el equipo financiero, no
// necesariamente calza persona a persona con lo que hay en Supabase hoy).
type CreditoHistoricoMr = { tipo: string; anio: string; beneficiadas: number; continuan: number; pctContinuan: number; nuncaPagaron: number };
const CREDITO_HISTORICO_MR: CreditoHistoricoMr[] = [
  { tipo: 'Microcrédito', anio: '2025', beneficiadas: 38, continuan: 25, pctContinuan: 66, nuncaPagaron: 13 },
  { tipo: 'iCredit', anio: '2024', beneficiadas: 25, continuan: 11, pctContinuan: 44, nuncaPagaron: 14 },
];

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
// "2026-07-20" → "20 de julio". Para el encabezado del resumen del día.
function fechaCortaEs(iso?: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return null;
  return `${d} de ${MESES_ES[m - 1]}`;
}

function Kpi({ titulo, valor, detalle, acento }: { titulo: string; valor: string; detalle?: string; acento?: string }) {
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

// Embudo Formación MR (pedido 2026-08-27): "0 cursos" aparte + una barra ancha = inscritos,
// con una barra azul MÁS ANGOSTA adentro = las que sí entraron a Q10 (iniciados), y dentro de
// esa una verde = las que aprobaron (completados). Mismo patrón visual pedido por Samuel:
// "bienvenida barra grande inscritos, barra azul dentro de la grande es la gente de Q10 y
// finalmente los aprobados". Todo a nivel de inscripción-instancia (no headcount único, igual
// que el resto de HISTORICO_Q10_MR) salvo `ceroCursos`, que sí usa el BD real (headcount).
function EmbudoFormacionMr(
  { titulo, ceroCursos, inscritos, iniciados, aprobados }:
  { titulo: string; ceroCursos: number; inscritos: number; iniciados: number; aprobados: number },
) {
  const pctIniciados = inscritos ? Math.min(100, (100 * iniciados) / inscritos) : 0;
  const pctAprobados = inscritos ? Math.min(100, (100 * aprobados) / inscritos) : 0;
  return (
    <div className="tarjeta-glass p-3">
      <p className="text-xs font-bold text-slate-600 mb-2">{titulo}</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-slate-200/70 bg-white/40 p-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">0 cursos</p>
          <p className="text-lg font-bold kpi-valor" style={{ color: C.rojo }}>{ceroCursos.toLocaleString('es-CO')}</p>
          <p className="text-[10px] text-slate-400">Nunca llegaron a Bienvenida</p>
        </div>
        <div className="rounded-lg border border-slate-200/70 bg-white/40 p-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Aprobados</p>
          <p className="text-lg font-bold kpi-valor" style={{ color: C.verde }}>{aprobados.toLocaleString('es-CO')}</p>
          <p className="text-[10px] text-slate-400">{pctAprobados.toFixed(1)}% de matrículas</p>
        </div>
      </div>
      <div className="relative h-8 w-full rounded-lg overflow-hidden" style={{ background: `${C.naranja}30` }}>
        <div
          className="absolute inset-y-0 left-0 rounded-lg transition-all"
          style={{ width: `${pctIniciados}%`, background: C.azul2 }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-lg transition-all"
          style={{ width: `${pctAprobados}%`, background: C.verde }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: `${C.naranja}90` }} />Matrículas {inscritos.toLocaleString('es-CO')}</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: C.azul2 }} />Entraron a Q10 {iniciados.toLocaleString('es-CO')} ({pctIniciados.toFixed(1)}%)</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: C.verde }} />Aprobaron {aprobados.toLocaleString('es-CO')} ({pctAprobados.toFixed(1)}%)</span>
      </div>
    </div>
  );
}

// Punto gris + cantidad "sin dato" (pedido 2026-08-28, Samuel: "¿por qué estas cifras no dan
// 5.100?" al notar que Edad/Ingresos familiares no suman el universo completo). Cada tarjeta
// de Demografía solo cuenta a quien SÍ tiene ese campo relleno -- el resto (nunca lo llenó) no
// aparecía en ningún lado, dejando la resta en silencio. Nunca ocultar esto (regla del
// rediseño §2.3, mismo espíritu que NoAplica/NotaFiltros): mejor un punto gris chiquito que
// una cifra que no cuadra sin explicación.
function PuntoSinDato({ cantidad, texto, className }: { cantidad: number; texto?: string; className?: string }) {
  if (cantidad <= 0) return null;
  return (
    <p className={`text-[11px] text-slate-400 flex items-center gap-1.5 ${className ?? 'mb-2'}`}>
      <span className="inline-block w-2 h-2 rounded-full bg-slate-300 shrink-0" />
      {texto ?? `${cantidad.toLocaleString('es-CO')} sin dato (nunca lo llenaron)`}
    </p>
  );
}

// Mini-tarjeta de un estado de la cohorte (aprobadas / en progreso / en riesgo / retiradas).
// Muestra el conteo, su % sobre el total de matrículas y un punto de color semáforo.
function EstadoStat(
  { etiqueta, valor, total, color, detalle }:
  { etiqueta: string; valor: number; total: number; color: string; detalle: string },
) {
  const pct = total ? (100 * valor) / total : 0;
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/40 p-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="text-xs font-semibold text-slate-600">{etiqueta}</span>
      </div>
      <p className="text-xl font-bold kpi-valor mt-1">{valor.toLocaleString('es-CO')}</p>
      <p className="text-xs text-slate-400">{pct.toFixed(1)}% · {detalle}</p>
    </div>
  );
}

// Color semáforo de una retención (%) para pintarla en los botones de ciudad: verde alto, ámbar
// medio, rojo bajo. Umbrales alineados con la lectura de riesgo del equipo.
function colorRetencion(pct: number): string {
  if (pct >= 90) return C.verde;
  if (pct >= 80) return C.naranja;
  return C.rojo;
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
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
function NoAplica({ motivo, suave = false }: { motivo: string; suave?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300/70 bg-white/20 p-5 text-center">
      <p className="text-sm text-slate-400">{suave ? 'Sin datos — ' : 'No aplica — '}{motivo}</p>
    </div>
  );
}

// Aviso "estamos trabajando en este panel" — para vistas cuyo dato existe pero el equipo aún no
// considera confiable para el segmento elegido (ej. demografía/emprendimiento por Retirados). NO
// dice "no existe" (sería falso): dice que se está validando. Ver docs/procesos/panel-datos-etl.
function EnConstruccion({ detalle }: { detalle: string }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-300/70 bg-amber-50/40 p-6 text-center">
      <p className="text-sm font-semibold text-amber-700">🚧 Estamos trabajando en este panel</p>
      <p className="text-sm text-slate-500 mt-1 max-w-xl mx-auto">{detalle}</p>
    </div>
  );
}

// Aviso corto y consistente para filtros globales (Estado/Ciudad/Municipio/Cohorte) que están
// visibles y clickeables en la barra superior pero NO tienen efecto en la pestaña activa —
// regla del rediseño (§2.3, ver NoAplica arriba): nunca dejar un control silenciosamente inerte,
// siempre decir por qué. Auditoría 2026-08-26 encontró varios de estos sin ningún aviso.
function NotaFiltros({ inaplicables }: { inaplicables: string[] }) {
  if (inaplicables.length === 0) return null;
  return (
    <p className="text-xs text-slate-400 mb-4">
      ℹ️ En esta pestaña no {inaplicables.length > 1 ? 'aplican' : 'aplica'}: {inaplicables.join(' · ')}.
    </p>
  );
}

// Suma `total` (respeta null = celda suprimida por k-anonimato, se ignora en vez de contarla
// como 0) por categoria, para una dimension de v_pub_demografia ya filtrada por
// programa/cohorte/estado/ciudad.
function agregarPorCategoria(filas: PubDemografia[], dimension: string) {
  const mapa = new Map<string, number>();
  filas
    .filter((f) => f.dimension === dimension && f.total != null)
    .forEach((f) => mapa.set(f.categoria, (mapa.get(f.categoria) ?? 0) + (f.total as number)));
  return mapa;
}

// ── Agregación "Todos los años" (pedido 2026-08-31, Mujeres ROFÉ: ya hay histórico real
// 2023-2026 tras el backfill con archivado=true, ver postulantes-mr-supabase.md). Las tablas
// cohorte-scoped (programas/cohorte/ingresos·pubCohorte/estudiantes) traen UNA fila por
// cohorte — sumarlas a mano en vez de promediar porcentajes ciegamente (mismo criterio que
// retencionPorCiudad ya usa más abajo: recalcular el % desde los conteos, no promediar %).
// Las tablas ya-listadas (cursos, aprobacion, demografía) NO necesitan esto — simplemente se
// deja de filtrar por cohorte y cada fila se distingue sola (Q10 reutiliza nombres de curso
// entre años, UNIQUE(nombre, cohorte), así que dos años del mismo curso son dos filas, no una
// que haya que fusionar).
function sumarProgramaStats(filas: { participantes: number; matriculas: number; completadas: number; promedio_avance: string | null; programa: 'jc' | 'mr' | 'stand'; cohorte: string }[]) {
  if (filas.length === 0) return undefined;
  const participantes = filas.reduce((s, p) => s + (p.participantes ?? 0), 0);
  const matriculas = filas.reduce((s, p) => s + (p.matriculas ?? 0), 0);
  const completadas = filas.reduce((s, p) => s + (p.completadas ?? 0), 0);
  const sumaPond = filas.reduce((s, p) => s + Number(p.promedio_avance ?? 0) * (p.matriculas ?? 0), 0);
  return {
    programa: filas[0].programa, cohorte: 'todos',
    participantes, matriculas, completadas,
    promedio_avance: matriculas ? (sumaPond / matriculas).toFixed(1) : null,
  };
}

function sumarCohorteStats(filas: { total_participantes: number; con_emprendimiento: number; sin_emprendimiento: number; edad_promedio: string | null; programa: 'jc' | 'mr' | 'stand'; cohorte: string; computed_at: string }[]) {
  if (filas.length === 0) return undefined;
  const total_participantes = filas.reduce((s, c) => s + (c.total_participantes ?? 0), 0);
  const con_emprendimiento = filas.reduce((s, c) => s + (c.con_emprendimiento ?? 0), 0);
  const sin_emprendimiento = filas.reduce((s, c) => s + (c.sin_emprendimiento ?? 0), 0);
  const sumaEdadPond = filas.reduce((s, c) => s + Number(c.edad_promedio ?? 0) * (c.total_participantes ?? 0), 0);
  return {
    cohorte: 'todos', programa: filas[0].programa, computed_at: filas[0].computed_at,
    total_participantes, con_emprendimiento, sin_emprendimiento,
    porcentaje_con_emprendimiento: total_participantes ? String(Math.round((1000 * con_emprendimiento) / total_participantes) / 10) : null,
    edad_promedio: total_participantes ? (sumaEdadPond / total_participantes).toFixed(1) : null,
  };
}

function sumarIngresos(filas: { ingresados: number; activos: number; retirados: number; programa: 'jc' | 'mr' | 'stand'; cohorte: string }[]) {
  if (filas.length === 0) return undefined;
  return {
    cohorte: 'todos', programa: filas[0].programa,
    ingresados: filas.reduce((s, f) => s + (f.ingresados ?? 0), 0),
    activos: filas.reduce((s, f) => s + (f.activos ?? 0), 0),
    retirados: filas.reduce((s, f) => s + (f.retirados ?? 0), 0),
    pct_aprobados: null as string | number | null,
  };
}

function sumarCohorteEstudiantes(filas: { activos: number; al_dia: number; en_progreso: number; en_riesgo: number; prom_cursos_aprobados: number | string | null; programa: 'jc' | 'mr' | 'stand'; cohorte: string }[]) {
  if (filas.length === 0) return undefined;
  const activos = filas.reduce((s, c) => s + (c.activos ?? 0), 0);
  const al_dia = filas.reduce((s, c) => s + (c.al_dia ?? 0), 0);
  const en_progreso = filas.reduce((s, c) => s + (c.en_progreso ?? 0), 0);
  const en_riesgo = filas.reduce((s, c) => s + (c.en_riesgo ?? 0), 0);
  const sumaPond = filas.reduce((s, c) => s + Number(c.prom_cursos_aprobados ?? 0) * (c.activos ?? 0), 0);
  return {
    cohorte: 'todos', programa: filas[0].programa, activos, al_dia, en_progreso, en_riesgo,
    prom_cursos_aprobados: activos ? (sumaPond / activos).toFixed(2) : null,
    prom_cursos_inscritos: null as number | string | null,
  };
}

// Agrega v_pub_emprendimiento (ya filtrada) por situación — promedios ponderados por `total`,
// ignorando celdas suprimidas (total=null) en el peso.
function agregarEmprendimiento(filas: PubEmprendimiento[]) {
  const mapa = new Map<string, { total: number; sumaAvance: number; pesoAvance: number; sumaCursos: number; pesoCursos: number }>();
  filas.forEach((f) => {
    if (f.total == null) return;
    const acc = mapa.get(f.situacion) ?? { total: 0, sumaAvance: 0, pesoAvance: 0, sumaCursos: 0, pesoCursos: 0 };
    acc.total += f.total;
    if (f.prom_avance != null) {
      acc.sumaAvance += Number(f.prom_avance) * f.total;
      acc.pesoAvance += f.total;
    }
    if (f.prom_cursos_completados != null) {
      acc.sumaCursos += Number(f.prom_cursos_completados) * f.total;
      acc.pesoCursos += f.total;
    }
    mapa.set(f.situacion, acc);
  });
  return mapa;
}

export default function Pagina() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [programa, setPrograma] = useState<Programa>('jc');
  // null = "la cohorte actual" (se resuelve con los datos; no hardcodear el año)
  const [cohorteElegida, setCohorteElegida] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>('activos');
  // Selector de ciudad/municipio UNIFICADO (§2.1.4): un solo control, basado en
  // v_pub_geografia — cubre JC y MR (antes eran dos mecanismos: un selector de ciudad
  // JC-only arriba + una sección "Geografía" aparte para ambos programas dentro de Resumen).
  const [ciudadElegida, setCiudadElegida] = useState<string | null>(null); // grupo_ciudad
  const [municipioElegido, setMunicipioElegido] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Resumen');
  // Toggle MR (pedido 2026-08-27): por defecto se ve el universo histórico completo (estilo
  // Power BI — demografía + formación, TODAS las mujeres, sin cohorte/Q10). Las vistas basadas
  // en Q10 (cohorte-curso, ~11% del universo) quedan detrás de este botón explícito, en vez de
  // ser lo primero que se ve. Solo aplica a MR — JC sigue siendo Q10 siempre (no tiene el
  // concepto de "universo sin Q10").
  const [mostrarQ10Mr, setMostrarQ10Mr] = useState(false);
  // Año elegido para TODA la vista "Universo histórico" MR (KPI + Demografía + Formación) —
  // pedido 2026-08-27: un solo selector de año, fijo en un mini-header, que mueve las tres
  // vistas a la vez ("reuse year-tab mechanism already built for Histórico Q10"). 'todos' =
  // comportamiento original (todos los años juntos); Demografía/KPI lo soportan nativo (solo
  // suman/filtran), Formación (tabla por curso) necesita un año puntual porque los cursos
  // cambian de nombre cada año — con 'todos' se avisa en vez de inventar un promedio sin
  // sentido (ver VistaUniversoMr). Toggle del bloque de créditos: total beneficiadas vs las
  // que continúan (cumplieron/pagaron) — pedido 2026-08-27.
  const [anioUniversoMr, setAnioUniversoMr] = useState('todos');
  // Marco de referencia de "Formación" (pedido 2026-08-27): con qué base se calcula el % de
  // completitud por curso — 'inscritas' (todas las que se inscribieron, aunque nunca hayan
  // entrado a la plataforma) o 'iniciados' (solo las que sí llegaron a Bienvenida). Cambia el
  // denominador del % en la tabla y el texto del KPI, no los números crudos.
  const [marcoFormacionMr, setMarcoFormacionMr] = useState<'inscritas' | 'iniciados'>('inscritas');
  const [vistaCreditoMr, setVistaCreditoMr] = useState<'beneficiadas' | 'continuan'>('beneficiadas');
  // Unidad del desglose "Estado de la cohorte": matrículas (inscripciones) o estudiantes (personas).
  // Solo tiene sentido bajo Estado=Activos (v_cohorte_estudiantes* no distingue retirados).
  const [unidadEstadoCohorte, setUnidadEstadoCohorte] = useState<'matriculas' | 'estudiantes'>('matriculas');
  // Unidad de "Completación por curso" cuando esMrTodos (pedido 2026-08-31): igual que
  // unidadEstadoCohorte de arriba, pero para las 5 rutas normalizadas de MR — 'matriculas'
  // cuenta cada inscripción (una mujer que repitió el curso en 2 años cuenta 2 veces),
  // 'personas' cuenta headcount real (v_mr_curso_normalizado, migración 061).
  const [unidadCursoMr, setUnidadCursoMr] = useState<'matriculas' | 'personas'>('personas');
  // Alcance del bloque Emoflow. 'canonico' (default) = solo estudiantes vigentes según la
  // pestaña Seguimiento (742) — coherente con el resto del panel. 'todos' = universo
  // histórico completo del CSV de Emoflow (827): incluye 17 en retiro probable y 68 que
  // nunca fueron matriculados en Supabase (postulantes / retirados antiguos).
  const [alcanceEmoflow, setAlcanceEmoflow] = useState<'canonico' | 'todos'>('canonico');

  useEffect(() => {
    cargarTodo().then(setDatos).catch((e) => setError(String(e)));
  }, []);

  // Fondo de página rosado mientras el programa activo sea Mujeres ROFÉ
  useEffect(() => {
    document.body.classList.toggle('tema-mr-body', programa === 'mr');
    return () => document.body.classList.remove('tema-mr-body');
  }, [programa]);

  // La vista "Por estudiantes" solo existe para activos — si el usuario cambia el filtro
  // Estado a Todos/Retirados mientras estaba en esa vista, vuelve a "Por matrículas".
  useEffect(() => {
    if (estado !== 'activos' && unidadEstadoCohorte === 'estudiantes') setUnidadEstadoCohorte('matriculas');
  }, [estado, unidadEstadoCohorte]);

  // Unión de cohortes CON matrícula (datos.cursos) y cohortes SOLO-CANON (datos.pubCohorte,
  // ej. JC 2019-2022: Q10 no existía, no hay personas cargadas, pero sí el agregado oficial
  // de cohorte_historico) — 2026-08-12, ver docs/procesos/plan-enriquecimiento-final-2026-08-12.md.
  // Filtrado por `programa`: antes esta lista mezclaba cohortes de JC y MR sin distinguir
  // (ambos leían el mismo set global de datos.cursos), lo que hacía aparecer p.ej. "2023"/"2024"
  // como pestañas de MR aunque MR nunca tuvo cursos esos años — corregido de paso.
  const cohortes = useMemo(() => {
    if (!datos) return [];
    const deCursos = datos.cursos.filter((c) => c.programa === programa).map((c) => c.cohorte);
    const deCanon = datos.pubCohorte.filter((c) => c.programa === programa).map((c) => c.cohorte);
    return Array.from(new Set([...deCursos, ...deCanon])).sort().reverse();
  }, [datos, programa]);
  const cohorteActual = cohortes[0] ?? '';
  const cohorte = cohorteElegida ?? cohorteActual;
  const esActual = cohorte === cohorteActual && cohorte !== '';
  // "Todos" los años, SOLO Mujeres ROFÉ (2026-08-31) — ver comentario junto al selector de
  // cohorte más abajo. Repetir `programa === 'mr'` en cada sitio evita que este valor se
  // "filtre" a JC si `cohorteElegida` queda en 'todos' al cambiar de programa.
  const esMrTodos = programa === 'mr' && cohorte === 'todos';
  // Texto de despliegue: "todos" a secas lee mal en frases ("Ruta Mujeres ROFÉ todos") — usar
  // en cualquier interpolación de `cohorte` pensada para texto, nunca para comparar valores.
  const etiquetaCohorte = cohorte === 'todos' ? 'todos los años' : cohorte;

  // Geografía por municipio (v_pub_geografia) — fuente ÚNICA del selector de ciudad, cubre
  // ambos programas (antes el selector de arriba solo existía para JC, vía v_demografia_grupo).
  useEffect(() => {
    setCiudadElegida(null);
    setMunicipioElegido(null);
  }, [programa, cohorte]);

  const geografiaProg = useMemo(
    () =>
      datos
        ? datos.geografiaMunicipio.filter((g) => g.programa === programa && (esMrTodos || g.cohorte === cohorte))
        : [],
    [datos, programa, cohorte],
  );

  const gruposGeografia = useMemo(() => {
    const totales = new Map<string, number>();
    geografiaProg.forEach((g) =>
      totales.set(g.grupo_ciudad, (totales.get(g.grupo_ciudad) ?? 0) + g.personas),
    );
    return Array.from(totales.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([grupo, total]) => ({ grupo, total }));
  }, [geografiaProg]);

  // Retención por ciudad para pintarla en los botones del selector del Resumen (pedido de Samuel
  // 2026-08-13): cada ciudad visible muestra su % de retención, y "Todas" el global. Solo en la
  // cohorte vigente (v_pub_retencion_ciudad es canon-exacta solo ahí; en cerradas no hay ciudad).
  const retencionPorCiudad = useMemo(() => {
    const mapa = new Map<string, { pct: number; activos: number; retirados: number; ingresados: number }>();
    if (!datos || !esActual) return { mapa, total: null as number | null };
    let sa = 0, si = 0;
    datos.retencionCiudad
      .filter((r) => r.programa === programa && r.cohorte === cohorte && r.retencion_pct != null && r.ingresados)
      .forEach((r) => {
        mapa.set(r.grupo_ciudad, {
          pct: Number(r.retencion_pct),
          activos: r.activos ?? 0,
          retirados: r.retirados ?? 0,
          ingresados: r.ingresados ?? 0,
        });
        sa += r.activos ?? 0;
        si += r.ingresados ?? 0;
      });
    return { mapa, total: si ? Math.round((1000 * sa) / si) / 10 : null };
  }, [datos, programa, cohorte, esActual]);

  const municipiosGrupo = useMemo(
    () =>
      ciudadElegida
        ? geografiaProg
            .filter((g) => g.grupo_ciudad === ciudadElegida)
            .sort((a, b) => b.personas - a.personas)
        : [],
    [geografiaProg, ciudadElegida],
  );

  // Resumen de la selección de geografía vigente (grupo y, si se eligió, municipio) — usado
  // para el KPI de participantes cuando hay ciudad elegida, y para el pill inline junto al
  // selector. Reemplaza el statsProgramaPorCiudad viejo (JC-only) por una fuente que cubre
  // ambos programas.
  const geografiaFiltrada = useMemo(() => {
    let filas = geografiaProg;
    if (ciudadElegida) filas = filas.filter((g) => g.grupo_ciudad === ciudadElegida);
    if (municipioElegido) filas = filas.filter((g) => g.municipio === municipioElegido);
    return filas;
  }, [geografiaProg, ciudadElegida, municipioElegido]);

  const geografiaResumen = useMemo(() => {
    if (geografiaFiltrada.length === 0) return null;
    const personas = geografiaFiltrada.reduce((s, g) => s + (g.personas ?? 0), 0);
    const aprobados = geografiaFiltrada.reduce((s, g) => s + (g.aprobados ?? 0), 0);
    const sumaPond = geografiaFiltrada.reduce(
      (s, g) => s + Number(g.avance_promedio ?? 0) * (g.personas ?? 0), 0,
    );
    return { personas, aprobados, avance: personas ? sumaPond / personas : null };
  }, [geografiaFiltrada]);

  const hayFiltroCiudad = ciudadElegida !== null;

  // Frescura del dato (v_frescura) — un número correcto sin fecha es tan engañoso como uno
  // equivocado. Prioriza los procesos que alimentan el Resumen (cohorte/aprobación/retiros);
  // si por lo que sea no están, cae al máximo de todos para no dejar el badge vacío.
  const frescuraResumen = useMemo(() => {
    if (!datos || datos.frescura.length === 0) return null;
    const claves = ['cohorte_ingresos', 'aprobacion_cursos', 'retiros (sync_retiros)'];
    const relevantes = datos.frescura.filter((f) => claves.includes(f.proceso));
    const lista = relevantes.length ? relevantes : datos.frescura;
    const horas = Math.max(...lista.map((f) => Number(f.horas_desde_ultimo)));
    return { horas, vencido: lista.some((f) => f.vencido) };
  }, [datos]);

  const cursosProg = useMemo(
    () =>
      datos
        ? datos.cursos.filter((c) => c.programa === programa && (esMrTodos || c.cohorte === cohorte))
        : [],
    [datos, programa, cohorte, esMrTodos],
  );

  // "Completación por curso" para esMrTodos: 5 rutas reales en vez de 14 filas curso×cohorte
  // (ver v_mr_curso_normalizado, migración 061). Shape compatible con CursoCompletion para
  // reusar <GraficoCursos>/la tabla sin duplicar JSX — 'matriculados'/'completados' cambian de
  // significado según unidadCursoMr (filas de enrollments vs. personas únicas), el resto de
  // campos de CursoCompletion no aplican acá (cohorte/en_progreso/sin_iniciar/promedio_avance).
  const cursosNormalizadosMr = useMemo(() => {
    if (!datos || !esMrTodos) return [];
    return datos.mrCursoNormalizado.map((c) => {
      const matriculados = unidadCursoMr === 'personas' ? c.personas : c.matriculados;
      const completados = unidadCursoMr === 'personas' ? c.personas_completadas : c.completados;
      const pct = unidadCursoMr === 'personas' ? c.pct_personas_completadas : c.pct_completados;
      return {
        curso: c.curso, cohorte: 'todos', programa: 'mr' as const,
        matriculados, completados,
        en_progreso: Math.max(0, matriculados - completados), sin_iniciar: 0,
        pct_completados: pct != null ? String(pct) : null,
        promedio_avance: null,
      };
    });
  }, [datos, esMrTodos, unidadCursoMr]);

  // Cursos filtrados por ciudad — v_curso_completion_por_ciudad sigue siendo JC-only (sin
  // equivalente MR construido todavía). Con MR + ciudad elegida se degrada al total del
  // programa (misma degradación honesta que antes tenía JC en cohortes sin datos).
  const cursosPorCiudadFiltrados = useMemo(
    () => {
      if (!datos || programa !== 'jc' || !ciudadElegida) return cursosProg;
      return (
        datos.cursosPorCiudad?.filter(
          (c) => c.programa === programa && c.cohorte === cohorte && c.grupo_ciudad === ciudadElegida,
        ) ?? []
      );
    },
    [datos, programa, cohorte, ciudadElegida, cursosProg],
  );
  const cursosPorCiudadDisponible = programa === 'jc';

  const historialProg = useMemo(
    () => (datos ? datos.historial.filter((h) => h.programa === programa) : []),
    [datos, programa],
  );

  // Historial filtrado por ciudad. Serie propia (historial_cursos_ciudad, JC-only), no el
  // histórico nacional: este último nunca guardó la dimensión ciudad.
  const historialPorCiudad = useMemo(
    () => {
      if (!datos || programa !== 'jc' || !ciudadElegida) return [];
      return datos.historialPorCiudad?.filter((h) => h.grupo_ciudad === ciudadElegida) ?? [];
    },
    [datos, programa, ciudadElegida],
  );

  // v_pub_demografia ya filtrada por programa/cohorte/estado/ciudad (§2.1.3: el filtro Estado
  // se propaga aquí). "todos" = sumar activo+retirado; si no, filtra al estado elegido.
  const pubDemografiaFiltrada = useMemo(() => {
    if (!datos) return [];
    return datos.pubDemografia.filter(
      (d) =>
        d.programa === programa &&
        (esMrTodos || d.cohorte === cohorte) &&
        (estado === 'todos' || d.estado === (estado === 'activos' ? 'activo' : 'retirado')) &&
        (!ciudadElegida || d.grupo_ciudad === ciudadElegida),
    );
  }, [datos, programa, cohorte, estado, ciudadElegida, esMrTodos]);

  // "No aplica" (estructural, por programa) vs. "sin datos" (el filtro vigente no tiene
  // filas) para cada dimensión — se evalúa sobre TODO el dataset del programa, ignorando el
  // filtro de cohorte/estado/ciudad vigente, para no confundir sparsity con incompatibilidad.
  const dimensionAplicaPrograma = (dim: string) =>
    !!datos && datos.pubDemografia.some((d) => d.programa === programa && d.dimension === dim);

  const pubEmprendimientoFiltrada = useMemo(() => {
    if (!datos) return [];
    return datos.pubEmprendimiento.filter(
      (d) =>
        d.programa === programa &&
        (esMrTodos || d.cohorte === cohorte) &&
        (estado === 'todos' || d.estado === (estado === 'activos' ? 'activo' : 'retirado')) &&
        (!ciudadElegida || d.grupo_ciudad === ciudadElegida),
    );
  }, [datos, programa, cohorte, estado, ciudadElegida, esMrTodos]);
  const emprendimientoAplicaPrograma = !!datos && datos.pubEmprendimiento.some((d) => d.programa === programa);

  // Impacto financiero MR (Fase 2 ampliación PBI, migración 046, 2026-08-15) — la vista ya
  // filtra programa='mr', acá solo aplicamos cohorte/estado/ciudad como en el resto del panel.
  // Ojo (limitación conocida, misma que pubDemografia): la supresión n<5 se aplica POR CIUDAD
  // antes de agregar, así que sumar entre ciudades puede subcontar un poco frente al total real
  // sin desglosar — mismo trade-off ya aceptado en el resto del panel, no es nuevo acá.
  const impactoFinancieroMrFiltrada = useMemo(() => {
    if (!datos) return [];
    return datos.impactoFinancieroMr.filter(
      (d) =>
        d.cohorte === cohorte &&
        (estado === 'todos' || d.estado === (estado === 'activos' ? 'activo' : 'retirado')) &&
        (!ciudadElegida || d.grupo_ciudad === ciudadElegida),
    );
  }, [datos, cohorte, estado, ciudadElegida]);

  // Universo completo MR sin discriminar Q10 (v_pub_mr_universo, migración 054, pedido
  // 2026-08-26 "no discriminar por Q10"). A diferencia del resto de este tab, NO se filtra
  // por cohorte/estado — MR no se organiza por cohortes de selección anual como JC (ver
  // docs/procesos/plan-seguimiento-mr-2026-08-25.md §1), solo por ciudad si hay una elegida.
  //
  // FIX 2026-08-27 (bug real detectado por Samuel en producción): sin ciudad elegida hay que
  // usar SIEMPRE ambito='nacional' (agrupado sin ciudad_norm, casi sin supresión) — la versión
  // con ciudad_norm suprimía cientos de celdas <5 en las 561 ciudades y sumar sus `total`
  // perdía 1.213 personas (24%) del KPI titular (mostraba 3.898 en vez de 5.111). Mismo patrón
  // ya usado por PubSeguimiento ("para el KPI de contraste usar SIEMPRE ambito='nacional'").
  // Con ciudad elegida sí se usa ambito='ciudad' — ahí la supresión es esperable, es detalle
  // geográfico, no el titular.
  // Excepción 2026-08-27 (migración 058): anio_registro='sin dato' viene con con_q10=null (19
  // personas fusionadas, ver comentario en lib/api.ts) -- suman al total pero NUNCA a Con Q10
  // ni a Sin Q10 (comparación estricta `=== true`/`=== false`; OJO, `!null` es `true` en JS,
  // así que `!d.con_q10` habría sumado esas 19 a "Sin Q10" por error).
  const mrUniversoResumen = useMemo(() => {
    if (!datos || programa !== 'mr') return null;
    const filas = ciudadElegida
      ? datos.mrUniverso.filter((d) => d.ambito === 'ciudad' && d.ciudad_norm === ciudadElegida)
      : datos.mrUniverso.filter((d) => d.ambito === 'nacional');
    const sumar = (pred: (d: PubMrUniverso) => boolean) =>
      filas.filter(pred).reduce((acc, d) => acc + (d.total ?? 0), 0);
    return {
      total: sumar(() => true),
      conQ10: sumar((d) => d.con_q10 === true),
      sinQ10: sumar((d) => d.con_q10 === false),
      sinDatoQ10: sumar((d) => d.con_q10 === null),
      hayDatos: filas.length > 0,
    };
  }, [datos, programa, ciudadElegida]);

  // Mismo cálculo que mrUniversoResumen, pero AdemÁs filtrado por anioUniversoMr — solo para
  // VistaUniversoMr (pedido 2026-08-27: año+ciudad en todas las vistas del universo histórico).
  // Se deja mrUniversoResumen intacto (ciudad-only) porque también lo usa el tab "Resumen" de
  // abajo, detrás del toggle "🎓 Datos Q10", donde el mini-header de año no existe/no se ve.
  const mrUniversoResumenFiltrado = useMemo(() => {
    if (!datos || programa !== 'mr') return null;
    const base = ciudadElegida
      ? datos.mrUniverso.filter((d) => d.ambito === 'ciudad' && d.ciudad_norm === ciudadElegida)
      : datos.mrUniverso.filter((d) => d.ambito === 'nacional');
    const filas = anioUniversoMr === 'todos' ? base : base.filter((d) => d.anio_registro === anioUniversoMr);
    const sumar = (pred: (d: PubMrUniverso) => boolean) =>
      filas.filter(pred).reduce((acc, d) => acc + (d.total ?? 0), 0);
    return {
      total: sumar(() => true),
      conQ10: sumar((d) => d.con_q10 === true),
      sinQ10: sumar((d) => d.con_q10 === false),
      sinDatoQ10: sumar((d) => d.con_q10 === null),
      hayDatos: filas.length > 0,
    };
  }, [datos, programa, ciudadElegida, anioUniversoMr]);

  // ÚNICA fuente de verdad del "Universo total" MR en vivo — TODOS los años, SIN filtro de
  // ciudad ni año (ambito='nacional' completo). Bug real 2026-08-28: el KPI de arriba usaba
  // esto, pero "Formación" y el tab Demografía (Q10) tenían el número REPETIDO A MANO en texto
  // ("5.111", luego "BD 5.109" estático) — cuando la base cambiaba (gente que sale del Sheet,
  // ver postulantes-mr-supabase.md) esos textos quedaban desfasados mientras el KPI sí se
  // actualizaba, mostrando dos cifras distintas para "lo mismo" en la misma página. Regla desde
  // hoy: CUALQUIER lugar del panel que diga "el universo total de MR es X" debe leer este
  // memo (o mrUniversoResumen/mrUniversoResumenFiltrado, que ya lo usan) — nunca escribir el
  // número a mano en una nota/título, ni siquiera como "actualizado a tal fecha".
  const universoNacionalTotalMr = useMemo(() => {
    if (!datos) return 0;
    return datos.mrUniverso
      .filter((d) => d.ambito === 'nacional')
      .reduce((acc, d) => acc + (d.total ?? 0), 0);
  }, [datos]);

  // Igual que universoNacionalTotalMr, pero respetando el año elegido (anioUniversoMr) — base
  // correcta para calcular "sin dato" en cada tarjeta de Demografía (pedido 2026-08-28: si una
  // dimensión no suma el total nacional del año vigente, mostrar cuántas personas faltan por
  // "sin dato" en vez de dejar la resta en silencio). Sin filtro de ciudad a propósito, mismo
  // motivo que TarjetaDemografiaUniverso (32.4% de pérdida k-anonimato si se cruza con ciudad).
  const universoNacionalAnioActualMr = useMemo(() => {
    if (!datos) return 0;
    const filas = datos.mrUniverso.filter(
      (d) => d.ambito === 'nacional' && (anioUniversoMr === 'todos' || d.anio_registro === anioUniversoMr),
    );
    return filas.reduce((acc, d) => acc + (d.total ?? 0), 0);
  }, [datos, anioUniversoMr]);

  // Ciudades del universo MR (v_pub_mr_universo, ambito='ciudad'), respetando el año elegido —
  // fuente correcta para el selector de ciudad de VistaUniversoMr (gruposGeografia de abajo es
  // Q10/cohorte-scoped vía v_pub_geografia, no sirve para el universo completo). Mismo umbral
  // "ciudad grande" que ya usa panel_control_gui.py localmente (≥50) — el resto se agrupa en
  // "Otras ciudades" en vez de listar 500+ botones.
  const ciudadesUniversoMr = useMemo(() => {
    if (!datos) return [];
    const filas = datos.mrUniverso.filter(
      (d) => d.ambito === 'ciudad' && (anioUniversoMr === 'todos' || d.anio_registro === anioUniversoMr),
    );
    const totales = new Map<string, number>();
    filas.forEach((d) => {
      if (d.ciudad_norm && d.total != null) totales.set(d.ciudad_norm, (totales.get(d.ciudad_norm) ?? 0) + d.total);
    });
    return Array.from(totales.entries())
      .filter(([, total]) => total >= 50)
      .sort((a, b) => b[1] - a[1]);
  }, [datos, anioUniversoMr]);

  const pubAsistenciaFiltrada = useMemo(() => {
    if (!datos) return [];
    return datos.pubAsistencia.filter(
      (d) =>
        d.programa === programa &&
        d.cohorte === cohorte &&
        (estado === 'todos' || d.estado === (estado === 'activos' ? 'activo' : 'retirado')) &&
        (!ciudadElegida || d.grupo_ciudad === ciudadElegida),
    );
  }, [datos, programa, cohorte, estado, ciudadElegida]);

  // Filtro global Estado × alcance local de Emoflow (cableado 2026-08-26): Retirados usa las
  // vistas _retirado (ya cargadas en lib/api.ts desde antes, nunca conectadas — bug encontrado
  // en la auditoría). Fuera de Retirados, el alcance local sigue mandando (canónico=vigentes vs
  // todos=histórico completo, incluye retiro probable y nunca-matriculados — no es lo mismo que
  // "Retirados" oficial, por eso quedan como dos controles separados en vez de fusionarse).
  const fuenteEmoflow: 'canonico' | 'todos' | 'retirado' =
    estado === 'retirados' ? 'retirado' : alcanceEmoflow;

  // Emoflow — KPIs. Sin ciudad: agregado nacional. Con ciudad: la fila de esa ciudad (JC-only,
  // Emoflow no tiene matrículas MR — ver "no aplica" del tab).
  const emoflowKpis = useMemo(() => {
    if (!datos) return null;
    const elegir = <T,>(canonico: T, todos: T, retirado: T) =>
      fuenteEmoflow === 'retirado' ? retirado : fuenteEmoflow === 'canonico' ? canonico : todos;
    if (ciudadElegida) {
      const fuente = elegir(datos.emoflowPorCiudadCanonico, datos.emoflowPorCiudad, datos.emoflowPorCiudadRetirado);
      const c = fuente?.find((e) => e.grupo_ciudad === ciudadElegida);
      if (!c) return null;
      return {
        participantes: c.participantes,
        promedio: Number(c.ingresos_promedio ?? 0),
        mediana: c.ingresos_mediana ?? 0,
        activos7: c.activos_7d,
        inactivos30: c.inactivos_30d,
      };
    }
    const r = elegir(datos.emoflowResumenCanonico, datos.emoflowResumen, datos.emoflowResumenRetirado)?.[0];
    if (!r) return null;
    return {
      participantes: r.participantes,
      promedio: Number(r.ingresos_promedio ?? 0),
      mediana: r.ingresos_mediana ?? 0,
      activos7: r.activos_7d,
      inactivos30: r.inactivos_30d,
    };
  }, [datos, ciudadElegida, fuenteEmoflow]);

  const emoflowBandas = useMemo(() => {
    if (!datos) return [];
    const elegir = <T,>(canonico: T, todos: T, retirado: T) =>
      fuenteEmoflow === 'retirado' ? retirado : fuenteEmoflow === 'canonico' ? canonico : todos;
    const filas = ciudadElegida
      ? (elegir(datos.emoflowBandasCiudadCanonico, datos.emoflowBandasCiudad, datos.emoflowBandasCiudadRetirado) ?? []).filter(
          (b) => b.grupo_ciudad === ciudadElegida,
        )
      : (elegir(datos.emoflowBandasCanonico, datos.emoflowBandas, datos.emoflowBandasRetirado) ?? []);
    return [...filas]
      .sort((a, b) => a.orden - b.orden)
      .map((b) => ({
        etiqueta: b.banda,
        participantes: b.participantes,
        pct_aprobacion: Number(b.pct_aprobacion ?? 0),
      }));
  }, [datos, ciudadElegida, fuenteEmoflow]);

  const emoflowCiudades = useMemo(() => {
    if (!datos) return [];
    const fuente =
      fuenteEmoflow === 'retirado'
        ? datos.emoflowPorCiudadRetirado
        : fuenteEmoflow === 'canonico'
          ? datos.emoflowPorCiudadCanonico
          : datos.emoflowPorCiudad;
    return (fuente ?? []).map((c) => ({
      etiqueta: ETIQUETA_GRUPO[c.grupo_ciudad] ?? c.grupo_ciudad,
      ingresos_promedio: Number(c.ingresos_promedio ?? 0),
    }));
  }, [datos, fuenteEmoflow]);

  // Evolución semanal de la actividad en Emoflow (% de la matrícula activa por semana), por
  // ciudad. Directo del CSV de Emoflow (tabla emoflow_actividad_semanal). Eje X = lunes de cada
  // semana (ISO) → orden temporal correcto. Excluye NACIONAL (se muestran las líneas por ciudad).
  // Una semana (lunes ISO) está COMPLETA si su domingo (lunes+6) ya pasó, según la última fecha
  // con datos. Así excluimos la semana en curso, que aparecería artificialmente baja por llevar
  // pocos días — no es un bajón real, es que aún no termina.
  const semanaCompleta = useMemo(() => {
    const maxData = (datos?.emoflowDiario ?? []).reduce((m, f) => (f.fecha > m ? f.fecha : m), '');
    return (lunes: string) => {
      if (!maxData) return true;
      const dom = new Date(`${lunes}T00:00:00Z`);
      dom.setUTCDate(dom.getUTCDate() + 6);
      return dom.toISOString().slice(0, 10) <= maxData;
    };
  }, [datos]);

  const actividadSemanalEvolucion = useMemo(() => {
    const filas = (datos?.emoflowActividadSemanal ?? []).filter(
      (f) => f.grupo_ciudad !== 'NACIONAL' && semanaCompleta(f.semana_inicio),
    );
    return [...filas]
      .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
      .map((f) => ({
        fecha: f.semana_inicio,
        curso: ETIQUETA_GRUPO[f.grupo_ciudad] ?? f.grupo_ciudad,
        valor: Number(f.pct_activos ?? 0),
      }));
  }, [datos, semanaCompleta]);

  // Snapshot de la ÚLTIMA SEMANA COMPLETA por ciudad (excluye la semana en curso).
  const actividadSemanalUltima = useMemo(() => {
    const filas = (datos?.emoflowActividadSemanal ?? []).filter(
      (f) => f.grupo_ciudad !== 'NACIONAL' && semanaCompleta(f.semana_inicio),
    );
    if (filas.length === 0) return { semana: null as string | null, datos: [] };
    const semanaSnap = filas.reduce((m, f) => (f.semana_inicio > m ? f.semana_inicio : m), filas[0].semana_inicio);
    return {
      semana: semanaSnap,
      datos: filas
        .filter((f) => f.semana_inicio === semanaSnap)
        .sort((a, b) => Number(b.pct_activos ?? 0) - Number(a.pct_activos ?? 0))
        .map((f) => ({
          etiqueta: ETIQUETA_GRUPO[f.grupo_ciudad] ?? f.grupo_ciudad,
          pct_activos: Number(f.pct_activos ?? 0),
        })),
    };
  }, [datos, semanaCompleta]);

  // ── Emoflow: bloques (solo datos propios de Emoflow, no de Q10) ────────────
  // Correlación uso→aprendizaje: rango de % de aprobación entre la banda que menos
  // entra y la que más. City-aware porque emoflowBandas ya respeta la ciudad.
  const correlacion = useMemo(() => {
    const aprob = emoflowBandas.map((b) => b.pct_aprobacion).filter((v) => v > 0);
    if (aprob.length < 2) return null;
    return { min: Math.min(...aprob), max: Math.max(...aprob) };
  }, [emoflowBandas]);

  // Serie DIARIA REAL de ingresos (reemplaza el backfill plano). Sin ciudad → NACIONAL;
  // con ciudad elegida → esa ciudad. Dos líneas: ingresos y usuarios activos.
  const evolucionDiaria = useMemo(() => {
    const grupo = ciudadElegida ?? 'NACIONAL';
    const filas = (datos?.emoflowDiario ?? []).filter((f) => f.grupo_ciudad === grupo);
    const out: { fecha: string; curso: string; valor: number | null }[] = [];
    for (const f of filas) {
      out.push({ fecha: f.fecha, curso: 'Ingresos', valor: f.ingresos });
      out.push({ fecha: f.fecha, curso: 'Usuarios activos', valor: f.usuarios_activos });
    }
    return out;
  }, [datos, ciudadElegida]);

  // Último día registrado (para el resumen en palabras).
  const ultimoDiaEmoflow = useMemo(() => {
    const grupo = ciudadElegida ?? 'NACIONAL';
    const filas = (datos?.emoflowDiario ?? []).filter((f) => f.grupo_ciudad === grupo);
    if (filas.length === 0) return null;
    return filas.reduce((a, b) => (a.fecha > b.fecha ? a : b));
  }, [datos, ciudadElegida]);

  // Resumen en palabras: el equivalente automático del reporte diario de WhatsApp.
  const narrativaEmoflow = useMemo(() => {
    if (!emoflowKpis) return null;
    const partes: string[] = [];
    const pctAct = emoflowKpis.participantes
      ? Math.round((emoflowKpis.activos7 / emoflowKpis.participantes) * 100)
      : 0;
    const donde = ciudadElegida ? ` en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : '';
    partes.push(
      `${emoflowKpis.activos7.toLocaleString('es-CO')} de ${emoflowKpis.participantes.toLocaleString('es-CO')} estudiantes${donde} entraron al sistema en los últimos 7 días (${pctAct}%).`,
    );
    if (ultimoDiaEmoflow) {
      const f = fechaCortaEs(ultimoDiaEmoflow.fecha);
      partes.push(
        `El último día registrado${f ? ` (${f})` : ''} hubo ${ultimoDiaEmoflow.ingresos.toLocaleString('es-CO')} ingresos de ${ultimoDiaEmoflow.usuarios_activos.toLocaleString('es-CO')} estudiantes.`,
      );
    }
    if (emoflowKpis.inactivos30 > 0) {
      partes.push(`${emoflowKpis.inactivos30.toLocaleString('es-CO')} llevan más de 30 días sin entrar — el grupo a vigilar.`);
    }
    return partes.join(' ');
  }, [emoflowKpis, ciudadElegida, ultimoDiaEmoflow]);

  // Aprobación canónica de la cohorte (cursaron = activos + retirados) por programa
  const aprobacionProg = useMemo(() => {
    if (!datos) return [];
    const filas = datos.aprobacion.filter(
      (a) => a.programa === programa && (esMrTodos || a.cohorte === cohorte),
    );
    // Bienvenida es el primer curso que ven las y los estudiantes (JC) — se muestra siempre
    // de primero en el gráfico, aunque el resto quede ordenado por tamaño de cohorte
    // (cursaron.desc, ya viene así de la API). Pedido de Samuel 2026-09-07.
    const esBienvenida = (a: (typeof filas)[number]) => /bienvenid/i.test(a.curso);
    return [...filas.filter(esBienvenida), ...filas.filter((a) => !esBienvenida(a))];
  }, [datos, programa, cohorte, esMrTodos]);

  // Única decisión de qué vista de Cursos usar (§1.2 del diagnóstico: antes se calculaba dos
  // veces, en Resumen y en Cursos, con riesgo de desalinearse). Se consume igual en ambos tabs.
  const mostrarCanonico = esActual && aprobacionProg.length > 0;

  // Aprobación canónica por CIUDAD (v_pub_aprobacion_ciudad_jc, cerrado 2026-08-26): mismo
  // shape que aprobacionProg (activos/aprobados/aprobados_retirados/retirados/cursaron), así
  // que segmentosAprobacion/totalPorEstado/aprobadosPorEstado (definidos más abajo) sirven tal
  // cual sobre esta fuente también. Solo JC — MR no tiene en_seguimiento_jc todavía.
  const aprobacionCiudadProg = useMemo(
    () =>
      datos && ciudadElegida && programa === 'jc'
        ? datos.aprobacionCiudadJc.filter((a) => a.cohorte === cohorte && a.grupo_ciudad === ciudadElegida)
        : [],
    [datos, programa, cohorte, ciudadElegida],
  );
  // Filas con celda suprimida por k-anonimato (cursaron<5 -> toda la fila null) — se muestran
  // aparte para no mentir con un "0" donde en realidad es "dato oculto por privacidad".
  const aprobacionCiudadSuprimida = aprobacionCiudadProg.filter((a) => a.cursaron == null);
  const aprobacionCiudadConDato = aprobacionCiudadProg.filter(
    (a): a is typeof a & { cursaron: number; activos: number; aprobados: number; aprobados_retirados: number; retirados: number } =>
      a.cursaron != null,
  );


  // Verificación cruzada: misma forma que aprobacion_cursos pero recalculada desde
  // enrollments + en_seguimiento_jc, para detectar si el pipeline oficial de Q10 se
  // desincroniza de Supabase (como pasó el 2026-07-23 con un sync atrasado).
  const aprobacionAjustadaProg = useMemo(() => {
    if (!datos || programa !== 'jc') return [];
    const filas = datos.aprobacionAjustada.filter((a) => a.cohorte === cohorte);
    // Bienvenida siempre de primero en la tabla, mismo criterio que aprobacionProg arriba.
    const esBienvenida = (a: (typeof filas)[number]) => /bienvenid/i.test(a.curso);
    return [...filas.filter(esBienvenida), ...filas.filter((a) => !esBienvenida(a))];
  }, [datos, programa, cohorte]);

  // Distribución de estudiantes por # de cursos aprobados (histograma). Se rellenan los huecos
  // (0..max) para que el eje sea continuo y muestre honestamente los tramos sin nadie.
  const distribucionEst = useMemo(() => {
    if (!datos) return [] as { etiqueta: string; estudiantes: number }[];
    const filas = datos.estudiantesDist.filter(
      (d) => (esMrTodos || d.cohorte === cohorte) && d.programa === programa,
    );
    if (filas.length === 0) return [];
    const max = Math.max(...filas.map((f) => f.cursos_aprobados));
    return Array.from({ length: max + 1 }, (_, n) => ({
      etiqueta: String(n),
      estudiantes: filas.find((f) => f.cursos_aprobados === n)?.estudiantes ?? 0,
    }));
  }, [datos, cohorte, programa, esMrTodos]);

  // cohorte_ingresos solo tiene la cohorte viva; para las cerradas (2019–2025) el canon oficial
  // vive en v_pub_cohorte (mismo dato que el banner de panel_control_gui.py). Fallback → las
  // tarjetas de cohortes cerradas muestran ingresados/culminantes/retirados/retención del canon
  // en vez de quedar en blanco. La viva (2026) sigue tomando cohorte_ingresos (idéntico al canon).
  const ingresosProg = useMemo(() => {
    if (!datos) return undefined;
    if (esMrTodos) {
      // Una fila por cohorte, con la misma precedencia que el caso normal (ingresos = cohorte
      // viva, pubCohorte = canon de cohortes cerradas) — se resuelve cohorte por cohorte antes
      // de sumar, para no mezclar una fuente incompleta si algún año tuviera ambas.
      const filas = cohortes
        .map((coh) =>
          datos.ingresos.find((i) => i.cohorte === coh && i.programa === programa) ??
          datos.pubCohorte.find((i) => i.cohorte === coh && i.programa === programa),
        )
        .filter((f): f is NonNullable<typeof f> => !!f);
      // Cobertura PARCIAL (ej. hoy: solo 2026 tiene fila canon en cohorte_ingresos/v_pub_cohorte
      // — 2023-2025 nunca se curaron ahí, distinto del histórico Q10 crudo que sí se backfilleó
      // en courses/enrollments) → undefined a propósito, para que el KPI caiga al layout
      // "cohorte sin canon" (participantes/matrículas/avance/cursos, ya alimentado por
      // co/ps más abajo) en vez de mostrar solo-2026 con la etiqueta "Todos". Mismo criterio
      // que ya aplica cohorte por cohorte cuando falta esta fila.
      if (filas.length < cohortes.length) return undefined;
      return sumarIngresos(filas);
    }
    return (
      datos.ingresos.find((i) => i.cohorte === cohorte && i.programa === programa) ??
      datos.pubCohorte.find((i) => i.cohorte === cohorte && i.programa === programa)
    );
  }, [datos, cohorte, programa, cohortes, esMrTodos]);

  // Denominador correcto para el punto gris "sin dato" de TarjetaDemografia (pedido 2026-08-28,
  // Samuel: "revisa que las otras vistas también cuadren" tras el fix de MR). Auditoría real
  // encontró que JC 2026 activos (canon 743) vs v_pub_demografia solo suma 524 en estrato/nivel_
  // estudio/tipo_vivienda -- ~30% de la cohorte sin ese dato, nunca mostrado. ingresosProg ya
  // trae ingresados/activos/retirados exactos (canon v_pub_cohorte) -- se elige el que calce con
  // el filtro Estado vigente. NULL con ciudad elegida a propósito: no hay canon por ciudad
  // confiable para "activos de esta ciudad" (mismo motivo que MR no cruza Demografía x ciudad).
  const demografiaTotalEsperado = useMemo(() => {
    if (!ingresosProg || ciudadElegida) return null;
    if (estado === 'activos') return ingresosProg.activos ?? null;
    if (estado === 'retirados') return ingresosProg.retirados ?? null;
    return ingresosProg.ingresados ?? null;
  }, [ingresosProg, estado, ciudadElegida]);

  // Segmentos del gráfico de aprobación por curso, recortados al Estado elegido: Activos
  // (aprobó/en curso, denominador=activos), Retirados (aprobó-y-retiró/retirado,
  // denominador=retirados) o Todos (los 4 segmentos, como antes — denominador=cursaron).
  // Forma mínima compartida por aprobacionProg (nacional) y aprobacionCiudadConDato (por
  // ciudad, JC): permite reusar los mismos helpers de abajo sobre cualquiera de las dos fuentes.
  type FilaAprobacion = {
    curso: string;
    activos: number;
    aprobados: number;
    aprobados_retirados: number;
    retirados: number;
    cursaron: number;
    banda_0_25: number | null;
    banda_26_80: number | null;
    aprobados_total: number | null;
    promedio: number | string | null;
  };
  const segmentosAprobacion = (a: FilaAprobacion) => {
    if (estado === 'activos') {
      return {
        curso: a.curso,
        aprobados: a.aprobados,
        en_curso: (a.banda_0_25 ?? 0) + (a.banda_26_80 ?? 0),
        aprobados_retirados: 0,
        retirados: 0,
      };
    }
    if (estado === 'retirados') {
      return {
        curso: a.curso,
        aprobados: 0,
        en_curso: 0,
        aprobados_retirados: a.aprobados_retirados,
        retirados: a.retirados,
      };
    }
    return {
      curso: a.curso,
      aprobados: a.aprobados,
      en_curso: (a.banda_0_25 ?? 0) + (a.banda_26_80 ?? 0),
      aprobados_retirados: a.aprobados_retirados,
      retirados: a.retirados,
    };
  };
  // BUG corregido 2026-08-26: para 'retirados' el denominador NO puede ser solo `a.retirados`
  // (eso cuenta únicamente a quienes se retiraron SIN aprobar ese curso puntual — ver
  // aprobacion_cursos). El universo real de retirados evaluado en cada curso es
  // `retirados + aprobados_retirados`; usar solo `retirados` producía denominadores más chicos
  // que el numerador y KPIs de "Aprobación" imposibles (ej. 206%) en la pestaña Cursos.
  const totalPorEstado = (a: FilaAprobacion) =>
    estado === 'activos' ? a.activos : estado === 'retirados' ? a.retirados + a.aprobados_retirados : a.cursaron;
  const aprobadosPorEstado = (a: FilaAprobacion) =>
    estado === 'activos' ? a.aprobados : estado === 'retirados' ? a.aprobados_retirados
      : (a.aprobados_total ?? a.aprobados + a.aprobados_retirados);

  const kpis = useMemo(() => {
    if (!datos) return null;
    // "Todos" los años (MR, 2026-08-31): estas 2 tablas traen una fila por cohorte — para
    // 'todos' se suman en vez de buscar una fila que no existe (ver sumarProgramaStats/
    // sumarCohorteStats arriba, mismo criterio de recalcular % desde conteos que ya usa
    // retencionPorCiudad).
    const ps = esMrTodos
      ? sumarProgramaStats(datos.programas.filter((p) => p.programa === programa))
      : datos.programas.find((p) => p.programa === programa && p.cohorte === cohorte);
    // cohorte_stats viene separada por programa desde la migración de separación JC/MR
    const co = esMrTodos
      ? sumarCohorteStats(datos.cohorte.filter((c) => c.programa === programa))
      : datos.cohorte.find((c) => c.cohorte === cohorte && c.programa === programa);
    const ing = ingresosProg;

    let participantes = ps?.participantes ?? 0;
    let matriculas = ps?.matriculas ?? 0;
    let completadas = ps?.completadas ?? 0;
    let promedio = ps?.promedio_avance ? `${ps.promedio_avance}%` : '—';
    // BUG corregido 2026-08-26: cohorte_stats.edad_promedio se calcula SOLO sobre activos
    // (verificado en Supabase: total_participantes coincide exacto con el conteo de activos,
    // no con ingresados) — mostrarlo bajo Estado=Todos/Retirados era la edad de los activos
    // mal rotulada, y no cambiaba nunca al mover el filtro. Se oculta fuera de Activos, igual
    // que Demografía ya hace con el resto del dato sociodemográfico de retirados (dato parcial,
    // no confiable todavía). El KPI cae solo al de "Cursos" ya previsto más abajo.
    let edadProm = estado === 'activos' && co?.edad_promedio ? Number(co.edad_promedio).toFixed(1) : '—';

    if (hayFiltroCiudad && geografiaResumen) {
      // v_pub_geografia cubre ambos programas — reemplaza al viejo statsProgramaPorCiudad
      // (JC-only), que no tenía cómo filtrar a Mujeres ROFÉ.
      participantes = geografiaResumen.personas;
      completadas = geografiaResumen.aprobados;
      matriculas = geografiaResumen.personas;
      promedio = geografiaResumen.avance != null ? `${geografiaResumen.avance.toFixed(1)}%` : '—';
    }

    // Desglose de las matrículas de la cohorte en los 4 estados accionables (canónico).
    let estadoCohorte: null | {
      aprobadas: number; enProgreso: number; enRiesgo: number; retiradas: number; total: number;
    } = null;

    const esCanonico = mostrarCanonico && !hayFiltroCiudad;
    if (esCanonico) {
      matriculas = aprobacionProg.reduce((s, a) => s + a.cursaron, 0);
      completadas = aprobacionProg.reduce(
        (s, a) => s + (a.aprobados_total ?? a.aprobados + a.aprobados_retirados), 0);
      const sumaPond = aprobacionProg.reduce((s, a) => s + Number(a.promedio ?? 0) * a.cursaron, 0);
      promedio = matriculas ? `${(sumaPond / matriculas).toFixed(1)}%` : promedio;
      estadoCohorte = {
        aprobadas: completadas,
        enProgreso: aprobacionProg.reduce((s, a) => s + (a.banda_26_80 ?? 0), 0),
        enRiesgo: aprobacionProg.reduce((s, a) => s + (a.banda_0_25 ?? 0), 0),
        retiradas: aprobacionProg.reduce((s, a) => s + a.retirados, 0),
        total: matriculas,
      };
    }

    // Mismo desglose que estadoCohorte pero por CIUDAD (v_pub_aprobacion_ciudad_jc, cerrado
    // 2026-08-26) — reemplaza el "no aplica" que esta sección mostraba antes con Ciudad elegida.
    // Solo JC (esa vista no existe para MR todavía).
    let estadoCohorteCiudad: typeof estadoCohorte = null;
    if (mostrarCanonico && hayFiltroCiudad && programa === 'jc' && aprobacionCiudadConDato.length > 0) {
      const totalCiudad = aprobacionCiudadConDato.reduce((s, a) => s + a.cursaron, 0);
      estadoCohorteCiudad = {
        aprobadas: aprobacionCiudadConDato.reduce((s, a) => s + (a.aprobados_total ?? a.aprobados + a.aprobados_retirados), 0),
        enProgreso: aprobacionCiudadConDato.reduce((s, a) => s + (a.banda_26_80 ?? 0), 0),
        enRiesgo: aprobacionCiudadConDato.reduce((s, a) => s + (a.banda_0_25 ?? 0), 0),
        retiradas: aprobacionCiudadConDato.reduce((s, a) => s + a.retirados, 0),
        total: totalCiudad,
      };
    }

    // Desglose por ESTUDIANTES (personas únicas, solo Activos — ver nota de unidadEstadoCohorte)
    let estadoEst: null | {
      alDia: number; enProgreso: number; enRiesgo: number; retirados: number;
      total: number; promAprobados: number | null;
    } = null;
    if (esCanonico) {
      const ce = datos.estudiantes.find((x) => x.cohorte === cohorte && x.programa === programa);
      if (ce) {
        const retirados = ing?.retirados ?? 0;
        estadoEst = {
          alDia: ce.al_dia,
          enProgreso: ce.en_progreso,
          enRiesgo: ce.en_riesgo,
          retirados,
          total: ce.activos + retirados,
          promAprobados: ce.prom_cursos_aprobados != null ? Number(ce.prom_cursos_aprobados) : null,
        };
      }
    }

    // "Actuales" coherente con el desglose por ciudad (pedido de Samuel 2026-08-10): para JC en la
    // cohorte viva, los ACTIVOS salen de v_pub_geografia — la MISMA fuente que los botones por
    // ciudad y que la pestaña Seguimiento de monitorías (v_pub_geografia ≈ en_seguimiento_jc=true y
    // no retirado). Así el titular suma EXACTO con las ciudades e iguala a panel_control_gui, que
    // usa esa única fuente. La cohorte canónica de Q10 (cohorte_ingresos.activos) queda como base de
    // aprobación en su propia sección; la diferencia entre ambas fuentes son retiros por confirmar
    // (NO fijar un número de ejemplo aquí — cambia con cada sync; se ve en vivo comparando el KPI
    // "Actuales" con la pestaña Retención). MR y cohortes históricas siguen con el número canónico
    // (no tienen fuente Seguimiento).
    const actualesGeo = datos.geografiaMunicipio
      .filter((g) => g.programa === programa && g.cohorte === cohorte)
      .reduce((s, g) => s + (g.personas ?? 0), 0);
    const usarActualesSeguimiento = programa === 'jc' && esActual && !hayFiltroCiudad;
    // Filtro "Estado": cambia qué número es EL número principal (§2.1.3).
    const cifraEstado = !ing
      ? null
      : estado === 'activos'
        ? usarActualesSeguimiento
          ? actualesGeo
          : ing.activos
        : estado === 'retirados'
          ? ing.retirados
          : ing.ingresados;

    return {
      participantes,
      matriculas,
      pctCompletadas: matriculas ? Math.round((100 * completadas) / matriculas) : 0,
      promedio,
      pctAprobados: hayFiltroCiudad ? null : (ing?.pct_aprobados ? `${ing.pct_aprobados}%` : '—'),
      esCanonico,
      numCursos: aprobacionProg.length,
      estadoCohorte,
      estadoCohorteCiudad,
      estadoEst,
      edadProm,
      cifraEstado,
      usarActualesSeguimiento,
      actualesGeo,
      ingresados: hayFiltroCiudad ? null : ing?.ingresados ?? null,
      activos: ing?.activos ?? null,
      retirados: ing?.retirados ?? null,
      // Retención/Deserción de la cohorte VIGENTE de JC (pedido de Samuel 2026-09-07): usar el
      // activo EN VIVO (Seguimiento, mismo que el KPI "Actuales"/actualesGeo) contra el canon
      // ingresados (832), no cohorte_ingresos.activos (canon, se actualiza por sync y se atrasa
      // frente a los retiros del día). Antes esta casilla mostraba 88.9% (740/832, canon) mientras
      // "Actuales" ya mostraba 726 — dos números de activos distintos en la misma pantalla. Fuera
      // de ese caso (cohortes cerradas, MR, con filtro de ciudad) se conserva el canon de siempre.
      activosRetencion: usarActualesSeguimiento ? actualesGeo : (ing?.activos ?? null),
    };
  }, [datos, programa, cohorte, estado, hayFiltroCiudad, geografiaResumen, esActual, esMrTodos, aprobacionProg, aprobacionCiudadConDato, mostrarCanonico, ingresosProg]);

  // Retención y Asistencia se quitaron del tab bar de MR (pedido 2026-08-27, tras la
  // auditoría de 2 agentes): miden procesos que MR no tiene estructurados de la misma forma
  // que JC (selección anual por cohorte / sesiones de clase con asistencia Zoom capturada) —
  // "innecesarias" para MR, decisión explícita del usuario, no un fallback automático. Si el
  // tab activo queda huérfano al cambiar a MR, se cae a Resumen.
  const cambiarPrograma = (p: Programa) => {
    setPrograma(p);
    if (p === 'mr' && (tab === 'Retención' || tab === 'Asistencia')) setTab('Resumen');
    // "Todos" es exclusivo de Mujeres ROFÉ (ver esMrTodos) — si venía elegido al cambiar a
    // Jóvenes creaTIvos, se descarta para no dejar el selector en un valor sin botón activo.
    if (p === 'jc' && cohorteElegida === 'todos') setCohorteElegida(null);
  };
  const cambiarCohorte = (coh: string) => setCohorteElegida(coh);

  if (error)
    return (
      <>
        <Hero tema={programa} />
        <div className="max-w-[1600px] mx-auto px-4 py-8">
          <div className="bg-rofe-rojo/10 border border-rofe-rojo text-rofe-rojo rounded-xl p-6">
            <p className="font-bold">No se pudieron cargar los datos.</p>
            <p className="text-sm mt-1">{error}</p>
            <p className="text-sm mt-2">Intenta recargar la página en unos minutos.</p>
          </div>
        </div>
      </>
    );

  if (!datos || !kpis)
    return (
      <>
        <Hero tema={programa} />
        <div className="max-w-[1600px] mx-auto px-4 py-8 animate-pulse space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl" />
            ))}
          </div>
          <div className="h-72 bg-slate-200 rounded-xl" />
        </div>
      </>
    );

  // Emprendimiento MR — migrado 2026-08-26 de v_mr_demografia (legacy, sin cohorte/estado/
  // ciudad) a v_pub_impacto_financiero_mr (dimension='tiene_emprendimiento'), la MISMA fuente
  // ya usada por la tarjeta "Con emprendimiento" del tab Emprendimiento — ahora esta tarjeta de
  // Demografía respeta cohorte/estado/ciudad como todas las demás de la grilla, sin necesitar
  // una vista nueva (el dato ya existía, solo estaba en el tab equivocado).
  const totalMrConDatos = impactoFinancieroMrFiltrada
    .filter((d) => d.dimension === 'tiene_emprendimiento' && d.total != null)
    .reduce((s, d) => s + (d.total as number), 0);
  const emprendimientoBooleanoMr = impactoFinancieroMrFiltrada
    .filter((d) => d.dimension === 'tiene_emprendimiento' && d.total != null)
    .map((d) => ({
      nombre: d.categoria === 'si' ? 'Con emprendimiento' : 'Sin emprendimiento',
      total: d.total as number,
      color: d.categoria === 'si' ? C.verde : C.amarillo,
    }));

  const mapaEmprendimiento = agregarEmprendimiento(pubEmprendimientoFiltrada);
  const emprendimientoOrdenado = ORDEN_SITUACION.map((s) => ({
    nombre: ETIQUETA_SITUACION[s],
    total: mapaEmprendimiento.get(s)?.total ?? 0,
    color: COLOR_SITUACION[s],
  }));
  const empVsCursos = ORDEN_SITUACION.map((s) => {
    const acc = mapaEmprendimiento.get(s);
    const prom = acc && acc.pesoCursos ? acc.sumaCursos / acc.pesoCursos : 0;
    return {
      etiqueta: ETIQUETA_SITUACION[s].replace('Emprendimiento ', '').replace('Tiene una ', ''),
      cursos: prom,
    };
  });

  // Renderiza una dimensión de v_pub_demografia como tarjeta — real, "no aplica" (esta fuente
  // nunca trae ese dato para el programa elegido) o "sin datos" (el filtro vigente no trae
  // filas, pero el programa sí tiene la fuente). "No aplica" se decide SOLO con datos reales
  // (dimensionAplicaPrograma revisa si v_pub_demografia trae alguna fila) — no por programa
  // hardcodeado, para no repetir el hallazgo de 2026-08-06 (JC sí tiene estas 4 dimensiones
  // desde ese día, ver docs/procesos/demografia-historica-jc.md).
  function TarjetaDemografia({ dimension }: { dimension: (typeof DIMENSIONES_DEMOGRAFIA)[number] }) {
    if (!dimensionAplicaPrograma(dimension)) {
      return (
        <Seccion titulo={ETIQUETA_DIMENSION[dimension]}>
          <NoAplica motivo="esta fuente no tiene ese dato para este programa." />
        </Seccion>
      );
    }
    const mapa = agregarPorCategoria(pubDemografiaFiltrada, dimension);
    if (mapa.size === 0) {
      return (
        <Seccion titulo={ETIQUETA_DIMENSION[dimension]}>
          <NoAplica motivo="sin datos para este filtro (cohorte/estado/ciudad elegidos)." suave />
        </Seccion>
      );
    }

    // "sin dato" real (auditoría 2026-08-28): comparado contra el canon de la cohorte
    // (demografiaTotalEsperado, ver definición) — null con ciudad elegida, ese caso no se
    // marca (sin canon confiable por ciudad, mismo criterio que MR).
    const sumaDimension = Array.from(mapa.values()).reduce((a, b) => a + b, 0);
    const sinDato = demografiaTotalEsperado != null ? Math.max(0, demografiaTotalEsperado - sumaDimension) : 0;

    if (dimension === 'genero') {
      const filas = Array.from(mapa.entries()).map(([categoria, total]) => ({
        nombre: categoria,
        total,
        color: COLOR_GENERO[categoria] ?? C.amarillo,
      }));
      return (
        <Seccion titulo={ETIQUETA_DIMENSION[dimension]}>
          <PuntoSinDato cantidad={sinDato} />
          <GraficoEmprendimiento datos={filas} />
        </Seccion>
      );
    }
    if (dimension === 'estado_civil' || dimension === 'tipo_vivienda') {
      const filas = Array.from(mapa.entries()).map(([categoria, total], i) => ({
        nombre: ETIQUETA_MR[categoria] ?? categoria,
        total,
        color: [C.naranja, C.azul2, C.verde, C.amarillo, C.rojo][i % 5],
      }));
      return (
        <Seccion titulo={ETIQUETA_DIMENSION[dimension]}>
          <PuntoSinDato cantidad={sinDato} />
          <GraficoEmprendimiento datos={filas} />
        </Seccion>
      );
    }
    // edad_rango / estrato / nivel_estudio: barras, con orden fijo cuando existe.
    const orden = dimension === 'edad_rango' && programa === 'jc' ? ORDEN_EDAD_JC : ORDEN_MR[dimension];
    let filas = Array.from(mapa.entries()).map(([categoria, total]) => ({
      etiqueta: dimension === 'estrato' ? `Estrato ${categoria}` : (ETIQUETA_MR[categoria] ?? categoria),
      total,
      orden: categoria,
    }));
    if (orden) filas.sort((a, b) => orden.indexOf(a.orden) - orden.indexOf(b.orden));
    return (
      <Seccion titulo={ETIQUETA_DIMENSION[dimension]} nota={dimension === 'edad_rango' ? 'En rangos — nunca edades individuales.' : undefined}>
        <PuntoSinDato cantidad={sinDato} />
        <GraficoBarras datos={filas} dataKey="total" nombre="Personas" color={C.azul2} />
      </Seccion>
    );
  }

  // Universo COMPLETO MR (v_pub_mr_demografia_universo, migración 056) — sin filtro de
  // cohorte/estado/ciudad, "un solo grupo" (pedido explícito 2026-08-27). Mismo shape que
  // PubDemografia, así que reusa ETIQUETA_MR/ORDEN_MR/GraficoBarras/GraficoEmprendimiento tal
  // cual. Comparado contra el Power BI externo tocaunavida.org/reportes-mr.
  const DIMENSIONES_UNIVERSO_MR = [
    'tipo_vivienda', 'estrato', 'nivel_estudio', 'estado_civil', 'edad_rango',
    'ingresos_familiares', 'tipo_credito',
  ] as const;
  const ETIQUETA_DIMENSION_UNIVERSO: Record<string, string> = {
    tipo_vivienda: 'Tipo de vivienda',
    estrato: 'Estrato socioeconómico',
    nivel_estudio: 'Nivel de estudios',
    estado_civil: 'Estado civil',
    edad_rango: 'Distribución de edad',
    ingresos_familiares: 'Ingresos familiares',
    tipo_credito: 'Acceso a crédito (Microcrédito / iCredit)',
  };
  function TarjetaDemografiaUniverso({ dimension }: { dimension: (typeof DIMENSIONES_UNIVERSO_MR)[number] }) {
    // Filtro de año (migración 059, pedido 2026-08-27) — 'todos' suma como antes, un año
    // puntual filtra primero. A PROPÓSITO sin filtro de ciudad: cruzar año x ciudad x estas 7
    // dimensiones perdía 32.4% de personas a supresión k-anonimato (medido, ver 059) — si hay
    // una ciudad elegida en el header se avisa (NotaFiltros) en vez de aplicarla en silencio.
    const mapa = new Map<string, number>();
    for (const f of datos?.mrDemografiaUniverso ?? []) {
      if (f.dimension !== dimension || f.total == null) continue;
      if (anioUniversoMr !== 'todos' && f.anio_registro !== anioUniversoMr) continue;
      mapa.set(f.categoria, (mapa.get(f.categoria) ?? 0) + f.total);
    }
    if (mapa.size === 0) {
      return (
        <Seccion titulo={ETIQUETA_DIMENSION_UNIVERSO[dimension]}>
          <NoAplica motivo="sin datos suficientes para esta dimensión (o vista aún no aplicada)." suave />
        </Seccion>
      );
    }
    // "sin dato" = universo del año vigente menos lo que suma esta dimensión. NO aplica a
    // tipo_credito -- ese campo no es "todas deberían tenerlo y algunas no lo llenaron", es
    // presencia de un microcrédito/iCredit real (la inmensa mayoría nunca tuvo uno, eso no es
    // un dato faltante). Para el resto sí es un campo demográfico esperable de cualquiera.
    const sumaDimension = Array.from(mapa.values()).reduce((a, b) => a + b, 0);
    const sinDato = dimension === 'tipo_credito' ? 0 : Math.max(0, universoNacionalAnioActualMr - sumaDimension);

    if (dimension === 'estado_civil' || dimension === 'tipo_vivienda' || dimension === 'tipo_credito') {
      const filas = Array.from(mapa.entries()).map(([categoria, total], i) => ({
        nombre: ETIQUETA_MR[categoria] ?? categoria,
        total,
        color: [C.naranja, C.azul2, C.verde, C.amarillo, C.rojo][i % 5],
      }));
      return (
        <Seccion titulo={ETIQUETA_DIMENSION_UNIVERSO[dimension]}>
          <PuntoSinDato cantidad={sinDato} />
          <GraficoEmprendimiento datos={filas} />
        </Seccion>
      );
    }
    const orden = ORDEN_MR[dimension];
    const filas = Array.from(mapa.entries())
      .map(([categoria, total]) => ({
        etiqueta: dimension === 'estrato' ? `Estrato ${categoria}` : (ETIQUETA_MR[categoria] ?? categoria),
        total,
        orden: categoria,
      }))
      .sort((a, b) => (orden ? orden.indexOf(a.orden) - orden.indexOf(b.orden) : b.total - a.total));
    return (
      <Seccion titulo={ETIQUETA_DIMENSION_UNIVERSO[dimension]} nota={dimension === 'edad_rango' ? 'En rangos — nunca edades individuales.' : undefined}>
        <PuntoSinDato cantidad={sinDato} />
        <GraficoBarras datos={filas} dataKey="total" nombre="Personas" color={C.naranja} rotarEtiquetas={dimension === 'ingresos_familiares'} />
      </Seccion>
    );
  }

  // Vista por defecto de MR (2026-08-27, toggle Universo/Q10 de arriba): universo histórico
  // completo, sin cohorte/Q10 — KPI (v_pub_mr_universo) + demografía (v_pub_mr_demografia_
  // universo) + formación (v_pub_mr_formacion_universo). Mismo contenido que ya vivía dentro
  // de los tabs Resumen/Demografía (se deja igual ahí, sin tocar, para cuando el toggle está
  // en "Datos Q10" y se navega por tabs) — acá se repite standalone para que sea lo primero
  // que se ve, sin tabs, sin depender de cohorte/estado.
  // Mini-header fijo (sticky) con los selectores de Año y Ciudad — pedido 2026-08-27: que
  // quede a la vista mientras se hace scroll por KPI/Demografía/Formación, en vez de perderse
  // arriba de la página. Año mueve las tres vistas; Ciudad SOLO mueve el KPI (ver nota abajo
  // del header y comentario en TarjetaDemografiaUniverso/Formación sobre por qué).
  function BarraUniversoMr() {
    const pill = (activo: boolean) =>
      `px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
        activo ? 'pill-metal pill-metal-rosa' : 'text-slate-600 hover:bg-slate-100'
      }`;
    return (
      <div className="sticky top-2 z-30 mb-5">
        <div className="tarjeta-glass p-2 shadow-lg backdrop-blur-md flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 pl-1 pr-0.5">Año:</span>
            <button onClick={() => setAnioUniversoMr('todos')} className={pill(anioUniversoMr === 'todos')}>Todos</button>
            {HISTORICO_Q10_MR.map((a) => (
              <button key={a.anio} onClick={() => setAnioUniversoMr(a.anio)} className={pill(anioUniversoMr === a.anio)}>
                {a.anio}
              </button>
            ))}
          </div>
          {ciudadesUniversoMr.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 pl-1 pr-0.5">Ciudad:</span>
              <button onClick={() => setCiudadElegida(null)} className={pill(ciudadElegida === null)}>Todas</button>
              {ciudadesUniversoMr.slice(0, 12).map(([ciudad, total]) => (
                <button key={ciudad} onClick={() => setCiudadElegida(ciudad)} className={pill(ciudadElegida === ciudad)}>
                  {ETIQUETA_GRUPO[ciudad] ?? ciudad} · {total.toLocaleString('es-CO')}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1 px-1">
          Ciudad solo filtra el KPI de arriba — Demografía y Formación se quedan a nivel nacional (cruzar por ciudad ahí perdería ~32% de las mujeres a supresión de privacidad, grupos muy chicos).
        </p>
      </div>
    );
  }

  function VistaUniversoMr() {
    return (
      <>
        <BarraUniversoMr />
        {mrUniversoResumenFiltrado && (
          <Seccion
            titulo="Universo de Mujeres ROFÉ (con y sin Q10)"
            nota={
              (ciudadElegida
                ? `Solo ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}`
                : 'Todas las ciudades'
              ) +
              (anioUniversoMr === 'todos' ? ', todos los años' : `, año ${anioUniversoMr}`) +
              '. Incluye TODAS las mujeres registradas en la base (postulantes y matriculadas), no solo las que tienen curso en Q10 — por eso "Sin Q10" suele ser la mayoría, no un error.'
            }
          >
            {mrUniversoResumenFiltrado.hayDatos ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Kpi titulo="Universo total" valor={mrUniversoResumenFiltrado.total.toLocaleString('es-CO')} detalle="Con y sin matrícula Q10" />
                  <Kpi titulo="Con Q10" valor={mrUniversoResumenFiltrado.conQ10.toLocaleString('es-CO')} detalle="Matricularon en un curso" acento={C.verde} />
                  <Kpi titulo="Sin Q10" valor={mrUniversoResumenFiltrado.sinQ10.toLocaleString('es-CO')} detalle="Solo candidatas/postulantes, aún cuentan" acento={C.naranja} />
                </div>
                <PuntoSinDato
                  cantidad={mrUniversoResumenFiltrado.sinDatoQ10}
                  className="mt-3"
                  texto={`+${mrUniversoResumenFiltrado.sinDatoQ10.toLocaleString('es-CO')} más sin fecha de registro identificable — cuentan en el total, pero no se muestra si tienen Q10 o no (grupo muy chico para desglosar sin arriesgar privacidad).`}
                />
              </>
            ) : (
              <NoAplica motivo="no hay mujeres registradas para este año/ciudad." suave />
            )}
          </Seccion>
        )}
        <NotaFiltros inaplicables={ciudadElegida ? ['Ciudad (Demografía y Formación quedan a nivel nacional, ver header)'] : []} />
        <div className="grid md:grid-cols-2 gap-6 my-6">
          {DIMENSIONES_UNIVERSO_MR.map((dim) => (
            <TarjetaDemografiaUniverso key={dim} dimension={dim} />
          ))}
        </div>

        {/* Formación — cursos MR por año, ESTÁTICO (2026-08-27, ver HISTORICO_Q10_MR arriba).
            Rediseño del mismo día: reemplaza el histograma en vivo 0/1/2/3+ (que salía de
            enrollments/v_pub_mr_formacion_universo, con huecos reales pre-2027, ver ADR) por
            el detalle real por curso del informe oficial -- inscritas/iniciados/completados --
            ya usado en la sección "Histórico Q10 por año" (fusionada acá, no se duplica más).
            "Nunca llegaron a Bienvenida" es la población real de "0 cursos" pedida por Samuel:
            se acerca con bd - Σiniciados, marcado explícitamente como aproximación (piso, no
            exacto) porque "iniciados" es a nivel de inscripción-curso, no de persona única. */}
        {(() => {
          const suma = (cursos: CursoHistoricoMr[], campo: 'inscritas' | 'iniciados' | 'completados') =>
            cursos.reduce((s, c) => s + (c[campo] ?? 0), 0);
          const anioSel = anioUniversoMr === 'todos' ? null : HISTORICO_Q10_MR.find((a) => a.anio === anioUniversoMr) ?? null;
          const anioMasReciente = HISTORICO_Q10_MR[HISTORICO_Q10_MR.length - 1].anio;
          // BUG REAL 2026-08-28 (encontrado por Samuel: esta caja decía "5.109" mientras el KPI
          // de arriba, en vivo, ya mostraba 5.100 -- dos cifras distintas para "el total de
          // Mujeres ROFÉ" en la misma página). Causa: "Todos" y el año más reciente usaban el
          // `bd` ESTÁTICO de HISTORICO_Q10_MR (congelado el día que se escribió, nunca se
          // vuelve a tocar por diseño -- ver ADR). Pero para 'Todos' y para el año en curso
          // (2026), "BD acumulado hasta ese año" y "universo real de hoy" son EXACTAMENTE el
          // mismo concepto -- no hay motivo para tener dos números. Fix: esos dos casos ahora
          // leen `universoNacionalTotalMr` (la MISMA fuente que el KPI de arriba, ver su
          // comentario) -- nunca más pueden divergir porque son literalmente el mismo cálculo.
          // Los años CERRADOS (2022-2025) sí se quedan con el `bd` estático -- ahí es correcto
          // que no calce con hoy: es una foto histórica de ESE año, no del presente.
          const bd = !anioSel || anioSel.anio === anioMasReciente ? universoNacionalTotalMr : anioSel.bd;
          const inscritosTotales = anioSel
            ? suma(anioSel.cursos, 'inscritas')
            : HISTORICO_Q10_MR.reduce((s, a) => s + suma(a.cursos, 'inscritas'), 0);
          const iniciadosTotales = anioSel
            ? suma(anioSel.cursos, 'iniciados')
            : HISTORICO_Q10_MR.reduce((s, a) => s + suma(a.cursos, 'iniciados'), 0);
          const aprobadosTotales = anioSel
            ? suma(anioSel.cursos, 'completados')
            : HISTORICO_Q10_MR.reduce((s, a) => s + suma(a.cursos, 'completados'), 0);
          const nuncaBienvenida = Math.max(0, bd - iniciadosTotales);
          return (
            <Seccion
              titulo="Formación — cursos MR por año (foto fija, no en vivo)"
              nota={
                'Dato oficial hasta 2026 (informe Excel de Samuel) — desde 2027 el seguimiento Q10 pasa a ser completo y auditado en vivo, ver ADR. ' +
                (marcoFormacionMr === 'inscritas'
                  ? '% de la tabla = completaron ÷ se inscribieron (incluye a quien nunca entró a la plataforma).'
                  : '% de la tabla = completaron ÷ SÍ llegaron a Bienvenida (excluye a quien nunca entró).') +
                (anioSel?.anio === '2025'
                  ? ' 2025 en particular: "Iniciaron"/"Completados" son la unión de 3 fuentes (informe oficial + archivos descargados de Q10 por curso + Supabase), quedándose con el valor más grande de cada una por curso — un piso, no una cifra auditada.'
                  : '')
              }
            >
              {(!anioSel || (anioSel.anio !== '2025' && anioSel.anio !== '2026')) && (
                <p className="text-xs rounded-lg px-3 py-2 mb-4" style={{ background: `${C.rojo}15`, color: C.rojo }}>
                  ⚠ Sin trazabilidad confirmada antes de 2025: la coordinación confirmó
                  (2026-08-31) que 2022-2024 no tienen un consolidado válido verificable — ni
                  el Excel oficial ni Q10 capturaron esos años completos (ver auditoría cruzada
                  en postulantes-mr-supabase.md). Solo 2025 y 2026 son corroborables hoy;
                  {anioSel ? ` los números de ${anioSel.anio} de abajo son la mejor referencia disponible, no una cifra auditada.` : ' "Todos" suma años sin auditar junto con los que sí lo están.'}
                </p>
              )}
              <div className="flex gap-1 tarjeta-glass p-1 w-fit mb-4 flex-wrap">
                {([['inscritas', 'Se inscribió y completó'], ['iniciados', 'Ingresó a Q10 y completó']] as const).map(([v, txt]) => (
                  <button
                    key={v}
                    onClick={() => setMarcoFormacionMr(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      marcoFormacionMr === v ? 'pill-metal pill-metal-rosa' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {txt}
                  </button>
                ))}
              </div>
              <Kpi
                titulo={anioSel ? `BD total ${anioSel.anio}` : 'BD total — análisis TODOS (2022-2026)'}
                valor={bd.toLocaleString('es-CO')}
                detalle={
                  !anioSel || anioSel.anio === anioMasReciente
                    ? 'Universo real de Mujeres ROFÉ HOY, en vivo — mismo número que el KPI de arriba'
                    : `Foto histórica del informe oficial a cierre de ${anioSel.anio} (registradas acumuladas hasta ese año) — no calza con el universo de hoy a propósito, es un dato del pasado`
                }
              />
              <div className="mt-3 mb-4">
                <EmbudoFormacionMr
                  titulo={anioSel ? `Embudo ${anioSel.anio}` : 'Embudo — todos los años juntos'}
                  ceroCursos={nuncaBienvenida}
                  inscritos={inscritosTotales}
                  iniciados={iniciadosTotales}
                  aprobados={aprobadosTotales}
                />
              </div>
              <p className="text-[11px] text-slate-400 mb-4">
                "0 cursos" (nunca llegaron a Bienvenida) = BD − Σiniciados, aproximado (piso): "iniciados" es a nivel de matrícula por curso (si una mujer empezó 2 cursos, resta 2 veces), no hay dato de persona única antes de 2027. El resto del embudo (matrículas/Q10/aprobados) también es a nivel de matrícula-curso, no headcount único.
              </p>
              {!anioSel ? (
                <div className="overflow-x-auto">
                  <p className="text-xs text-slate-400 mb-2">
                    2025 vs 2026 — los únicos 2 años con dato corroborable (ver aviso arriba). Una
                    fila por curso × año; 2022-2024 no se listan acá por la misma razón del aviso.
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-4">Curso</th>
                        <th className="py-2 pr-4 text-right">Año</th>
                        <th className="py-2 pr-4 text-right">Iniciaron en Q10</th>
                        <th className="py-2 text-right">Completados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['2025', '2026'] as const).flatMap((anio) => {
                        const bloque = HISTORICO_Q10_MR.find((a) => a.anio === anio);
                        return (bloque?.cursos ?? []).map((curso) => (
                          <tr key={`${curso.nombre}-${anio}`} className="border-b border-slate-100">
                            <td className="py-2 pr-4">{curso.nombre}</td>
                            <td className="py-2 pr-4 text-right text-slate-400">{anio}</td>
                            <td className="py-2 pr-4 text-right">
                              {curso.iniciados != null ? curso.iniciados.toLocaleString('es-CO') : '—'}
                            </td>
                            <td className="py-2 text-right font-semibold" style={{ color: C.verde }}>
                              {curso.completados != null ? curso.completados.toLocaleString('es-CO') : 'Sin datos aún'}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-4">Curso</th>
                        <th className="py-2 pr-4 text-right">Matrículas</th>
                        <th className="py-2 pr-4 text-right">Sin iniciar</th>
                        <th className="py-2 text-right">Completaron</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anioSel.cursos.map((curso) => {
                        const sinIniciar = curso.inscritas != null && curso.iniciados != null ? curso.inscritas - curso.iniciados : null;
                        const denom = marcoFormacionMr === 'inscritas' ? curso.inscritas : curso.iniciados;
                        const pct = denom && curso.completados != null ? Math.round((100 * curso.completados) / denom) : null;
                        return (
                          <tr key={curso.nombre} className="border-b border-slate-100">
                            <td className="py-2 pr-4">{curso.nombre}</td>
                            <td className="py-2 pr-4 text-right">{curso.inscritas?.toLocaleString('es-CO') ?? '—'}</td>
                            <td className="py-2 pr-4 text-right" style={{ color: sinIniciar ? C.naranja : undefined }}>
                              {sinIniciar != null ? sinIniciar.toLocaleString('es-CO') : '—'}
                            </td>
                            <td className="py-2 text-right font-semibold" style={{ color: C.verde }}>
                              {curso.completados != null ? `${curso.completados.toLocaleString('es-CO')}${pct != null ? ` (${pct}%)` : ''}` : 'Sin datos aún'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs text-slate-400 mt-2">
                    "Sin iniciar" y el % son por curso — si una mujer se inscribió en varios cursos ese año, puede contar más de una vez (a nivel de matrícula, no de persona única).
                  </p>
                </div>
              )}
            </Seccion>
          );
        })()}

        {/* Créditos — desembolso real, ESTÁTICO (2026-08-27, ver CREDITO_HISTORICO_MR
            arriba). Cifras del equipo financiero, distintas de "Acceso a crédito" del tab
            Emprendimiento (esa cuenta personas en Supabase; esta es el desembolso real
            reportado, no necesariamente calza persona a persona con lo que hay cargado). */}
        <Seccion
          titulo="Créditos — desembolso real"
          nota="Cifras oficiales del equipo financiero (2026-08-27). Distinto de 'Acceso a crédito' del tab Emprendimiento — ese cuenta personas ya cargadas en Supabase; esto es el desembolso real reportado."
        >
          <div className="flex gap-1 tarjeta-glass p-1 w-fit mb-4">
            {([['beneficiadas', 'Total beneficiadas'], ['continuan', 'Chicas que continúan']] as const).map(([v, txt]) => (
              <button
                key={v}
                onClick={() => setVistaCreditoMr(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  vistaCreditoMr === v ? 'pill-metal pill-metal-rosa' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {txt}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {CREDITO_HISTORICO_MR.map((c) => (
              <Kpi
                key={c.tipo}
                titulo={`${c.tipo} ${c.anio}`}
                valor={
                  vistaCreditoMr === 'beneficiadas'
                    ? c.beneficiadas.toLocaleString('es-CO')
                    : `${c.continuan.toLocaleString('es-CO')} (${c.pctContinuan}%)`
                }
                detalle={
                  vistaCreditoMr === 'beneficiadas'
                    ? 'Mujeres beneficiadas con el crédito'
                    : `De ${c.beneficiadas} beneficiadas — ${c.nuncaPagaron} nunca pagaron`
                }
                acento={vistaCreditoMr === 'beneficiadas' ? C.azul3 : C.verde}
              />
            ))}
          </div>
        </Seccion>
      </>
    );
  }

  return (
    <>
      <Hero tema={programa} />
      <BackgroundPaths tema={programa} />
      {/* tema-mr activa la paleta naranja de Mujeres ROFÉ en todo el panel */}
      <div
        id="panel"
        className={`max-w-[1600px] mx-auto px-4 py-8 scroll-mt-20 ${programa === 'mr' ? 'tema-mr' : ''}`}
      >
      {/* Frescura del dato + botón para forzar el ETL de n8n bajo demanda (ver BotonActualizar). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        {frescuraResumen && (
          <p
            className={`text-xs ${
              frescuraResumen.vencido ? 'text-rofe-rojo font-semibold' : 'text-slate-400'
            }`}
          >
            {frescuraResumen.vencido ? '⚠ ' : ''}
            Datos actualizados hace {frescuraResumen.horas.toFixed(1)} h
            {frescuraResumen.vencido ? ' — puede que el sync nocturno no haya corrido' : ''}
          </p>
        )}
        <BotonActualizar
          onDone={() => cargarTodo().then(setDatos).catch((e) => setError(String(e)))}
        />
      </div>
      {/* Selector de programa */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 tarjeta-glass p-1">
          {(['jc', 'mr'] as Programa[]).map((p) => (
            <button
              key={p}
              onClick={() => cambiarPrograma(p)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                programa === p
                  ? p === 'mr'
                    ? 'pill-metal pill-metal-rosa'
                    : 'pill-metal pill-metal-azul'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {NOMBRE_PROGRAMA[p]}
            </button>
          ))}
        </div>
        {/* Toggle Universo/Q10, SOLO MR (2026-08-27). Por defecto "Universo histórico" — no
            depende de cohorte, no necesita el resto de controles de abajo. "Q10" revela el
            selector de cohorte + los tabs de siempre, sin tocar su lógica. */}
        {programa === 'mr' && (
          <div className="flex gap-1 tarjeta-glass p-1">
            {([[false, '📊 Universo histórico'], [true, '🎓 Datos Q10 (matriculadas)']] as const).map(
              ([val, txt]) => (
                <button
                  key={String(val)}
                  onClick={() => setMostrarQ10Mr(val)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mostrarQ10Mr === val ? 'pill-metal pill-metal-rosa' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {txt}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {programa === 'mr' && !mostrarQ10Mr ? (
        <VistaUniversoMr />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Selector de cohorte (actual + históricas de Q10). "Todos" solo para Mujeres ROFÉ
            (2026-08-31): tras el backfill de archivado=true ya hay histórico real 2023-2026,
            a diferencia de JC donde "Todos" mezclaría procesos muy distintos (Retención/
            Asistencia/Emoflow) que no están pensados para verse combinados entre años. */}
        <div className="flex gap-1 tarjeta-glass p-1">
          {(programa === 'mr' ? ['todos', ...cohortes] : cohortes).map((coh) => (
            <button
              key={coh}
              onClick={() => cambiarCohorte(coh)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                cohorte === coh
                  ? 'pill-metal pill-metal-verde'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {coh === 'todos' ? 'Todos' : coh}
            </button>
          ))}
        </div>
        {/* Filtro global "Estado" (NUEVO, migración 037): reemplaza la exposición pasiva de
            activos/retirados por un control real, propagado a Resumen/Cursos/Demografía/
            Emprendimiento/Emoflow/Asistencia. */}
        <div className="flex gap-1 tarjeta-glass p-1">
          {(['activos', 'todos', 'retirados'] as Estado[]).map((e) => (
            <button
              key={e}
              onClick={() => setEstado(e)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                estado === e ? 'pill-metal pill-metal-amarillo' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {ETIQUETA_ESTADO[e]}
            </button>
          ))}
        </div>
        {/* Selector de ciudad/municipio UNIFICADO (§2.1.4) — ambos programas, drill-down de
            municipio integrado como segunda fila en vez de una sección aparte. */}
        {gruposGeografia.length > 0 && (
          <div className="flex flex-col gap-1 tarjeta-glass p-1">
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => { setCiudadElegida(null); setMunicipioElegido(null); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  ciudadElegida === null ? 'pill-metal pill-metal-amarillo' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Todas
                {retencionPorCiudad.total != null && (
                  <span className="font-bold" style={{ color: colorRetencion(retencionPorCiudad.total) }}> · {retencionPorCiudad.total}%</span>
                )}
              </button>
              {gruposGeografia.map(({ grupo, total }) => {
                const ret = retencionPorCiudad.mapa.get(grupo);
                return (
                <button
                  key={grupo}
                  onClick={() => { setCiudadElegida(grupo); setMunicipioElegido(null); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    ciudadElegida === grupo ? 'pill-metal pill-metal-naranja' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {ETIQUETA_GRUPO[grupo] ?? grupo} · {total}
                  {ret != null && (
                    <span className="font-bold" style={{ color: colorRetencion(ret.pct) }}> · {ret.pct}%</span>
                  )}
                </button>
                );
              })}
            </div>
            {retencionPorCiudad.total != null && (
              <p className="text-[11px] text-slate-400 px-1">
                Cada ciudad: <b>personas activas</b> · <b style={{ color: C.verde }}>% retención</b> (verde ≥90 · ámbar ≥80 · rojo &lt;80).
              </p>
            )}
            {/* Solo en Resumen (auditoría 2026-08-26): ninguna otra pestaña tiene datos con
                desglose de municipio (Demografía/Emprendimiento/Asistencia/Emoflow/Cursos/
                Historial solo llegan a grupo_ciudad) — mostrarlo ahí era un control decorativo
                que no cambiaba nada. Mejor ocultarlo donde no aplica que dejarlo clickeable
                sin efecto. */}
            {tab === 'Resumen' && ciudadElegida && municipiosGrupo.length > 1 && (
              <div className="flex gap-1 flex-wrap pl-2 border-l-2 border-slate-200/70">
                <button
                  onClick={() => setMunicipioElegido(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    municipioElegido === null ? 'pill-metal pill-metal-oscuro' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Todo {ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}
                </button>
                {municipiosGrupo.map((m) => (
                  <button
                    key={m.municipio}
                    onClick={() => setMunicipioElegido(m.municipio)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      municipioElegido === m.municipio ? 'pill-metal pill-metal-oscuro' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {m.municipio} · {m.personas}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Tabs — 8 para JC. Para MR, Retención y Asistencia se quitan del todo (pedido
            2026-08-27): miden procesos que MR no tiene estructurados como JC (selección
            anual por cohorte / sesiones con asistencia Zoom capturada) — no es "sin datos
            para este filtro", es que el proceso no existe, así que no tiene sentido dejar el
            botón. El resto decide "no aplica" internamente como siempre. */}
        <nav className="flex gap-1 tarjeta-glass p-1 flex-wrap">
          {TABS.filter((t) => programa !== 'mr' || (t !== 'Retención' && t !== 'Asistencia')).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'pill-metal pill-metal-oscuro' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'Resumen' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3 mb-5">
            {!esActual && !hayFiltroCiudad && kpis.ingresados != null ? (
              // COHORTE CERRADA → header 100% CANON (v_pub_cohorte), idéntico a panel_control_gui
              // (fuente verificada por el equipo). NO se usa v_programa_stats aquí: esa vista incluye
              // staff + perfiles de prueba (737 vs 722 en 2025) y arrastra cifras viejas sin reconciliar
              // (2024=470 vs 608). El filtro Estado sigue disponible; en cohorte cerrada todas las cifras
              // canónicas se muestran juntas (activos/retirados/ingresados), como en el GUI.
              <>
                <Kpi titulo={`Ingresados ${NOMBRE_PROGRAMA[programa]}`} valor={String(kpis.ingresados)} detalle={`Cohorte ${etiquetaCohorte} — universo oficial (canon, sin staff ni pruebas)`} />
                <Kpi titulo="Retención" valor={kpis.ingresados ? `${((100 * (kpis.activos ?? 0)) / kpis.ingresados).toFixed(1)}%` : '—'} acento={C.verde} />
                <Kpi titulo="Deserción" valor={kpis.ingresados ? `${((100 * (kpis.retirados ?? 0)) / kpis.ingresados).toFixed(1)}%` : '—'} acento={C.rojo} />
                <Kpi titulo="Culminantes" valor={kpis.activos != null ? String(kpis.activos) : '—'} detalle="terminaron el programa (canon)" />
                <Kpi titulo="Retirados" valor={kpis.retirados != null ? String(kpis.retirados) : '—'} detalle="se retiraron (canon)" />
                <Kpi titulo="Cursos" valor={String(cursosProg.length)} detalle={`Ruta ${NOMBRE_PROGRAMA[programa]} ${etiquetaCohorte}`} />
              </>
            ) : (
              <>
            {kpis.cifraEstado !== null && (esActual || !hayFiltroCiudad) ? (
              <Kpi
                titulo={
                  esActual
                    ? `${ETIQUETA_ESTADO[estado]} ${NOMBRE_PROGRAMA[programa]}`
                    : `${estado === 'activos' ? 'Culminantes' : estado === 'retirados' ? 'Retirados' : 'Ingresados'} ${NOMBRE_PROGRAMA[programa]}`
                }
                valor={String(kpis.cifraEstado)}
                detalle={
                  estado === 'todos'
                    ? `Cohorte ${etiquetaCohorte} completa: ${kpis.ingresados ?? '—'} ingresados (canon oficial)`
                    : estado === 'retirados'
                      ? `De ${kpis.ingresados ?? '—'} ingresados en la cohorte ${etiquetaCohorte} (canon oficial)`
                      : kpis.usarActualesSeguimiento
                        ? undefined
                        : `De ${kpis.ingresados ?? '—'} ingresados en la cohorte ${etiquetaCohorte} (canon oficial)`
                }
              />
            ) : (
              <Kpi
                titulo={
                  ciudadElegida
                    ? `Participantes en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}`
                    : `Participantes ${NOMBRE_PROGRAMA[programa]}`
                }
                valor={String(kpis.participantes)}
                detalle={
                  ciudadElegida
                    ? `Activos en la cohorte ${etiquetaCohorte}. La cohorte canónica (ingresados = activos + retirados) no tiene desglose por ciudad.`
                    : esActual
                      ? `Activos en la cohorte ${etiquetaCohorte}`
                      : `Cohorte ${etiquetaCohorte} (histórico Q10 — no incluye retirados)`
                }
              />
            )}
            {/* Retención y Deserción — las dos métricas clave, como par de casillas verde/roja.
                Sin filtro de ciudad → cifras de la cohorte (canon). Con una ciudad elegida → las
                MISMAS casillas pero de esa ciudad (v_pub_retencion_ciudad), pedido de Samuel.
                JC vigente (usarActualesSeguimiento): activos EN VIVO (mismo Seguimiento que
                "Actuales") sobre el ingresados canon (832) — no cohorte_ingresos.activos, que se
                atrasa frente al retiro del día (pedido de Samuel 2026-09-07). */}
            {kpis.ingresados != null && kpis.activosRetencion != null ? (
              <>
                <Kpi
                  titulo="Retención"
                  valor={`${((100 * kpis.activosRetencion) / kpis.ingresados).toFixed(1)}%`}
                  detalle={kpis.usarActualesSeguimiento ? `${kpis.activosRetencion} activos ahora ÷ ${kpis.ingresados} ingresados (canon)` : undefined}
                  acento={C.verde}
                />
                <Kpi
                  titulo="Deserción"
                  valor={`${(100 - (100 * kpis.activosRetencion) / kpis.ingresados).toFixed(1)}%`}
                  detalle={kpis.usarActualesSeguimiento ? 'Incluye retiros aún sin confirmar en el canon' : undefined}
                  acento={C.rojo}
                />
              </>
            ) : ciudadElegida && retencionPorCiudad.mapa.get(ciudadElegida) ? (() => {
              const rc = retencionPorCiudad.mapa.get(ciudadElegida)!;
              const ciu = ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida;
              return (
                <>
                  <Kpi titulo={`Retención · ${ciu}`} valor={`${rc.pct.toFixed(1)}%`} acento={C.verde} />
                  <Kpi titulo={`Deserción · ${ciu}`} valor={`${((100 * rc.retirados) / rc.ingresados).toFixed(1)}%`} acento={C.rojo} />
                </>
              );
            })() : null}
            <Kpi
              titulo="Matrículas"
              valor={String(kpis.matriculas)}
              detalle={kpis.esCanonico
                ? `Inscripciones en ${kpis.numCursos} cursos (cohorte completa)`
                : `${kpis.pctCompletadas}% completadas (>80% avance)`}
            />
            <Kpi
              titulo="Avance promedio"
              valor={kpis.promedio}
              detalle={kpis.esCanonico ? 'Ponderado por matrículas (cohorte completa)' : 'Promedio aritmético'}
            />
            {esActual && kpis.pctAprobados && kpis.pctAprobados !== '—' ? (
              <Kpi titulo="Aprobados" valor={kpis.pctAprobados} detalle="Avance ≥80% (cohorte completa)" />
            ) : null}
            {esActual && kpis.edadProm !== '—' ? (
              <Kpi titulo="Edad promedio" valor={kpis.edadProm} detalle="Participantes con dato demográfico" />
            ) : (
              <Kpi
                titulo="Cursos"
                valor={String(esMrTodos ? cursosNormalizadosMr.length : cursosProg.length)}
                detalle={`Ruta ${NOMBRE_PROGRAMA[programa]} ${etiquetaCohorte}`}
              />
            )}
              </>
            )}
          </div>
          {/* Universo completo de Mujeres ROFÉ, SIN discriminar por Q10 (v_pub_mr_universo,
              migración 054) — pedido explícito 2026-08-26, equivalente público de la pestaña
              "👩 Mujeres ROFÉ" del panel de control local. Todo lo de arriba en este tab
              (Ingresados/Retención/Matrículas...) es cohorte-curso Q10, que solo ve ~11% de
              las mujeres reales — esta caja muestra las ~5.3k. */}
          {programa === 'mr' && mrUniversoResumen && (
            <Seccion
              titulo="Universo de Mujeres ROFÉ (con y sin Q10)"
              nota={
                (ciudadElegida
                  ? `Solo ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}. Incluye TODAS las mujeres registradas en la base (postulantes y matriculadas), no solo las que tienen curso en Q10 — por eso "Sin Q10" suele ser la mayoría, no un error.`
                  : 'Incluye TODAS las mujeres registradas en la base (postulantes y matriculadas), no solo las que tienen curso en Q10 — por eso "Sin Q10" suele ser la mayoría, no un error.'
                ) + ' Esta caja solo filtra por Ciudad: Cohorte y Estado (arriba) no la afectan — es el universo completo histórico.'
              }
            >
              {mrUniversoResumen.hayDatos ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Kpi titulo="Universo total" valor={mrUniversoResumen.total.toLocaleString('es-CO')} detalle="Con y sin matrícula Q10" />
                    <Kpi titulo="Con Q10" valor={mrUniversoResumen.conQ10.toLocaleString('es-CO')} detalle="Matricularon en un curso" acento={C.verde} />
                    <Kpi titulo="Sin Q10" valor={mrUniversoResumen.sinQ10.toLocaleString('es-CO')} detalle="Solo candidatas/postulantes, aún cuentan" acento={C.naranja} />
                  </div>
                  <PuntoSinDato
                    cantidad={mrUniversoResumen.sinDatoQ10}
                    className="mt-3"
                    texto={`+${mrUniversoResumen.sinDatoQ10.toLocaleString('es-CO')} más sin fecha de registro identificable — cuentan en el total, pero no se muestra si tienen Q10 o no (grupo muy chico para desglosar sin arriesgar privacidad).`}
                  />
                </>
              ) : (
                <EnConstruccion detalle="Esta vista requiere v_pub_mr_universo (migración 054), propuesta pero aún no aplicada en la base de datos." />
              )}
            </Seccion>
          )}
          {mostrarCanonico && hayFiltroCiudad && !kpis.estadoCohorteCiudad && (
            // BUG corregido 2026-08-26: esta sección desaparecía en silencio al elegir una
            // ciudad (aprobacion_cursos no trae grupo_ciudad) — violaba la regla propia del
            // panel de nunca ocultar algo sin explicar por qué (ver NoAplica arriba). Para JC
            // ahora hay datos reales (ver bloque de abajo, v_pub_aprobacion_ciudad_jc) — este
            // aviso solo aparece cuando de verdad no hay fuente (MR, o ciudad sin datos suficientes).
            <Seccion titulo="Estado de la cohorte">
              <NoAplica
                motivo={
                  programa === 'mr'
                    ? 'este desglose por ciudad todavía no existe para Mujeres ROFÉ.'
                    : `sin datos suficientes de ${ETIQUETA_GRUPO[ciudadElegida ?? ''] ?? ciudadElegida} para este desglose (menos de 5 personas en cada curso — criterio de privacidad).`
                }
                suave
              />
            </Seccion>
          )}
          {kpis.estadoCohorteCiudad && (
            <Seccion
              titulo="Estado de la cohorte"
              nota={`Desglose de las ${kpis.estadoCohorteCiudad.total.toLocaleString('es-CO')} matrículas de ${ETIQUETA_GRUPO[ciudadElegida ?? ''] ?? ciudadElegida} — una persona cuenta en cada curso. ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte}. Se aprueba con avance > 80%.`}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <EstadoStat etiqueta="Aprobadas" valor={kpis.estadoCohorteCiudad.aprobadas} total={kpis.estadoCohorteCiudad.total} color={C.verde} detalle="avance > 80%" />
                <EstadoStat etiqueta="En progreso" valor={kpis.estadoCohorteCiudad.enProgreso} total={kpis.estadoCohorteCiudad.total} color={C.amarillo} detalle="avance 26–80%" />
                <EstadoStat etiqueta="En riesgo" valor={kpis.estadoCohorteCiudad.enRiesgo} total={kpis.estadoCohorteCiudad.total} color={C.naranja} detalle="avance 0–25%" />
                <EstadoStat etiqueta="Retiradas sin aprobar" valor={kpis.estadoCohorteCiudad.retiradas} total={kpis.estadoCohorteCiudad.total} color={C.rojo} detalle="inhabilitadas < 80%" />
              </div>
            </Seccion>
          )}
          {kpis.esCanonico && kpis.estadoCohorte && (
            <Seccion
              titulo="Estado de la cohorte"
              nota={
                unidadEstadoCohorte === 'matriculas'
                  ? `Desglose de las ${kpis.estadoCohorte.total.toLocaleString('es-CO')} matrículas (inscripciones) de la cohorte completa — una persona cuenta en cada curso. ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte}. Se aprueba con avance > 80%.`
                  : kpis.estadoEst
                    ? `Desglose de los ${kpis.estadoEst.total.toLocaleString('es-CO')} estudiantes (personas únicas) según su avance promedio en la cohorte. ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte}. En promedio cada uno ha aprobado ${kpis.estadoEst.promAprobados ?? '—'} cursos.`
                    : 'Sin datos por estudiante para esta cohorte.'
              }
            >
              <div className="flex gap-1 tarjeta-glass p-1 w-fit mb-4">
                <button
                  onClick={() => setUnidadEstadoCohorte('matriculas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    unidadEstadoCohorte === 'matriculas'
                      ? programa === 'mr' ? 'pill-metal pill-metal-rosa' : 'pill-metal pill-metal-azul'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Por matrículas
                </button>
                {estado === 'activos' && (
                  <button
                    onClick={() => setUnidadEstadoCohorte('estudiantes')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      unidadEstadoCohorte === 'estudiantes'
                        ? programa === 'mr' ? 'pill-metal pill-metal-rosa' : 'pill-metal pill-metal-azul'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Por estudiantes
                  </button>
                )}
              </div>
              {unidadEstadoCohorte === 'matriculas' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <EstadoStat etiqueta="Aprobadas" valor={kpis.estadoCohorte.aprobadas} total={kpis.estadoCohorte.total} color={C.verde} detalle="avance > 80%" />
                  <EstadoStat etiqueta="En progreso" valor={kpis.estadoCohorte.enProgreso} total={kpis.estadoCohorte.total} color={C.amarillo} detalle="avance 26–80%" />
                  <EstadoStat etiqueta="En riesgo" valor={kpis.estadoCohorte.enRiesgo} total={kpis.estadoCohorte.total} color={C.naranja} detalle="avance 0–25%" />
                  <EstadoStat etiqueta="Retiradas sin aprobar" valor={kpis.estadoCohorte.retiradas} total={kpis.estadoCohorte.total} color={C.rojo} detalle="inhabilitadas < 80%" />
                </div>
              ) : kpis.estadoEst ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <EstadoStat etiqueta="Al día" valor={kpis.estadoEst.alDia} total={kpis.estadoEst.total} color={C.verde} detalle="avance prom. > 80%" />
                  <EstadoStat etiqueta="En progreso" valor={kpis.estadoEst.enProgreso} total={kpis.estadoEst.total} color={C.amarillo} detalle="avance prom. 26–80%" />
                  <EstadoStat etiqueta="En riesgo" valor={kpis.estadoEst.enRiesgo} total={kpis.estadoEst.total} color={C.naranja} detalle="avance prom. 0–25%" />
                  <EstadoStat etiqueta="Retirados" valor={kpis.estadoEst.retirados} total={kpis.estadoEst.total} color={C.rojo} detalle="inhabilitados de la cohorte" />
                </div>
              ) : (
                <p className="text-sm text-slate-400">Sin datos por estudiante para esta cohorte.</p>
              )}
            </Seccion>
          )}
          {esActual && geografiaResumen && ciudadElegida && (
            <Seccion titulo={`${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}${municipioElegido ? ` · ${municipioElegido}` : ''}`}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <EstadoStat etiqueta="Personas" valor={geografiaResumen.personas} total={geografiaResumen.personas} color={C.azul2} detalle="en esta selección" />
                <EstadoStat etiqueta="Al día" valor={geografiaResumen.aprobados} total={geografiaResumen.personas} color={C.verde} detalle="avance > 80%" />
              </div>
            </Seccion>
          )}
          {/* El panel "Retiro probable" se retiró a pedido de Samuel (2026-08-13): info no
              requerida en el resumen. El seguimiento por ciudad vive ahora en la pestaña Retención. */}
          {/* El desglose de aprobación (aprobados/retirados) sale de aprobacion_cursos, que no
              trae grupo_ciudad. Con una ciudad/municipio elegido caemos al gráfico de completación. */}
          {mostrarCanonico && !hayFiltroCiudad ? (
            <Seccion
              titulo={`Avance de la cohorte por curso — ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]}`}
              nota={`Cada barra suma la cohorte completa que cursó (${kpis.ingresados ?? '—'} ingresados en los cursos base): aprobó = avance > 80%; quien aprobó antes de retirarse conserva su logro.`}
            >
              <GraficoAprobacion datos={aprobacionProg.map(segmentosAprobacion)} />
            </Seccion>
          ) : (
            <Seccion
              titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte}${ciudadElegida ? ` (${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida})` : ''}`}
              nota={ciudadElegida ? `Completado = avance > 80%. Datos filtrados para ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}.` : "Completado = avance > 80% (mismo criterio del panel de aprobación)."}
            >
              {ciudadElegida && programa === 'mr' && (
                <p className="text-xs text-slate-400 mb-2">
                  Desglose por ciudad aún no disponible para Cursos en Mujeres ROFÉ — mostrando el total del programa.
                </p>
              )}
              <GraficoCursos
                datos={ciudadElegida
                  ? cursosPorCiudadFiltrados.map((c) => ({
                      curso: c.curso ?? '(sin nombre)',
                      completados: Number(c.completados ?? 0),
                      en_progreso: Math.max(0, Number(c.matriculados ?? 0) - Number(c.completados ?? 0)),
                      sin_iniciar: 0,
                    }))
                  : cursosProg}
              />
            </Seccion>
          )}
          {/* Verificación cruzada oficial vs. ajustado (v_aprobacion_cursos_jc_ajustado). Si el
              sync automático de aprobacion_cursos se atrasa (como pasó el 2026-07-23), la
              diferencia entre las dos columnas queda visible aquí antes de que alguien la
              detecte manualmente en un gráfico.
              "Cursaron" NO se compara entre oficial y recalculado: en Supabase los 777
              participantes de la cohorte tienen fila de enrollment en los 7 cursos por
              construcción (import en bloque), así que ese número siempre da 777 y no refleja
              participación real curso por curso — solo Q10 sabe quién genuinamente intentó
              cada curso. En su lugar, "Cursando ahora" muestra cuántos activos siguen por
              debajo de 80% en ESE curso puntual (2026-07-23, a pedido de Samuel). */}
          {esActual && programa === 'jc' && aprobacionAjustadaProg.length > 0 && (
            <Seccion
              titulo="Verificación cruzada: aprobación oficial vs. recalculada"
              nota="Compara APROBADOS ACTIVOS (mismo universo) entre aprobacion_cursos (pipeline oficial de Q10) y un recálculo directo desde Supabase (enrollments + en_seguimiento_jc). Antes comparaba los totales con retirados y siempre daba 'Revisar', porque la cohorte oficial (832) incluye ~55 retiros antiguos que Supabase nunca carga como filas — ese hueco es estructural, no un error, así que ya no se compara. La población activa tampoco es idéntica (oficial ≈ 754 de cohorte_ingresos vs recálculo ≈ 751 de en_seguimiento_jc); esa pequeña brecha se tolera. Ahora 'Revisar' significa un descuadre REAL (p. ej. el sync de aprobación quedó atrasado, como pasó el 2026-07-23) y sí amerita mirarlo. 'Cursaron (oficial)' = cohorte completa 832, de referencia (no se compara). 'Cursando ahora' = activos con avance <80% en ese curso puntual. Esta tabla es siempre nacional — el filtro de Ciudad no la afecta."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4">Curso</th>
                      <th className="py-2 pr-4 text-right">Cursaron (oficial)</th>
                      <th className="py-2 pr-4 text-right">Cursando ahora (recalculado)</th>
                      <th className="py-2 pr-4 text-right">Aprobados activos (oficial)</th>
                      <th className="py-2 pr-4 text-right">Aprobados activos (recalculado)</th>
                      <th className="py-2 text-right">¿Coincide aprobados?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aprobacionAjustadaProg.map((aj) => {
                      const norm = (s: string) => s.trim().toUpperCase();
                      const of = aprobacionProg.find((a) => norm(a.curso) === norm(aj.curso));
                      // Comparar APROBADOS ACTIVOS (mismo universo), NO aprobados_total: la cohorte
                      // oficial (832) incluye ~55 retirados que Supabase nunca carga como filas, así
                      // que los totales JAMÁS cuadran (era el falso "Revisar" en todos los cursos).
                      // El universo activo tampoco es idéntico (oficial = cohorte_ingresos.activos ≈
                      // 754; recálculo = en_seguimiento_jc ≈ 751), así que se tolera esa brecha:
                      // "Revisar" solo si los aprobados difieren MÁS de lo que difieren las
                      // poblaciones activas (señal real de sync atrasado), +2 de ruido.
                      const aprobActOf = of ? of.aprobados : null;
                      const aprobActAj = aj.aprobados;
                      const brechaActivos = of ? Math.abs(of.activos - aj.activos) : 0;
                      const cursandoAhora = (aj.banda_0_25 ?? 0) + (aj.banda_26_80 ?? 0);
                      const coincide = of && aprobActOf !== null
                        ? Math.abs(aprobActOf - aprobActAj) <= brechaActivos + 2
                        : false;
                      return (
                        <tr key={aj.curso} className="border-b border-slate-100">
                          <td className="py-2 pr-4">{aj.curso}</td>
                          <td className="py-2 pr-4 text-right">{of?.cursaron ?? '—'}</td>
                          <td className="py-2 pr-4 text-right">{cursandoAhora}</td>
                          <td className="py-2 pr-4 text-right">{aprobActOf ?? '—'}</td>
                          <td className="py-2 pr-4 text-right">{aprobActAj}</td>
                          <td className="py-2 text-right">
                            {coincide ? (
                              <span className="font-medium" style={{ color: C.verde }}>Sí</span>
                            ) : (
                              <span className="font-medium" style={{ color: C.rojo }}>Revisar</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Seccion>
          )}
        </>
      )}

      {tab === 'Retención' && (() => {
        // HISTORIAL por cohorte (canon-exacto todos los años, v_pub_cohorte): retención =
        // culminantes÷ingresados, deserción = retirados÷ingresados. Siempre visible — es el
        // historial confiable. El desglose POR CIUDAD solo es canon-exacto en la cohorte vigente
        // (Q10 purgó inconsistente el detalle por ciudad de años cerrados → v_pub_retencion_ciudad
        // sobrecuenta en cerradas; verificado 2026-08-13), así que ahí se muestra un aviso honesto.
        const hist = datos.pubCohorte
          .filter((c) => c.programa === programa && c.ingresados)
          .map((c) => {
            const ing = c.ingresados, act = c.activos ?? 0, ret = c.retirados ?? 0;
            return {
              etiqueta: c.cohorte, cohorte: c.cohorte,
              ingresados: ing, culminantes: act, retirados: ret,
              retencion: ing ? Math.round((1000 * act) / ing) / 10 : 0,
              desercion: ing ? Math.round((1000 * ret) / ing) / 10 : 0,
            };
          })
          .sort((a, b) => a.cohorte.localeCompare(b.cohorte));

        const filas = datos.retencionCiudad
          .filter((r) => r.programa === programa && r.cohorte === cohorte && r.retencion_pct != null && r.ingresados)
          .map((r) => ({
            etiqueta: ETIQUETA_GRUPO[r.grupo_ciudad] ?? r.grupo_ciudad,
            retencion: Number(r.retencion_pct),
            activos: r.activos ?? 0,
            retirados: r.retirados ?? 0,
            ingresados: r.ingresados ?? 0,
            desercion: r.ingresados ? Math.round((1000 * (r.retirados ?? 0)) / r.ingresados) / 10 : 0,
          }))
          .sort((a, b) => b.retencion - a.retencion);
        const ciudadDisponible = esActual && filas.length > 0;
        const totalIng = filas.reduce((s, f) => s + f.ingresados, 0);
        const totalAct = filas.reduce((s, f) => s + f.activos, 0);
        const retGlobal = totalIng ? (100 * totalAct) / totalIng : 0;
        const mejor = filas[0];
        const peor = filas[filas.length - 1];

        return (
          <>
            <NotaFiltros inaplicables={['Estado (esta pestaña siempre muestra activos y retirados desglosados)', 'Ciudad en el historial por cohorte de arriba (es nacional por año)']} />
            {/* Historial por cohorte — canon-exacto, todos los años */}
            {hist.length > 0 && (
              <Seccion
                titulo={`Historial de retención por cohorte — ${NOMBRE_PROGRAMA[programa]}`}
                nota="Retención = culminantes ÷ ingresados (canon oficial). Cifra exacta para todos los años — el mismo dato del Resumen."
              >
                <GraficoBarras datos={hist} dataKey="retencion" nombre="Retención %" color={C.verde} dominioMax={100} sufijoEtiqueta="%" decimalesEtiqueta={1} />
                {/* Culminación (=Retención) vs Deserción en el mismo eje temporal — cierra el
                    hallazgo de comparar contra el Power BI externo de tocaunavida.org/reportes-jc
                    ("Participantes, % Deserción y % Culminación por Año"): mismo dato que ya
                    teníamos en `hist` (Retención/Deserción por cohorte), solo faltaba esta segunda
                    línea junto a la barra de arriba. Reusa GraficoHistorial (pivote curso→línea)
                    sin tocar backend. 2026-08-27. */}
                <div className="mt-4">
                  <p className="text-xs text-slate-400 mb-1">Culminación vs. deserción, año a año (mismos datos de la tabla de abajo).</p>
                  <GraficoHistorial
                    historial={hist.flatMap((h) => [
                      { fecha: h.cohorte, curso: 'Culminación %', valor: h.retencion },
                      { fecha: h.cohorte, curso: 'Deserción %', valor: h.desercion },
                    ])}
                    metrica="pct"
                    nombreMetrica="%"
                  />
                </div>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-4">Cohorte</th>
                        <th className="py-2 pr-4 text-right">Ingresados</th>
                        <th className="py-2 pr-4 text-right">Culminantes</th>
                        <th className="py-2 pr-4 text-right">Retirados</th>
                        <th className="py-2 pr-4 text-right">Retención</th>
                        <th className="py-2 text-right">Deserción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...hist].reverse().map((h) => (
                        <tr key={h.cohorte} className={`border-b border-slate-100 ${h.cohorte === cohorte ? 'bg-amber-50/40 font-medium' : ''}`}>
                          <td className="py-2 pr-4">{h.cohorte}</td>
                          <td className="py-2 pr-4 text-right">{h.ingresados}</td>
                          <td className="py-2 pr-4 text-right">{h.culminantes}</td>
                          <td className="py-2 pr-4 text-right">{h.retirados}</td>
                          <td className="py-2 pr-4 text-right font-semibold" style={{ color: C.verde }}>{h.retencion.toFixed(1)}%</td>
                          <td className="py-2 text-right" style={{ color: C.rojo }}>{h.desercion.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Seccion>
            )}

            {/* Desglose POR CIUDAD — solo cohorte vigente (canon-exacto ahí) */}
            {ciudadDisponible ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <Kpi titulo="Retención (cohorte)" valor={`${retGlobal.toFixed(1)}%`} acento={C.verde} />
                  <Kpi titulo="Deserción (cohorte)" valor={`${(100 - retGlobal).toFixed(1)}%`} acento={C.rojo} />
                  <Kpi titulo="Mejor ciudad" valor={`${mejor.retencion.toFixed(1)}%`} detalle={`${mejor.etiqueta} — la que más retiene`} acento={C.verde} />
                  <Kpi titulo="Ciudad a intervenir" valor={`${peor.retencion.toFixed(1)}%`} detalle={`${peor.etiqueta} — la más baja`} acento={C.rojo} />
                </div>
                <Seccion
                  titulo={`Retención por ciudad — ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte}`}
                  nota="Retención = activos ÷ ingresados de cada ciudad. Ordenadas de mayor a menor. Se actualiza con cada sync."
                >
                  <GraficoBarras datos={filas} dataKey="retencion" nombre="Retención %" color={C.verde} dominioMax={100} rotarEtiquetas sufijoEtiqueta="%" decimalesEtiqueta={1} />
                </Seccion>
                <Seccion titulo="Detalle por ciudad">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                          <th className="py-2 pr-4">Ciudad</th>
                          <th className="py-2 pr-4 text-right">Ingresados</th>
                          <th className="py-2 pr-4 text-right">Activos</th>
                          <th className="py-2 pr-4 text-right">Retirados</th>
                          <th className="py-2 pr-4 text-right">Retención</th>
                          <th className="py-2 text-right">Deserción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((f) => (
                          <tr key={f.etiqueta} className="border-b border-slate-100">
                            <td className="py-2 pr-4">{f.etiqueta}</td>
                            <td className="py-2 pr-4 text-right">{f.ingresados}</td>
                            <td className="py-2 pr-4 text-right">{f.activos}</td>
                            <td className="py-2 pr-4 text-right">{f.retirados}</td>
                            <td className="py-2 pr-4 text-right font-semibold" style={{ color: C.verde }}>{f.retencion.toFixed(1)}%</td>
                            <td className="py-2 text-right" style={{ color: C.rojo }}>{f.desercion.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Seccion>
              </>
            ) : datos.retencionCiudad.length === 0 ? (
              <EnConstruccion detalle="El desglose por ciudad requiere la vista v_pub_retencion_ciudad, que aún no se ha aplicado en la base de datos. El historial por cohorte de arriba sí funciona." />
            ) : (
              <NoAplica motivo={`el desglose POR CIUDAD solo está disponible para la cohorte vigente (${cohorteActual}). Q10 no conserva el detalle por ciudad de años cerrados, así que mostrarlo daría cifras que no cuadran con el canon. El historial por cohorte de arriba cubre todos los años de forma exacta.`} suave />
            )}
          </>
        );
      })()}

      {tab === 'Cursos' && mostrarCanonico && (() => {
        // Ciudad + JC + cohorte vigente: usa v_pub_aprobacion_ciudad_jc (cerrado 2026-08-26,
        // ver panel-datos-etl.md) en vez de caer a "no aplica" — MR y años cerrados siguen sin
        // esta fuente, ahí sí queda el aviso.
        const conCiudadJc = hayFiltroCiudad && programa === 'jc';
        const filasCurso = conCiudadJc ? aprobacionCiudadConDato : aprobacionProg;
        const ciu = ciudadElegida ? ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida : '';
        return (
        <>
          <NotaFiltros
            inaplicables={
              hayFiltroCiudad && programa === 'mr'
                ? ['Ciudad (esta vista canónica de Mujeres ROFÉ todavía es nacional)']
                : []
            }
          />
          {conCiudadJc && aprobacionCiudadSuprimida.length > 0 && (
            <p className="text-xs text-slate-400 mb-4">
              {aprobacionCiudadSuprimida.length === 1 ? 'Un curso' : `${aprobacionCiudadSuprimida.length} cursos`} de {ciu} no se muestra{aprobacionCiudadSuprimida.length === 1 ? '' : 'n'} por tener menos de 5 personas (criterio de privacidad, mismo del resto del panel).
            </p>
          )}
          {conCiudadJc && filasCurso.length === 0 ? (
            <NoAplica motivo={`sin datos de ${ciu} suficientes para este desglose (menos de 5 personas en cada curso — criterio de privacidad).`} suave />
          ) : (
          <>
          <div className="flex gap-1 tarjeta-glass p-1 w-fit mb-4">
            <button
              onClick={() => setUnidadEstadoCohorte('matriculas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                unidadEstadoCohorte === 'matriculas'
                  ? programa === 'mr' ? 'pill-metal pill-metal-rosa' : 'pill-metal pill-metal-azul'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Por matrículas
            </button>
            {estado === 'activos' && !conCiudadJc && (
              <button
                onClick={() => setUnidadEstadoCohorte('estudiantes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  unidadEstadoCohorte === 'estudiantes'
                    ? programa === 'mr' ? 'pill-metal pill-metal-rosa' : 'pill-metal pill-metal-azul'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Por estudiantes
              </button>
            )}
          </div>

          {unidadEstadoCohorte === 'matriculas' || conCiudadJc ? (
            <>
              {(() => {
                // Header de diagnóstico. % de aprobación = aprobados÷cursaron AGREGADO (ratio pooled,
                // NO promedio de tasas por curso — el escéptico del consejo advirtió que promediar
                // cursos de tamaños dispares oculta el que colapsó). Además, el curso más crítico.
                const cursaron = filasCurso.reduce((s, a) => s + totalPorEstado(a), 0);
                const aprobaron = filasCurso.reduce((s, a) => s + aprobadosPorEstado(a), 0);
                const pctAprob = cursaron ? Math.round((100 * aprobaron) / cursaron) : 0;
                const conDato = filasCurso.filter((a) => totalPorEstado(a) > 0 && a.promedio != null);
                const critico = conDato.length
                  ? conDato.reduce((min, a) => (Number(a.promedio) < Number(min.promedio) ? a : min))
                  : null;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <Kpi titulo="Aprobación" valor={`${pctAprob}%`} detalle={`${aprobaron.toLocaleString('es-CO')} de ${cursaron.toLocaleString('es-CO')} matrículas con avance > 80%`} />
                    <Kpi titulo="Matrículas" valor={cursaron.toLocaleString('es-CO')} detalle={`en ${filasCurso.length} cursos · ${ETIQUETA_ESTADO[estado].toLowerCase()}${conCiudadJc ? ` · ${ciu}` : ''}`} />
                    {critico && (
                      <Kpi titulo="Curso más crítico" valor={`${critico.promedio}%`} detalle={`${critico.curso.length > 32 ? critico.curso.slice(0, 31) + '…' : critico.curso} — menor avance promedio` } />
                    )}
                  </div>
                );
              })()}
              <Seccion
                titulo={`Avance de la cohorte por curso — ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]}${conCiudadJc ? ` · ${ciu}` : ''}`}
                nota="Cada barra suma la cohorte completa que cursó: aprobó = avance > 80%; quien aprobó antes de retirarse conserva su logro."
              >
                <GraficoAprobacion datos={filasCurso.map(segmentosAprobacion)} />
              </Seccion>
              <Seccion titulo={`Detalle por curso (${ETIQUETA_ESTADO[estado].toLowerCase()}${conCiudadJc ? ` · ${ciu}` : ''})`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-4">Curso</th>
                        <th className="py-2 pr-4 text-right">{estado === 'retirados' ? 'Se retiraron' : estado === 'activos' ? 'Activos' : 'Cursaron'}</th>
                        <th className="py-2 pr-4 text-right">Aprobaron</th>
                        <th className="py-2 text-right">Avance promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasCurso.map((a) => {
                        const total = totalPorEstado(a);
                        const aprobaron = aprobadosPorEstado(a);
                        return (
                          <tr key={a.curso} className="border-b border-slate-100">
                            <td className="py-2 pr-4">{a.curso}</td>
                            <td className="py-2 pr-4 text-right">{total}</td>
                            <td className="py-2 pr-4 text-right">
                              {aprobaron} {total ? `(${Math.round((100 * aprobaron) / total)}%)` : ''}
                            </td>
                            <td className="py-2 text-right">{a.promedio ?? '—'}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Aprobaron incluye a quienes superaron el 80% antes de retirarse. Fuente: panel de
                  aprobación (definición canónica de la cohorte, sin perfiles de prueba ni retiros
                  institucionales).
                </p>
              </Seccion>
            </>
          ) : distribucionEst.length > 0 ? (
            <Seccion
              titulo={`¿Cuántos cursos ha aprobado cada estudiante? — ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte}`}
              nota={`Distribución de los ${distribucionEst.reduce((s, d) => s + d.estudiantes, 0).toLocaleString('es-CO')} estudiantes activos por número de cursos aprobados (> 80%). Muestra cuántas personas van completas y cuántas rezagadas — no cuenta matrículas sino personas.`}
            >
              <GraficoBarras
                datos={distribucionEst}
                dataKey="estudiantes"
                nombre="Estudiantes"
                color={C.verde}
                etiquetaKey="etiqueta"
                rotarEtiquetas={false}
              />
              <p className="text-xs text-slate-400 mt-2">
                Eje horizontal = número de cursos aprobados (de {distribucionEst.length - 1} en la
                ruta {NOMBRE_PROGRAMA[programa]} {etiquetaCohorte}). Un estudiante en el extremo alto ya
                completó casi toda la ruta; los del extremo bajo son los que requieren
                acompañamiento.
              </p>
            </Seccion>
          ) : (
            <p className="text-sm text-slate-400">Sin datos por estudiante para esta cohorte.</p>
          )}
          </>
          )}
        </>
        );
      })()}

      {tab === 'Cursos' && !mostrarCanonico && (
        <>
          <Seccion
            titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte}${ciudadElegida ? ` (${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida})` : ''}`}
            nota={ciudadElegida ? `Completado = avance > 80%. Datos filtrados para ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}.` : "Completado = avance > 80%."}
          >
            {ciudadElegida && programa === 'mr' && (
              <p className="text-xs text-slate-400 mb-2">
                Desglose por ciudad aún no disponible para Cursos en Mujeres ROFÉ — mostrando el total del programa.
              </p>
            )}
            {programa === 'mr' && (esMrTodos || (cohorte !== '2025' && cohorte !== '2026')) && (
              <p className="text-xs rounded-lg px-3 py-2 mb-3" style={{ background: `${C.rojo}15`, color: C.rojo }}>
                ⚠ Sin trazabilidad confirmada antes de 2025: la coordinación confirmó
                (2026-08-31) que 2022-2024 no tienen un consolidado válido verificable — Q10 no
                capturó esos años completos, con o sin fusionar rutas. Solo 2025 y 2026 son
                corroborables hoy.
              </p>
            )}
            {esMrTodos && !ciudadElegida && (
              <>
                <div className="flex gap-1 tarjeta-glass p-1 w-fit mb-3">
                  {([['personas', 'Por individuo'], ['matriculas', 'Por matrícula']] as const).map(([v, txt]) => (
                    <button
                      key={v}
                      onClick={() => setUnidadCursoMr(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        unidadCursoMr === v ? 'pill-metal pill-metal-rosa' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {txt}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mb-2">
                  {unidadCursoMr === 'personas'
                    ? 'Por individuo: cada mujer cuenta 1 sola vez por ruta, aunque la haya cursado en más de un año.'
                    : 'Por matrícula: cada inscripción cuenta aparte — una mujer que repitió la misma ruta en 2 años suma 2.'}
                  {' '}Fusiona las 5 rutas reales de los 5 años (Q10 reutiliza un nombre de curso distinto cada año para la misma ruta).
                </p>
              </>
            )}
            <GraficoCursos
              datos={ciudadElegida
                ? cursosPorCiudadFiltrados.map((c) => ({
                    curso: c.curso ?? '(sin nombre)',
                    completados: Number(c.completados ?? 0),
                    en_progreso: Math.max(0, Number(c.matriculados ?? 0) - Number(c.completados ?? 0)),
                    sin_iniciar: 0,
                  }))
                : esMrTodos ? cursosNormalizadosMr : cursosProg}
            />
          </Seccion>
          <Seccion titulo="Detalle por curso">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Curso</th>
                    <th className="py-2 pr-4 text-right">{esMrTodos && unidadCursoMr === 'personas' ? 'Personas' : 'Matrículas'}</th>
                    <th className="py-2 pr-4 text-right">Completados</th>
                    <th className="py-2 pr-4 text-right">% Completados</th>
                    <th className="py-2 text-right">Avance promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {(ciudadElegida ? cursosPorCiudadFiltrados : esMrTodos ? cursosNormalizadosMr : cursosProg).map((c) => (
                    <tr key={c.curso} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{c.curso}</td>
                      <td className="py-2 pr-4 text-right">{c.matriculados}</td>
                      <td className="py-2 pr-4 text-right">{c.completados}</td>
                      <td className="py-2 pr-4 text-right font-medium">{c.pct_completados ?? '—'}%</td>
                      <td className="py-2 text-right">{c.promedio_avance ?? '—'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!cursosPorCiudadDisponible && ciudadElegida && (
              <p className="text-xs text-slate-400 mt-2">
                Desglose por ciudad aún no disponible para Cursos en Mujeres ROFÉ.
              </p>
            )}
          </Seccion>
        </>
      )}

      {tab === 'Historial' && (
        !esActual ? (
          <NoAplica motivo="el histórico diario no distingue cohortes — solo se muestra para la cohorte vigente." />
        ) : (
          <>
            <NotaFiltros inaplicables={['Estado (esta serie no distingue activos de retirados)']} />
            {(() => {
              // Header de diagnóstico: valor ACTUAL + delta vs el inicio de la serie, con dirección
              // (regla del escéptico: "último valor" solo, sin contexto de tendencia, no diagnostica).
              const fuente = ciudadElegida && programa === 'jc' ? historialPorCiudad : historialProg;
              const fechas = Array.from(new Set(fuente.map((h) => h.fecha))).sort();
              if (fechas.length < 2) return null;
              const ini = fechas[0];
              const fin = fechas[fechas.length - 1];
              const sumMat = (f: string) =>
                fuente.filter((h) => h.fecha === f).reduce((s, h) => s + Number(h.matriculados ?? 0), 0);
              const avgAv = (f: string) => {
                const filas = fuente.filter((h) => h.fecha === f && h.promedio_avance != null);
                const peso = filas.reduce((s, h) => s + Number(h.matriculados ?? 0), 0);
                return peso ? filas.reduce((s, h) => s + Number(h.promedio_avance) * Number(h.matriculados ?? 0), 0) / peso : null;
              };
              const matFin = sumMat(fin), matIni = sumMat(ini), dMat = matFin - matIni;
              const avFin = avgAv(fin), avIni = avgAv(ini);
              const dAv = avFin != null && avIni != null ? avFin - avIni : null;
              const flecha = (d: number) => (d > 0 ? '↑' : d < 0 ? '↓' : '→');
              const signo = (d: number) => (d > 0 ? '+' : '');
              const iniCorta = fechaCortaEs(ini) || ini.slice(5);
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
                  <Kpi
                    titulo="Matriculados hoy"
                    valor={matFin.toLocaleString('es-CO')}
                    detalle={`${flecha(dMat)} ${signo(dMat)}${dMat.toLocaleString('es-CO')} desde ${iniCorta}`}
                  />
                  {avFin != null && (
                    <Kpi
                      titulo="Avance promedio hoy"
                      valor={`${avFin.toFixed(1)}%`}
                      detalle={dAv != null ? `${flecha(dAv)} ${signo(dAv)}${dAv.toFixed(1)} pts desde ${iniCorta}` : 'sin comparativo'}
                    />
                  )}
                  <Kpi
                    titulo="Periodo medido"
                    valor={`${fechas.length} días`}
                    detalle={`serie diaria desde ${iniCorta}`}
                  />
                </div>
              );
            })()}
            <Seccion
              titulo={`Evolución de matrículas — ${NOMBRE_PROGRAMA[programa]}${ciudadElegida ? ` · ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : ''}`}
              nota={
                ciudadElegida
                  ? programa === 'jc'
                    ? `Serie de ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida} desde el 14 de julio de 2026, cuando empezamos a guardar el snapshot diario por ciudad. El histórico anterior (desde el 26 de junio) es nacional: nunca guardó la ciudad, así que no se puede desglosar hacia atrás.`
                    : 'Desglose por ciudad aún no disponible para Historial en Mujeres ROFÉ — mostrando el total del programa.'
                  : 'Serie diaria desde el 26 de junio (histórico del dashboard + sync diario de Q10). Las matrículas de cursos terminados bajan cuando Q10 archiva estudiantes.'
              }
            >
              <GraficoHistorial
                historial={(ciudadElegida && programa === 'jc' ? historialPorCiudad : historialProg).map((h) => ({
                  fecha: h.fecha,
                  curso: h.curso,
                  valor: Number(h.matriculados ?? 0),
                }))}
                metrica="matriculados"
                nombreMetrica="Matriculados"
              />
            </Seccion>
            <Seccion
              titulo={`Evolución del avance promedio — ${NOMBRE_PROGRAMA[programa]}${ciudadElegida ? ` · ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : ''}`}
              nota={
                ciudadElegida && programa === 'jc'
                  ? `Promedio de avance (%) por curso en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}. La serie por ciudad arranca el 14 de julio de 2026 y crece un punto por día.`
                  : 'Promedio de avance (%) por curso a lo largo del tiempo.'
              }
            >
              <GraficoHistorial
                historial={(ciudadElegida && programa === 'jc' ? historialPorCiudad : historialProg).map((h) => ({
                  fecha: h.fecha,
                  curso: h.curso,
                  valor: h.promedio_avance !== null ? Number(h.promedio_avance) : null,
                }))}
                metrica="promedio"
                nombreMetrica="Avance promedio %"
              />
            </Seccion>
          </>
        )
      )}

      {tab === 'Emprendimiento' && programa === 'mr' && (() => {
        // Impacto financiero MR (Fase 2 ampliación PBI, 2026-08-15) — no es la encuesta de
        // situación de JC (en_marcha/idea/interesado, esa es harina de otro costal); acá se
        // muestra si tiene emprendimiento + acceso a microcrédito + banda de ingresos
        // familiares. Ver docs/procesos/plan-ampliacion-panel-datos-2026-08-10.md.
        //
        // FIX 2026-08-27 (auditoría de 2 agentes): "Acceso a microcrédito" e "Ingresos
        // familiares" ya NO usan la fuente Q10-gated (`impactoFinancieroMrFiltrada`, ~11% del
        // universo) — pasan a `mrDemografiaUniverso` (postulantes_mr completo, `v_pub_mr_
        // demografia_universo`, migración 056), mismo patrón ya usado en Demografía. Sin
        // filtro de cohorte/estado/ciudad (esa vista es "un solo grupo" a propósito). Solo
        // "Con emprendimiento" se queda en la fuente Q10: `tiene_emprendimiento` de
        // `postulantes_mr` únicamente se escribe en TRUE (nunca FALSE explícito, ver
        // sync_postulantes_mr.py) — cruzarlo produciría un "no" inventado, así que ese
        // indicador puntual sigue siendo Q10-only (limitación documentada, no arreglable sin
        // un dato nuevo).
        const dimUniverso = (dim: string, cat: string) =>
          (datos?.mrDemografiaUniverso ?? []).find((d) => d.dimension === dim && d.categoria === cat)?.total ?? 0;
        const dimTotalQ10 = (dim: string, cat: string) =>
          impactoFinancieroMrFiltrada.find((d) => d.dimension === dim && d.categoria === cat)?.total ?? 0;
        const emprendeSi = dimTotalQ10('tiene_emprendimiento', 'si');
        const emprendeNo = dimTotalQ10('tiene_emprendimiento', 'no');
        const totalEmprendeConDato = emprendeSi + emprendeNo;
        const pctEmprendimientoMr = totalEmprendeConDato ? Math.round((100 * emprendeSi) / totalEmprendeConDato) : 0;
        const creditoSi = dimUniverso('tipo_credito', 'microcredito') + dimUniverso('tipo_credito', 'icredit');
        const totalUniverso = (datos?.mrDemografiaUniverso ?? [])
          .filter((d) => d.dimension === 'ingresos_familiares')
          .reduce((s, d) => s + (d.total ?? 0), 0) || 1; // denominador aprox. para el % de crédito
        const pctCreditoMr = Math.round((1000 * creditoSi) / totalUniverso) / 10;
        const ingresosFilas = (datos?.mrDemografiaUniverso ?? []).filter((d) => d.dimension === 'ingresos_familiares');
        const totalIngresosMr = ingresosFilas.reduce((s, d) => s + (d.total ?? 0), 0);
        const emprendimientoPie = [
          { nombre: 'Con emprendimiento', total: emprendeSi, color: C.verde },
          { nombre: 'Sin emprendimiento', total: emprendeNo, color: C.amarillo },
        ];
        const creditoPie = [
          { nombre: 'Microcrédito', total: dimUniverso('tipo_credito', 'microcredito'), color: C.azul3 },
          { nombre: 'iCredit', total: dimUniverso('tipo_credito', 'icredit'), color: C.amarillo },
        ];
        const ingresosBarras = ingresosFilas
          .map((d) => ({ etiqueta: d.categoria, total: d.total ?? 0 }))
          .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
        if (totalEmprendeConDato === 0 && creditoSi === 0 && totalIngresosMr === 0) {
          return <NoAplica motivo="sin datos de impacto financiero disponibles." suave />;
        }
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <Kpi titulo="Con emprendimiento" valor={`${pctEmprendimientoMr}%`} detalle={`${emprendeSi.toLocaleString('es-CO')} de ${totalEmprendeConDato.toLocaleString('es-CO')} con dato · ${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]} (Q10)`} />
              <Kpi titulo="Con microcrédito" valor={creditoSi.toLocaleString('es-CO')} detalle={`${pctCreditoMr}% del universo completo`} />
              <Kpi titulo="Con dato de ingresos" valor={totalIngresosMr.toLocaleString('es-CO')} detalle="Universo completo (postulantes + matriculadas)" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Seccion titulo="Emprendimiento" nota={`Con emprendimiento = registra un emprendimiento con nombre en la BD. Solo matriculadas Q10 (${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]}) — sin equivalente universo-completo (postulantes_mr no distingue "no tiene" de "sin dato" para este campo).`}>
                <GraficoEmprendimiento datos={emprendimientoPie} />
              </Seccion>
              <Seccion titulo="Acceso a crédito" nota="Universo completo (postulantes_mr, sin filtro de cohorte/estado/ciudad) — Microcrédito vs iCredit.">
                <GraficoEmprendimiento datos={creditoPie} />
              </Seccion>
              <Seccion titulo="Ingresos familiares" nota="Banda autoreportada en el formulario de ingreso. Universo completo, sin filtro de cohorte/estado/ciudad.">
                <GraficoBarras datos={ingresosBarras} dataKey="total" nombre="Personas" color={C.azul2} rotarEtiquetas />
              </Seccion>
              <Seccion titulo="Sectores de emprendimiento">
                <NoAplica motivo="no se captura el sector/rubro del emprendimiento, solo el nombre en texto libre — auditado 2026-08-15." />
              </Seccion>
            </div>
          </>
        );
      })()}

      {tab === 'Emprendimiento' && programa !== 'mr' && (
        !emprendimientoAplicaPrograma ? (
          <NoAplica motivo="Mujeres ROFÉ no tiene la encuesta de diagnóstico de emprendimiento (esa medición es solo de Jóvenes creaTIvos)." />
        ) : estado === 'retirados' ? (
          // Emprendimiento por RETIRADOS: la encuesta de diagnóstico se aplicó al ingreso; para
          // quienes ya se retiraron el dato es escaso y poco representativo → en construcción.
          <EnConstruccion detalle="El diagnóstico de emprendimiento del segmento Retirados aún se está trabajando: la encuesta se levanta al ingreso y para quienes ya salieron el dato es escaso y poco representativo. Para ver el diagnóstico usá el filtro Activos o Todos." />
        ) : pubEmprendimientoFiltrada.length === 0 ? (
          <NoAplica motivo="sin datos para este filtro (cohorte/estado/ciudad elegidos)." suave />
        ) : (
          <>
          {(() => {
            // Header de diagnóstico: total diagnosticados + % que YA emprende (en marcha) + %
            // potencial (idea/interesado). Conteo Y % siempre (regla del escéptico). ORDEN_SITUACION
            // = [en_marcha, idea, interesado, no_interesado].
            const totalDiag = emprendimientoOrdenado.reduce((s, e) => s + e.total, 0);
            const enMarcha = emprendimientoOrdenado[0]?.total ?? 0;
            const potencial = (emprendimientoOrdenado[1]?.total ?? 0) + (emprendimientoOrdenado[2]?.total ?? 0);
            const pct = (v: number) => (totalDiag ? Math.round((100 * v) / totalDiag) : 0);
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <Kpi titulo="Ya emprende" valor={`${pct(enMarcha)}%`} detalle={`${enMarcha.toLocaleString('es-CO')} con emprendimiento en marcha`} />
                <Kpi titulo="Potencial" valor={`${pct(potencial)}%`} detalle={`${potencial.toLocaleString('es-CO')} con idea o interesados`} />
                <Kpi titulo="Diagnosticados" valor={totalDiag.toLocaleString('es-CO')} detalle={`Encuesta JC · ${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]}`} />
              </div>
            );
          })()}
          <div className="grid md:grid-cols-2 gap-6">
            <Seccion titulo="Situación frente al emprendimiento" nota={`Encuesta de diagnóstico Jóvenes creaTIvos · ${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]}.`}>
              <GraficoEmprendimiento datos={emprendimientoOrdenado} />
            </Seccion>
            <Seccion titulo="Cursos completados según situación" nota="Promedio de cursos completados por participante en cada grupo.">
              <GraficoBarras datos={empVsCursos} dataKey="cursos" nombre="Cursos completados (prom.)" color={C.verde} dominioMax={9} />
              <p className="text-xs text-slate-400 mt-2">
                Los cuatro grupos avanzan de forma pareja: tener (o no) un emprendimiento no cambia el ritmo en la ruta de cursos.
              </p>
            </Seccion>
          </div>
          </>
        )
      )}

      {tab === 'Demografía' && estado === 'retirados' ? (
        // Demografía por RETIRADOS: el equipo juzga esta fuente poco confiable para el segmento de
        // retirados (cobertura sociodemográfica parcial de quienes ya salieron) → se marca en
        // construcción en vez de mostrar barras que no representan al universo de retiros del canon.
        <EnConstruccion detalle="La demografía del segmento Retirados aún se está trabajando: la información sociodemográfica de quienes ya salieron del programa es parcial y todavía no representa de forma fiable al total de retiros. Para el desglose demográfico usá el filtro Activos o Todos." />
      ) : tab === 'Demografía' ? (
        <>
          <p className="text-xs text-slate-400 mb-1">
            {NOMBRE_PROGRAMA[programa]} · {etiquetaCohorte} · {ETIQUETA_ESTADO[estado]}
            {programa === 'mr' ? ' — fuente: BD-Mujeres ROFÉ.' : ' — fuente: BD de monitorias.'}
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {DIMENSIONES_DEMOGRAFIA.map((dim) => (
              <TarjetaDemografia key={dim} dimension={dim} />
            ))}
            {programa === 'mr' ? (
              <Seccion
                titulo="Emprendimiento"
                nota={`Con emprendimiento = registra un emprendimiento con nombre en la BD. ${totalMrConDatos.toLocaleString('es-CO')} mujeres con dato para ${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]}${ciudadElegida ? ` · ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : ''} (mismo criterio de "Con emprendimiento" del tab Emprendimiento).`}
              >
                {emprendimientoBooleanoMr.length > 0 ? (
                  <GraficoEmprendimiento datos={emprendimientoBooleanoMr} />
                ) : (
                  <NoAplica motivo="sin datos para este filtro (cohorte/estado/ciudad elegidos)." suave />
                )}
              </Seccion>
            ) : (
              <Seccion titulo="Emprendimiento">
                <NoAplica motivo="para Jóvenes creaTIvos el diagnóstico de emprendimiento tiene su propio tab (más detalle: en marcha / idea / interesado / no interesado)." />
              </Seccion>
            )}
          </div>

          {/* Universo COMPLETO de Mujeres ROFÉ, sin discriminar por Q10 (v_pub_mr_demografia_
              universo + v_pub_mr_formacion_universo, migración 056) — pedido 2026-08-27 tras
              comparar contra el Power BI externo tocaunavida.org/reportes-mr. Todo lo de arriba
              en este tab es cohorte-curso Q10 (~11% de las mujeres reales); esta sección cubre
              a todo el universo (número real, ver universoNacionalTotalMr, NUNCA hardcodeado
              acá — bug real 2026-08-28: esto decía "5.111" a mano y quedó desfasado cuando la
              base cambió). Sin filtro de cohorte/estado/ciudad — "un solo grupo", como pidió
              Samuel explícitamente. */}
          {programa === 'mr' && (
            <div className="mt-8">
              <h2 className="font-bold text-lg text-slate-700 mb-1">Universo completo (con y sin Q10)</h2>
              <p className="text-xs text-slate-400 mb-4">
                Las {universoNacionalTotalMr.toLocaleString('es-CO')} mujeres registradas en la base (fuente única válida: pestaña
                General del Sheet BD-Mujeres ROFÉ), no solo el ~11% que matriculó en un curso Q10.
                Comparado contra el reporte Power BI de Mujeres ROFÉ. Sin filtro de cohorte/estado/ciudad.
              </p>
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                {DIMENSIONES_UNIVERSO_MR.map((dim) => (
                  <TarjetaDemografiaUniverso key={dim} dimension={dim} />
                ))}
              </div>
              {(() => {
                const filasForm = (datos?.mrFormacionUniverso ?? []).filter((f) => f.total != null) as
                  { cursos_completados: string; total: number }[];
                if (filasForm.length === 0) {
                  return (
                    <Seccion titulo="Formación (cursos completados)">
                      <NoAplica motivo="sin datos suficientes (o vista aún no aplicada)." suave />
                    </Seccion>
                  );
                }
                const total = filasForm.reduce((s, f) => s + f.total, 0);
                const sinCursos = filasForm.find((f) => f.cursos_completados === '0')?.total ?? 0;
                const pctSinCursos = total ? Math.round((1000 * sinCursos) / total) / 10 : 0;
                const filasBarra = filasForm
                  .map((f) => ({ etiqueta: f.cursos_completados, total: f.total }))
                  .sort((a, b) => (a.etiqueta === '5+' ? 1 : b.etiqueta === '5+' ? -1 : Number(a.etiqueta) - Number(b.etiqueta)));
                return (
                  <Seccion
                    titulo="Formación — cursos MR completados"
                    nota={`De las ${universoNacionalTotalMr.toLocaleString('es-CO')}, cuántas completaron 0, 1, 2... cursos en Q10, sumando todos los años juntos (no separado por cohorte).`}
                  >
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                      <Kpi titulo="Mujeres con este dato" valor={total.toLocaleString('es-CO')} detalle="universo completo, 2026-08-27" />
                      <Kpi titulo="Sin ningún curso completado" valor={sinCursos.toLocaleString('es-CO')} detalle={`${pctSinCursos}% del universo`} acento={C.naranja} />
                      <Kpi titulo="Con al menos 1 curso" valor={(total - sinCursos).toLocaleString('es-CO')} detalle={`${(100 - pctSinCursos).toFixed(1)}% del universo`} acento={C.verde} />
                    </div>
                    <GraficoBarras datos={filasBarra} dataKey="total" nombre="Mujeres" color={C.azul2} etiquetaKey="etiqueta" />
                  </Seccion>
                );
              })()}
            </div>
          )}
        </>
      ) : null}

      {tab === 'Asistencia' && (() => {
        const filas = pubAsistenciaFiltrada;
        if (filas.length === 0) {
          return <NoAplica motivo="sin datos de asistencia suficientes para este filtro (cohorte/estado/ciudad elegidos)." suave />;
        }
        const nTotal = filas.reduce((s, f) => s + (f.n_estudiantes ?? 0), 0);
        const sumaPond = filas.reduce((s, f) => s + Number(f.promedio ?? 0) * (f.n_estudiantes ?? 0), 0);
        const promedioGlobal = nTotal ? sumaPond / nTotal : null;
        const porCiudad = !ciudadElegida
          ? Array.from(
              filas.reduce((mapa, f) => {
                if (!f.grupo_ciudad) return mapa;
                const acc = mapa.get(f.grupo_ciudad) ?? { n: 0, suma: 0 };
                if (f.n_estudiantes != null && f.promedio != null) {
                  acc.n += f.n_estudiantes;
                  acc.suma += Number(f.promedio) * f.n_estudiantes;
                }
                mapa.set(f.grupo_ciudad, acc);
                return mapa;
              }, new Map<string, { n: number; suma: number }>()),
            ).map(([grupo, { n, suma }]) => ({
              etiqueta: ETIQUETA_GRUPO[grupo] ?? grupo,
              promedio: n ? suma / n : 0,
            }))
          : [];
        // Peor ciudad — el promedio nacional esconde la ciudad crítica (regla del escéptico del
        // consejo): un directivo necesita ver "Cali 41%" para intervenir, no solo el agregado.
        const peorCiudad = porCiudad.length
          ? porCiudad.reduce((min, c) => (c.promedio < min.promedio ? c : min))
          : null;
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Kpi
                titulo="Asistencia promedio"
                valor={promedioGlobal != null ? `${promedioGlobal.toFixed(1)}%` : '—'}
                detalle={`${NOMBRE_PROGRAMA[programa]} · ${etiquetaCohorte} · ${ETIQUETA_ESTADO[estado]}`}
              />
              <Kpi titulo="Estudiantes con dato" valor={nTotal.toLocaleString('es-CO')} detalle="con registro de asistencia Zoom validada" />
              {peorCiudad && (
                <Kpi
                  titulo="Ciudad más baja"
                  valor={`${peorCiudad.promedio.toFixed(1)}%`}
                  detalle={`${peorCiudad.etiqueta} — la de menor asistencia; foco de intervención`}
                />
              )}
            </div>
            {porCiudad.length > 0 && (
              <Seccion titulo="Asistencia promedio por ciudad">
                <GraficoBarras datos={porCiudad} dataKey="promedio" nombre="Asistencia %" color={C.azul2} dominioMax={100} rotarEtiquetas />
              </Seccion>
            )}
            <p className="text-xs text-slate-400 mt-2">
              Primera vez que esta fuente (asistencia validada por correo/cédula contra Zoom) es
              pública — antes solo la consumía la herramienta interna de riesgo. Celdas con menos
              de 5 estudiantes se suprimen (mismo criterio de privacidad del resto del panel).
            </p>
          </>
        );
      })()}
      {tab === 'Emoflow' && programa === 'jc' && (
        <>
          {/* Toggle de alcance. El CSV de Emoflow arrastra el histórico completo (827): además
              de los estudiantes vigentes trae 17 en retiro probable y 68 que nunca llegaron a
              matricularse en Q10 (postulantes / retirados de años anteriores). Por defecto se
              muestra el universo canónico (742) para que este bloque cuadre con el resto del
              panel; "Todos" permite ver la foto histórica completa.
              Cableado 2026-08-26: si el filtro global Estado (arriba) está en "Retirados", este
              toggle queda deshabilitado y manda el Estado global (usa las vistas _retirado, que
              existían en el backend desde antes pero nunca se habían conectado — bug de la
              auditoría). Fuera de Retirados, el alcance local sigue siendo el control real, porque
              "Todos" acá no es lo mismo que el Estado "Todos" global (incluye gente que nunca
              se matriculó en Q10). */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className={`flex gap-1 tarjeta-glass p-1 w-fit ${estado === 'retirados' ? 'opacity-50' : ''}`}>
              {([['canonico', 'Solo estudiantes actuales'], ['todos', 'Todos (histórico)']] as const).map(
                ([a, txt]) => (
                  <button
                    key={a}
                    onClick={() => setAlcanceEmoflow(a)}
                    disabled={estado === 'retirados'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      estado !== 'retirados' && alcanceEmoflow === a
                        ? 'pill-metal pill-metal-azul'
                        : 'text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:hover:bg-transparent'
                    }`}
                  >
                    {txt}
                  </button>
                ),
              )}
            </div>
            <p className="text-xs text-slate-500 max-w-xl">
              {estado === 'retirados'
                ? 'Mostrando Retirados según el filtro Estado de arriba — este selector de alcance no aplica a ese segmento.'
                : alcanceEmoflow === 'canonico'
                  ? 'Solo estudiantes vigentes según la pestaña Seguimiento — coherente con el resto del panel.'
                  : 'Universo histórico completo del CSV de Emoflow: suma personas en retiro probable y usuarios que nunca se matricularon en Q10.'}
            </p>
          </div>
          <NotaFiltros
            inaplicables={[
              ...(estado !== 'retirados' ? ['Estado (arriba) para Activos/Todos — usá el selector de alcance de esta pestaña'] : []),
              ...(!esActual ? [`Cohorte — Emoflow no distingue cohorte, siempre muestra la foto vigente aunque arriba esté elegida "${etiquetaCohorte}"`] : []),
            ]}
          />

          {emoflowKpis ? (
            <>
              {/* Resumen en palabras — el reporte diario, generado solo */}
              {narrativaEmoflow && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="tarjeta-glass p-4 mb-5 border-l-4 border-rofe-azul"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    Resumen de hoy
                    {fechaCortaEs(datos.emoflowResumen?.[0]?.fecha_corte)
                      ? ` · ${fechaCortaEs(datos.emoflowResumen[0].fecha_corte)}`
                      : ''}
                  </p>
                  <p className="text-sm md:text-base text-slate-700 leading-relaxed">{narrativaEmoflow}</p>
                </motion.div>
              )}

              {/* KPIs con significado, no plomería */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Kpi
                  titulo={ciudadElegida ? `Estudiantes en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : 'Estudiantes con Emoflow'}
                  valor={emoflowKpis.participantes.toLocaleString('es-CO')}
                  detalle={
                    ciudadElegida
                      ? undefined
                      : fuenteEmoflow === 'canonico'
                        ? 'matriculados y vigentes en Seguimiento'
                        : fuenteEmoflow === 'retirado'
                          ? 'retirados oficiales de la cohorte (canon)'
                          : `${(datos.emoflowResumen?.[0]?.con_match_supabase ?? 0).toLocaleString('es-CO')} cruzan con nuestra cohorte`
                  }
                />
                <Kpi
                  titulo="Activos (últimos 7 días)"
                  valor={emoflowKpis.participantes ? `${Math.round((emoflowKpis.activos7 / emoflowKpis.participantes) * 100)}%` : '—'}
                  detalle={`${emoflowKpis.activos7.toLocaleString('es-CO')} de ${emoflowKpis.participantes.toLocaleString('es-CO')} ${fuenteEmoflow === 'canonico' ? 'vigentes' : fuenteEmoflow === 'retirado' ? 'retirados' : 'del histórico'}`}
                />
                <Kpi
                  titulo="En riesgo de abandono"
                  valor={emoflowKpis.participantes ? `${Math.round((emoflowKpis.inactivos30 / emoflowKpis.participantes) * 100)}%` : '—'}
                  detalle={`${emoflowKpis.inactivos30.toLocaleString('es-CO')} de ${emoflowKpis.participantes.toLocaleString('es-CO')} sin entrar +30 días`}
                />
                <Kpi
                  titulo="Usar Emoflow → aprobar (Q10)"
                  valor={correlacion ? `${correlacion.max.toFixed(0)}%` : '—'}
                  detalle={correlacion ? `vs ${correlacion.min.toFixed(0)}% de los que menos entran` : 'aprobación (Q10) de quienes más entran'}
                />
              </div>

              {/* Insight elevado: participar → aprender */}
              <div className="grid md:grid-cols-2 gap-6">
                <Seccion
                  titulo="Distribución de uso"
                  nota={`Cuántas veces entró cada estudiante al sistema (acumulado). Cubre ${emoflowBandas.reduce((s, b) => s + b.participantes, 0).toLocaleString('es-CO')} estudiantes con actividad.`}
                >
                  <GraficoBarras
                    datos={emoflowBandas}
                    dataKey="participantes"
                    nombre="Estudiantes"
                    color={C.azul2}
                  />
                </Seccion>

                <Seccion
                  titulo="¿El que más entra a Emoflow, aprueba más? (cruce con Q10)"
                  nota="Cruce: uso de Emoflow (eje de bandas) vs % de aprobación de los cursos, que viene de Q10 — no de Emoflow.">
                  <GraficoBarras
                    datos={emoflowBandas}
                    dataKey="pct_aprobacion"
                    nombre="Aprobación % (Q10)"
                    color={C.verde}
                    dominioMax={100}
                  />
                  {correlacion && (
                    <p className="text-xs text-slate-500 mt-2">
                      <b>Sí, y es medible:</b> quienes menos entran a Emoflow aprueban ~{correlacion.min.toFixed(0)}% y
                      quienes más entran ~{correlacion.max.toFixed(0)}% (aprobación de Q10). Usar Emoflow es señal
                      temprana de que el estudiante va bien — sirve para detectar a tiempo a quien se está quedando.
                    </p>
                  )}
                </Seccion>
              </div>

              {!ciudadElegida && (
                <Seccion titulo="Uso por ciudad" nota="Promedio de ingresos al sistema por grupo operativo.">
                  <GraficoBarras
                    datos={emoflowCiudades}
                    dataKey="ingresos_promedio"
                    nombre="Ingresos promedio"
                    color={C.naranja}
                    rotarEtiquetas
                  />
                </Seccion>
              )}

              {/* Evolución diaria REAL de ingresos — nacional o de la ciudad elegida */}
              {evolucionDiaria.length > 0 && (
                <Seccion
                  titulo={ciudadElegida
                    ? `Evolución de ingresos — ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}`
                    : 'Evolución de ingresos al sistema'}
                  nota={
                    'Usuarios activos = personas distintas que entraron ese día. Ingresos = total de registros de emoción (una persona genera varios en un día). Serie real desde los timestamps de Emoflow — arranca el 18 de marzo.' +
                    (estado === 'retirados' ? ' Esta serie no tiene desglose por Estado — sigue mostrando el histórico completo, no solo retirados.' : '')
                  }>
                  <GraficoHistorial
                    historial={evolucionDiaria}
                    metrica="ingresos"
                    nombreMetrica="Ingresos"
                  />
                </Seccion>
              )}

              {/* % de matrícula activa por ciudad — última semana COMPLETA. Directo de Emoflow. */}
              {!ciudadElegida && actividadSemanalUltima.datos.length > 0 && (
                <Seccion
                  titulo={`% de matrícula activa — semana del ${actividadSemanalUltima.semana ?? '—'}`}
                  nota={
                    'Personas distintas que entraron a Emoflow esa semana ÷ matrícula Emoflow de la ciudad. Última semana completa (la semana en curso se excluye por estar empezando). Directo del CSV de Emoflow.' +
                    (estado === 'retirados' ? ' Esta serie no tiene desglose por Estado — sigue mostrando el histórico completo, no solo retirados.' : '')
                  }
                >
                  <GraficoBarras
                    datos={actividadSemanalUltima.datos}
                    dataKey="pct_activos"
                    nombre="% activos"
                    color={C.azul3}
                    dominioMax={100}
                    rotarEtiquetas
                  />
                </Seccion>
              )}

              {!ciudadElegida && actividadSemanalEvolucion.length > 0 && (
                <Seccion
                  titulo="Evolución semanal de la actividad en Emoflow"
                  nota={
                    '% de la matrícula Emoflow activa por semana, por ciudad. Una marca por semana completa (eje X = lunes de cada semana). La semana en curso se muestra solo cuando termina, para no comparar días sueltos contra semanas completas. Directo del CSV de Emoflow.' +
                    (estado === 'retirados' ? ' Esta serie no tiene desglose por Estado — sigue mostrando el histórico completo, no solo retirados.' : '')
                  }
                >
                  <GraficoHistorial
                    historial={actividadSemanalEvolucion}
                    metrica="pct_activos"
                    nombreMetrica="% activos"
                  />
                </Seccion>
              )}
            </>
          ) : (
            <Seccion titulo="Emoflow">
              <p className="text-sm text-slate-500">Sin datos de Emoflow para esta selección.</p>
            </Seccion>
          )}
        </>
      )}
      {tab === 'Emoflow' && programa === 'mr' && (
        <NoAplica motivo="Mujeres ROFÉ no usa la plataforma Emoflow (0 matrículas en la fuente)." />
      )}
      </>
      )}
      </div>
    </>
  );
}
