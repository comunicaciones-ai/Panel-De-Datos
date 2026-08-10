'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  cargarTodo,
  Datos,
  PubDemografia,
  PubEmprendimiento,
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
type Tab = 'Resumen' | 'Cursos' | 'Demografía' | 'Historial' | 'Emprendimiento' | 'Emoflow' | 'Asistencia';
const TABS: Tab[] = ['Resumen', 'Cursos', 'Demografía', 'Historial', 'Emprendimiento', 'Emoflow', 'Asistencia'];

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

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="tarjeta-glass p-3"
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="text-2xl font-bold kpi-valor mt-1">{valor}</p>
      {detalle && <p className="text-xs text-slate-400 mt-1">{detalle}</p>}
    </motion.div>
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
  // Unidad del desglose "Estado de la cohorte": matrículas (inscripciones) o estudiantes (personas).
  // Solo tiene sentido bajo Estado=Activos (v_cohorte_estudiantes* no distingue retirados).
  const [unidadEstadoCohorte, setUnidadEstadoCohorte] = useState<'matriculas' | 'estudiantes'>('matriculas');
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

  const cohortes = useMemo(
    () =>
      datos
        ? Array.from(new Set(datos.cursos.map((c) => c.cohorte))).sort().reverse()
        : [],
    [datos],
  );
  const cohorteActual = cohortes[0] ?? '';
  const cohorte = cohorteElegida ?? cohorteActual;
  const esActual = cohorte === cohorteActual && cohorte !== '';

  // Geografía por municipio (v_pub_geografia) — fuente ÚNICA del selector de ciudad, cubre
  // ambos programas (antes el selector de arriba solo existía para JC, vía v_demografia_grupo).
  useEffect(() => {
    setCiudadElegida(null);
    setMunicipioElegido(null);
  }, [programa, cohorte]);

  const geografiaProg = useMemo(
    () =>
      datos
        ? datos.geografiaMunicipio.filter((g) => g.programa === programa && g.cohorte === cohorte)
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
        ? datos.cursos.filter((c) => c.programa === programa && c.cohorte === cohorte)
        : [],
    [datos, programa, cohorte],
  );

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
        d.cohorte === cohorte &&
        (estado === 'todos' || d.estado === (estado === 'activos' ? 'activo' : 'retirado')) &&
        (!ciudadElegida || d.grupo_ciudad === ciudadElegida),
    );
  }, [datos, programa, cohorte, estado, ciudadElegida]);

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
        d.cohorte === cohorte &&
        (estado === 'todos' || d.estado === (estado === 'activos' ? 'activo' : 'retirado')) &&
        (!ciudadElegida || d.grupo_ciudad === ciudadElegida),
    );
  }, [datos, programa, cohorte, estado, ciudadElegida]);
  const emprendimientoAplicaPrograma = !!datos && datos.pubEmprendimiento.some((d) => d.programa === programa);

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

  // Emoflow — KPIs. Sin ciudad: agregado nacional. Con ciudad: la fila de esa ciudad (JC-only,
  // Emoflow no tiene matrículas MR — ver "no aplica" del tab).
  const emoflowKpis = useMemo(() => {
    if (!datos) return null;
    const canon = alcanceEmoflow === 'canonico';
    if (ciudadElegida) {
      const fuente = canon ? datos.emoflowPorCiudadCanonico : datos.emoflowPorCiudad;
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
    const r = (canon ? datos.emoflowResumenCanonico : datos.emoflowResumen)?.[0];
    if (!r) return null;
    return {
      participantes: r.participantes,
      promedio: Number(r.ingresos_promedio ?? 0),
      mediana: r.ingresos_mediana ?? 0,
      activos7: r.activos_7d,
      inactivos30: r.inactivos_30d,
    };
  }, [datos, ciudadElegida, alcanceEmoflow]);

  const emoflowBandas = useMemo(() => {
    if (!datos) return [];
    const canon = alcanceEmoflow === 'canonico';
    const filas = ciudadElegida
      ? ((canon ? datos.emoflowBandasCiudadCanonico : datos.emoflowBandasCiudad) ?? []).filter(
          (b) => b.grupo_ciudad === ciudadElegida,
        )
      : ((canon ? datos.emoflowBandasCanonico : datos.emoflowBandas) ?? []);
    return [...filas]
      .sort((a, b) => a.orden - b.orden)
      .map((b) => ({
        etiqueta: b.banda,
        participantes: b.participantes,
        pct_aprobacion: Number(b.pct_aprobacion ?? 0),
      }));
  }, [datos, ciudadElegida, alcanceEmoflow]);

  const emoflowCiudades = useMemo(() => {
    if (!datos) return [];
    const fuente =
      alcanceEmoflow === 'canonico' ? datos.emoflowPorCiudadCanonico : datos.emoflowPorCiudad;
    return (fuente ?? []).map((c) => ({
      etiqueta: ETIQUETA_GRUPO[c.grupo_ciudad] ?? c.grupo_ciudad,
      ingresos_promedio: Number(c.ingresos_promedio ?? 0),
    }));
  }, [datos, alcanceEmoflow]);

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
  const aprobacionProg = useMemo(
    () =>
      datos
        ? datos.aprobacion.filter((a) => a.programa === programa && a.cohorte === cohorte)
        : [],
    [datos, programa, cohorte],
  );

  // Única decisión de qué vista de Cursos usar (§1.2 del diagnóstico: antes se calculaba dos
  // veces, en Resumen y en Cursos, con riesgo de desalinearse). Se consume igual en ambos tabs.
  const mostrarCanonico = esActual && aprobacionProg.length > 0;

  // Retiro probable JC: personas fuera de Seguimiento (Sheet) que Q10 aún no marca retiradas
  // oficialmente. Alerta complementaria, en duda hasta que Q10 lo confirme — no se mezcla con
  // cohorte_ingresos.retirados (oficial). Solo existe para JC.
  const retiroProbable = useMemo(
    () =>
      datos && programa === 'jc'
        ? datos.retiroProbableJc.find((r) => r.cohorte === cohorte) ?? null
        : null,
    [datos, programa, cohorte],
  );

  // Verificación cruzada: misma forma que aprobacion_cursos pero recalculada desde
  // enrollments + en_seguimiento_jc, para detectar si el pipeline oficial de Q10 se
  // desincroniza de Supabase (como pasó el 2026-07-23 con un sync atrasado).
  const aprobacionAjustadaProg = useMemo(
    () =>
      datos && programa === 'jc'
        ? datos.aprobacionAjustada.filter((a) => a.cohorte === cohorte)
        : [],
    [datos, programa, cohorte],
  );

  // Distribución de estudiantes por # de cursos aprobados (histograma). Se rellenan los huecos
  // (0..max) para que el eje sea continuo y muestre honestamente los tramos sin nadie.
  const distribucionEst = useMemo(() => {
    if (!datos) return [] as { etiqueta: string; estudiantes: number }[];
    const filas = datos.estudiantesDist.filter(
      (d) => d.cohorte === cohorte && d.programa === programa,
    );
    if (filas.length === 0) return [];
    const max = Math.max(...filas.map((f) => f.cursos_aprobados));
    return Array.from({ length: max + 1 }, (_, n) => ({
      etiqueta: String(n),
      estudiantes: filas.find((f) => f.cursos_aprobados === n)?.estudiantes ?? 0,
    }));
  }, [datos, cohorte, programa]);

  const ingresosProg = useMemo(
    () => datos?.ingresos.find((i) => i.cohorte === cohorte && i.programa === programa),
    [datos, cohorte, programa],
  );

  // Segmentos del gráfico de aprobación por curso, recortados al Estado elegido: Activos
  // (aprobó/en curso, denominador=activos), Retirados (aprobó-y-retiró/retirado,
  // denominador=retirados) o Todos (los 4 segmentos, como antes — denominador=cursaron).
  const segmentosAprobacion = (a: (typeof aprobacionProg)[number]) => {
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
  const totalPorEstado = (a: (typeof aprobacionProg)[number]) =>
    estado === 'activos' ? a.activos : estado === 'retirados' ? a.retirados : a.cursaron;
  const aprobadosPorEstado = (a: (typeof aprobacionProg)[number]) =>
    estado === 'activos' ? a.aprobados : estado === 'retirados' ? a.aprobados_retirados
      : (a.aprobados_total ?? a.aprobados + a.aprobados_retirados);

  const kpis = useMemo(() => {
    if (!datos) return null;
    const ps = datos.programas.find(
      (p) => p.programa === programa && p.cohorte === cohorte,
    );
    // cohorte_stats viene separada por programa desde la migración de separación JC/MR
    const co = datos.cohorte.find((c) => c.cohorte === cohorte && c.programa === programa);
    const ing = ingresosProg;

    let participantes = ps?.participantes ?? 0;
    let matriculas = ps?.matriculas ?? 0;
    let completadas = ps?.completadas ?? 0;
    let promedio = ps?.promedio_avance ? `${ps.promedio_avance}%` : '—';
    let edadProm = co?.edad_promedio ? Number(co.edad_promedio).toFixed(1) : '—';

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

    // Filtro "Estado": cambia qué número de cohorte_ingresos es EL número principal, no solo
    // un detalle pasivo (§2.1.3 — reemplaza la exposición de solo lectura de antes).
    const cifraEstado = !ing ? null : estado === 'activos' ? ing.activos : estado === 'retirados' ? ing.retirados : ing.ingresados;

    return {
      participantes,
      matriculas,
      pctCompletadas: matriculas ? Math.round((100 * completadas) / matriculas) : 0,
      promedio,
      pctAprobados: hayFiltroCiudad ? null : (ing?.pct_aprobados ? `${ing.pct_aprobados}%` : '—'),
      esCanonico,
      numCursos: aprobacionProg.length,
      estadoCohorte,
      estadoEst,
      edadProm,
      cifraEstado,
      ingresados: hayFiltroCiudad ? null : ing?.ingresados ?? null,
      activos: ing?.activos ?? null,
      retirados: ing?.retirados ?? null,
    };
  }, [datos, programa, cohorte, estado, hayFiltroCiudad, geografiaResumen, esActual, aprobacionProg, mostrarCanonico, ingresosProg]);

  const cambiarPrograma = (p: Programa) => setPrograma(p);
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

  // v_mr_demografia (formato largo, legacy) — solo se conserva para la tarjeta de
  // "Emprendimiento" (booleano tiene_emprendimiento) dentro de Demografía MR: v_pub_demografia
  // (037) no incluye esa dimensión (pertenece conceptualmente al tab Emprendimiento, que para
  // MR no existe como encuesta detallada) — mezclar aquí la fuente vieja es deliberado y de
  // bajo riesgo, documentado en plan-rediseno-panel-datos-2026-07-30.md Fase 3.
  const totalMrConDatos = datos.mrDemografia
    .filter((d) => d.dimension === 'emprendimiento')
    .reduce((s, d) => s + d.total, 0);
  const emprendimientoBooleanoMr = datos.mrDemografia
    .filter((d) => d.dimension === 'emprendimiento')
    .map((d) => ({
      nombre: ETIQUETA_MR[d.categoria] ?? d.categoria,
      total: d.total,
      color: d.categoria === 'con_emprendimiento' ? C.verde : C.amarillo,
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

    if (dimension === 'genero') {
      const filas = Array.from(mapa.entries()).map(([categoria, total]) => ({
        nombre: categoria,
        total,
        color: COLOR_GENERO[categoria] ?? C.amarillo,
      }));
      return (
        <Seccion titulo={ETIQUETA_DIMENSION[dimension]}>
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
        <GraficoBarras datos={filas} dataKey="total" nombre="Personas" color={C.azul2} />
      </Seccion>
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
        {/* Selector de cohorte (actual + históricas de Q10) */}
        <div className="flex gap-1 tarjeta-glass p-1">
          {cohortes.map((coh) => (
            <button
              key={coh}
              onClick={() => cambiarCohorte(coh)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                cohorte === coh
                  ? 'pill-metal pill-metal-verde'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {coh}
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
              </button>
              {gruposGeografia.map(({ grupo, total }) => (
                <button
                  key={grupo}
                  onClick={() => { setCiudadElegida(grupo); setMunicipioElegido(null); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    ciudadElegida === grupo ? 'pill-metal pill-metal-naranja' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {ETIQUETA_GRUPO[grupo] ?? grupo} · {total}
                </button>
              ))}
            </div>
            {ciudadElegida && municipiosGrupo.length > 1 && (
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
        {/* Tabs — siempre las 7, cada sección decide "no aplica" internamente */}
        <nav className="flex gap-1 tarjeta-glass p-1 flex-wrap">
          {TABS.map((t) => (
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
            {esActual && kpis.cifraEstado !== null ? (
              <Kpi
                titulo={`${ETIQUETA_ESTADO[estado]} ${NOMBRE_PROGRAMA[programa]}`}
                valor={String(kpis.cifraEstado)}
                detalle={
                  estado === 'todos'
                    ? `Cohorte ${cohorte} completa: ${kpis.activos} activos + ${kpis.retirados} retirados (sin perfiles de prueba ni retiros institucionales)`
                    : `De ${kpis.ingresados ?? '—'} ingresados en la cohorte ${cohorte}`
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
                    ? `Activos en la cohorte ${cohorte}. La cohorte canónica (ingresados = activos + retirados) no tiene desglose por ciudad.`
                    : esActual
                      ? `Activos en la cohorte ${cohorte}`
                      : `Cohorte ${cohorte} (histórico Q10 — no incluye retirados)`
                }
              />
            )}
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
                valor={String(cursosProg.length)}
                detalle={`Ruta ${NOMBRE_PROGRAMA[programa]} ${cohorte}`}
              />
            )}
          </div>
          {kpis.esCanonico && kpis.estadoCohorte && (
            <Seccion
              titulo="Estado de la cohorte"
              nota={
                unidadEstadoCohorte === 'matriculas'
                  ? `Desglose de las ${kpis.estadoCohorte.total.toLocaleString('es-CO')} matrículas (inscripciones) de la cohorte completa — una persona cuenta en cada curso. ${NOMBRE_PROGRAMA[programa]} · ${cohorte}. Se aprueba con avance > 80%.`
                  : kpis.estadoEst
                    ? `Desglose de los ${kpis.estadoEst.total.toLocaleString('es-CO')} estudiantes (personas únicas) según su avance promedio en la cohorte. ${NOMBRE_PROGRAMA[programa]} · ${cohorte}. En promedio cada uno ha aprobado ${kpis.estadoEst.promAprobados ?? '—'} cursos.`
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
          {/* Retiro probable JC — alerta complementaria (v_retiro_probable_jc), NO oficial:
              gente que ya no está en la pestaña Seguimiento pero Q10 no la ha marcado retirada.
              Pendiente de confirmar; no resta de cohorte_ingresos.retirados. */}
          {esActual && programa === 'jc' && retiroProbable && retiroProbable.retiro_probable_total > 0 && (
            <Seccion
              titulo="Retiro probable (pendiente de confirmar en Q10)"
              nota={`${retiroProbable.retiro_probable_total} persona(s) ya no aparecen en la pestaña Seguimiento del equipo, pero Q10 aún no las marca retiradas oficialmente — puede tratarse de un retiro real en trámite o de una falsa alarma. No se cuentan como retiradas oficiales hasta que Q10 lo confirme.`}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <EstadoStat
                  etiqueta="Ya habían aprobado"
                  valor={retiroProbable.retiro_probable_aprobado}
                  total={retiroProbable.retiro_probable_total}
                  color={C.amarillo}
                  detalle="avance prom. > 80% antes de salir de Seguimiento"
                />
                <EstadoStat
                  etiqueta="No habían aprobado"
                  valor={retiroProbable.retiro_probable_no_aprobado}
                  total={retiroProbable.retiro_probable_total}
                  color={C.rojo}
                  detalle="avance prom. ≤ 80%"
                />
                <EstadoStat
                  etiqueta="Total en duda"
                  valor={retiroProbable.retiro_probable_total}
                  total={retiroProbable.retiro_probable_total}
                  color={C.naranja}
                  detalle={`avance promedio ${retiroProbable.avance_promedio ?? '—'}%`}
                />
              </div>
            </Seccion>
          )}
          {/* El desglose de aprobación (aprobados/retirados) sale de aprobacion_cursos, que no
              trae grupo_ciudad. Con una ciudad/municipio elegido caemos al gráfico de completación. */}
          {mostrarCanonico && !hayFiltroCiudad ? (
            <Seccion
              titulo={`Avance de la cohorte por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte} · ${ETIQUETA_ESTADO[estado]}`}
              nota={`Cada barra suma la cohorte completa que cursó (${kpis.ingresados ?? '—'} ingresados en los cursos base): aprobó = avance > 80%; quien aprobó antes de retirarse conserva su logro.`}
            >
              <GraficoAprobacion datos={aprobacionProg.map(segmentosAprobacion)} />
            </Seccion>
          ) : (
            <Seccion
              titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}${ciudadElegida ? ` (${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida})` : ''}`}
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
              nota="Aprobados compara aprobacion_cursos (pipeline oficial de Q10) contra un recálculo directo desde Supabase (enrollments + en_seguimiento_jc). 'Revisar' en cursos tempranos de la ruta (Bienvenida, Habilidades, Hackea, Emprendimiento) suele ser normal: Supabase solo tiene a los 777 participantes vigentes al momento del último sync, mientras Q10 ya trae 832 (760 activos + 74 retirados oficiales acumulados) — ~55 retiros antiguos nunca se cargaron en Supabase, así que el recálculo los sub-cuenta en los cursos que sí alcanzaron a completar antes de irse. Un 'Revisar' inesperado en un curso tardío (Lógica, IA) sí amerita revisar el sync. Cursando ahora = activos con avance <80% en ese curso puntual (no comparable con Q10: no reemplaza el conteo oficial de quién intentó cada curso)."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4">Curso</th>
                      <th className="py-2 pr-4 text-right">Cursaron (oficial)</th>
                      <th className="py-2 pr-4 text-right">Cursando ahora (recalculado)</th>
                      <th className="py-2 pr-4 text-right">Aprobados (oficial)</th>
                      <th className="py-2 pr-4 text-right">Aprobados (recalculado)</th>
                      <th className="py-2 text-right">¿Coincide aprobados?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aprobacionAjustadaProg.map((aj) => {
                      const norm = (s: string) => s.trim().toUpperCase();
                      const of = aprobacionProg.find((a) => norm(a.curso) === norm(aj.curso));
                      const aprobOf = of ? (of.aprobados_total ?? of.aprobados + of.aprobados_retirados) : null;
                      const aprobAj = aj.aprobados_total ?? aj.aprobados + aj.aprobados_retirados;
                      const cursandoAhora = (aj.banda_0_25 ?? 0) + (aj.banda_26_80 ?? 0);
                      const coincide = of ? aprobOf === aprobAj : false;
                      return (
                        <tr key={aj.curso} className="border-b border-slate-100">
                          <td className="py-2 pr-4">{aj.curso}</td>
                          <td className="py-2 pr-4 text-right">{of?.cursaron ?? '—'}</td>
                          <td className="py-2 pr-4 text-right">{cursandoAhora}</td>
                          <td className="py-2 pr-4 text-right">{aprobOf ?? '—'}</td>
                          <td className="py-2 pr-4 text-right">{aprobAj}</td>
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

      {tab === 'Cursos' && mostrarCanonico && (
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
            <>
              <Seccion
                titulo={`Avance de la cohorte por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte} · ${ETIQUETA_ESTADO[estado]}`}
                nota="Cada barra suma la cohorte completa que cursó: aprobó = avance > 80%; quien aprobó antes de retirarse conserva su logro."
              >
                <GraficoAprobacion datos={aprobacionProg.map(segmentosAprobacion)} />
              </Seccion>
              <Seccion titulo={`Detalle por curso (${ETIQUETA_ESTADO[estado].toLowerCase()})`}>
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
                      {aprobacionProg.map((a) => {
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
              titulo={`¿Cuántos cursos ha aprobado cada estudiante? — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}`}
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
                ruta {NOMBRE_PROGRAMA[programa]} {cohorte}). Un estudiante en el extremo alto ya
                completó casi toda la ruta; los del extremo bajo son los que requieren
                acompañamiento.
              </p>
            </Seccion>
          ) : (
            <p className="text-sm text-slate-400">Sin datos por estudiante para esta cohorte.</p>
          )}
        </>
      )}

      {tab === 'Cursos' && !mostrarCanonico && (
        <>
          <Seccion
            titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}${ciudadElegida ? ` (${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida})` : ''}`}
            nota={ciudadElegida ? `Completado = avance > 80%. Datos filtrados para ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}.` : "Completado = avance > 80%."}
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
          <Seccion titulo="Detalle por curso">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4">Curso</th>
                    <th className="py-2 pr-4 text-right">Matriculados</th>
                    <th className="py-2 pr-4 text-right">Completados</th>
                    <th className="py-2 pr-4 text-right">% Completados</th>
                    <th className="py-2 text-right">Avance promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {(ciudadElegida ? cursosPorCiudadFiltrados : cursosProg).map((c) => (
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

      {tab === 'Emprendimiento' && (
        !emprendimientoAplicaPrograma ? (
          <NoAplica motivo="Mujeres ROFÉ no tiene la encuesta de diagnóstico de emprendimiento (esa medición es solo de Jóvenes creaTIvos)." />
        ) : pubEmprendimientoFiltrada.length === 0 ? (
          <NoAplica motivo="sin datos para este filtro (cohorte/estado/ciudad elegidos)." suave />
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <Seccion titulo="Situación frente al emprendimiento" nota={`Encuesta de diagnóstico Jóvenes creaTIvos · ${cohorte} · ${ETIQUETA_ESTADO[estado]}.`}>
              <GraficoEmprendimiento datos={emprendimientoOrdenado} />
            </Seccion>
            <Seccion titulo="Cursos completados según situación" nota="Promedio de cursos completados por participante en cada grupo.">
              <GraficoBarras datos={empVsCursos} dataKey="cursos" nombre="Cursos completados (prom.)" color={C.verde} dominioMax={9} />
              <p className="text-xs text-slate-400 mt-2">
                Los cuatro grupos avanzan de forma pareja: tener (o no) un emprendimiento no cambia el ritmo en la ruta de cursos.
              </p>
            </Seccion>
          </div>
        )
      )}

      {tab === 'Demografía' && (
        <>
          <p className="text-xs text-slate-400 mb-4">
            {NOMBRE_PROGRAMA[programa]} · {cohorte} · {ETIQUETA_ESTADO[estado]}
            {programa === 'mr' ? ` — fuente: BD-Mujeres ROFÉ (${totalMrConDatos} mujeres con datos sociodemográficos).` : ' — fuente: BD de monitorias.'}
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {DIMENSIONES_DEMOGRAFIA.map((dim) => (
              <TarjetaDemografia key={dim} dimension={dim} />
            ))}
            {programa === 'mr' ? (
              <Seccion titulo="Emprendimiento" nota="Con emprendimiento = registra un emprendimiento con nombre en la BD.">
                <GraficoEmprendimiento datos={emprendimientoBooleanoMr} />
              </Seccion>
            ) : (
              <Seccion titulo="Emprendimiento">
                <NoAplica motivo="para Jóvenes creaTIvos el diagnóstico de emprendimiento tiene su propio tab (más detalle: en marcha / idea / interesado / no interesado)." />
              </Seccion>
            )}
          </div>
        </>
      )}

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
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Kpi
                titulo="Asistencia promedio"
                valor={promedioGlobal != null ? `${promedioGlobal.toFixed(1)}%` : '—'}
                detalle={`${NOMBRE_PROGRAMA[programa]} · ${cohorte} · ${ETIQUETA_ESTADO[estado]}`}
              />
              <Kpi titulo="Estudiantes con dato" valor={nTotal.toLocaleString('es-CO')} detalle="con registro de asistencia Zoom validada" />
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
              panel; "Todos" permite ver la foto histórica completa. */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex gap-1 tarjeta-glass p-1 w-fit">
              {([['canonico', 'Solo estudiantes actuales'], ['todos', 'Todos (histórico)']] as const).map(
                ([a, txt]) => (
                  <button
                    key={a}
                    onClick={() => setAlcanceEmoflow(a)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      alcanceEmoflow === a
                        ? 'pill-metal pill-metal-azul'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {txt}
                  </button>
                ),
              )}
            </div>
            <p className="text-xs text-slate-500 max-w-xl">
              {alcanceEmoflow === 'canonico'
                ? 'Solo estudiantes vigentes según la pestaña Seguimiento — coherente con el resto del panel.'
                : 'Universo histórico completo del CSV de Emoflow: suma personas en retiro probable y usuarios que nunca se matricularon en Q10.'}
            </p>
          </div>

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
                      : alcanceEmoflow === 'canonico'
                        ? 'matriculados y vigentes en Seguimiento'
                        : `${(datos.emoflowResumen?.[0]?.con_match_supabase ?? 0).toLocaleString('es-CO')} cruzan con nuestra cohorte`
                  }
                />
                <Kpi
                  titulo="Activos (últimos 7 días)"
                  valor={emoflowKpis.participantes ? `${Math.round((emoflowKpis.activos7 / emoflowKpis.participantes) * 100)}%` : '—'}
                  detalle={`${emoflowKpis.activos7.toLocaleString('es-CO')} estudiantes`}
                />
                <Kpi
                  titulo="En riesgo de abandono"
                  valor={emoflowKpis.participantes ? `${Math.round((emoflowKpis.inactivos30 / emoflowKpis.participantes) * 100)}%` : '—'}
                  detalle={`${emoflowKpis.inactivos30.toLocaleString('es-CO')} sin entrar +30 días`}
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
                  nota="Usuarios activos = personas distintas que entraron ese día. Ingresos = total de registros de emoción (una persona genera varios en un día). Serie real desde los timestamps de Emoflow — arranca el 18 de marzo.">
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
                  nota="Personas distintas que entraron a Emoflow esa semana ÷ matrícula Emoflow de la ciudad. Última semana completa (la semana en curso se excluye por estar empezando). Directo del CSV de Emoflow."
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
                  nota="% de la matrícula Emoflow activa por semana, por ciudad. Una marca por semana completa (eje X = lunes de cada semana). La semana en curso se muestra solo cuando termina, para no comparar días sueltos contra semanas completas. Directo del CSV de Emoflow."
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
      </div>
    </>
  );
}
