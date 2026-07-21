'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  cargarTodo,
  Datos,
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
  GraficoDemografia,
  GraficoEmprendimiento,
  GraficoHistorial,
} from '@/components/graficos';
import { motion } from 'framer-motion';
import { Hero } from '@/components/efectos/Hero';
import { BackgroundPaths } from '@/components/efectos/BackgroundPaths';

type Programa = 'jc' | 'mr';
type Tab = 'Resumen' | 'Cursos' | 'Historial' | 'Emprendimiento' | 'Demografía' | 'Emoflow';
type Ciudad = string | null;

// La cohorte "actual" NO va hardcodeada: es la mayor presente en los datos, así el
// cambio de año no requiere tocar el frontend (el ETL escribe la cohorte nueva y listo).
// Emprendimiento (encuesta diagnóstico) es solo JC; Demografía existe para ambos
// programas con fuentes distintas (JC: BD monitorias · MR: BD-Mujeres ROFÉ, vista
// v_mr_demografia). El Historial (serie diaria) arranca en la cohorte 2026.
// Cohortes pasadas (importadas de Q10): Resumen + Cursos.
// Emoflow (ingresos al sistema) es solo JC —0 matrículas MR en la fuente— y solo cohorte
// actual: la pestaña de origen no tiene dimensión de cohorte.
function tabsDisponibles(programa: Programa, esActual: boolean): Tab[] {
  if (!esActual) return ['Resumen', 'Cursos'];
  return programa === 'jc'
    ? ['Resumen', 'Cursos', 'Historial', 'Emprendimiento', 'Demografía', 'Emoflow']
    : ['Resumen', 'Cursos', 'Historial', 'Demografía'];
}

const COLOR_SITUACION: Record<string, string> = {
  en_marcha: C.verde,
  idea: C.azul2,
  interesado: C.amarillo,
  no_interesado: C.naranja,
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

export default function Pagina() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [programa, setPrograma] = useState<Programa>('jc');
  // null = "la cohorte actual" (se resuelve con los datos; no hardcodear el año)
  const [cohorteElegida, setCohorteElegida] = useState<string | null>(null);
  const [ciudadElegida, setCiudadElegida] = useState<Ciudad>(null);
  const [tab, setTab] = useState<Tab>('Resumen');
  // Unidad del desglose "Estado de la cohorte": matrículas (inscripciones) o estudiantes (personas)
  const [unidadEstado, setUnidadEstado] = useState<'matriculas' | 'estudiantes'>('matriculas');

  useEffect(() => {
    cargarTodo().then(setDatos).catch((e) => setError(String(e)));
  }, []);

  // Fondo de página rosado mientras el programa activo sea Mujeres ROFÉ
  useEffect(() => {
    document.body.classList.toggle('tema-mr-body', programa === 'mr');
    return () => document.body.classList.remove('tema-mr-body');
  }, [programa]);

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

  const ciudades = useMemo(
    () =>
      datos
        ? Array.from(new Set(datos.demografia.map((d) => d.grupo_ciudad))).sort()
        : [],
    [datos],
  );

  const cursosProg = useMemo(
    () =>
      datos
        ? datos.cursos.filter((c) => c.programa === programa && c.cohorte === cohorte)
        : [],
    [datos, programa, cohorte],
  );

  const participantesFiltrados = useMemo(
    () => {
      if (!datos || programa !== 'jc') return datos?.demografia ?? [];
      if (!ciudadElegida) return datos.demografia;
      return datos.demografia.filter((d) => d.grupo_ciudad === ciudadElegida);
    },
    [datos, programa, ciudadElegida],
  );

  // Cursos filtrados por ciudad (cuando se selecciona una ciudad en JC)
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

  const historialProg = useMemo(
    () => (datos ? datos.historial.filter((h) => h.programa === programa) : []),
    [datos, programa],
  );

  // Emprendimiento filtrado por ciudad (JC solamente)
  const emprendimientoPorCiudad = useMemo(
    () => {
      if (!datos || programa !== 'jc' || !ciudadElegida) return datos?.emprendimiento ?? [];
      return datos.emprendimientoPorCiudad?.filter((e) => e.grupo_ciudad === ciudadElegida) ?? [];
    },
    [datos, programa, ciudadElegida],
  );

  // Historial filtrado por ciudad. Serie propia (historial_cursos_ciudad), no el histórico
  // nacional: este último nunca guardó la dimensión ciudad, así que no se puede desglosar.
  const historialPorCiudad = useMemo(
    () => {
      if (!datos || programa !== 'jc' || !ciudadElegida) return [];
      return (
        datos.historialPorCiudad?.filter((h) => h.grupo_ciudad === ciudadElegida) ?? []
      );
    },
    [datos, programa, ciudadElegida],
  );

  // Emoflow — KPIs. Sin ciudad: agregado nacional (v_emoflow_resumen). Con ciudad: la fila de
  // esa ciudad. Mismo patrón "nacional vs *PorCiudad" del resto del panel.
  const emoflowKpis = useMemo(() => {
    if (!datos) return null;
    if (ciudadElegida) {
      const c = datos.emoflowPorCiudad?.find((e) => e.grupo_ciudad === ciudadElegida);
      if (!c) return null;
      return {
        participantes: c.participantes,
        promedio: Number(c.ingresos_promedio ?? 0),
        mediana: c.ingresos_mediana ?? 0,
        activos7: c.activos_7d,
        inactivos30: c.inactivos_30d,
      };
    }
    const r = datos.emoflowResumen?.[0];
    if (!r) return null;
    return {
      participantes: r.participantes,
      promedio: Number(r.ingresos_promedio ?? 0),
      mediana: r.ingresos_mediana ?? 0,
      activos7: r.activos_7d,
      inactivos30: r.inactivos_30d,
    };
  }, [datos, ciudadElegida]);

  // Emoflow — bandas de uso. Con ciudad elegida hay que usar la vista desglosada: mostrar las
  // bandas nacionales dentro de una vista de ciudad sería mezclar universos.
  const emoflowBandas = useMemo(() => {
    if (!datos) return [];
    const filas = ciudadElegida
      ? (datos.emoflowBandasCiudad ?? []).filter((b) => b.grupo_ciudad === ciudadElegida)
      : (datos.emoflowBandas ?? []);
    return [...filas]
      .sort((a, b) => a.orden - b.orden)
      .map((b) => ({
        etiqueta: b.banda,
        participantes: b.participantes,
        pct_aprobacion: Number(b.pct_aprobacion ?? 0),
      }));
  }, [datos, ciudadElegida]);

  // Uso por ciudad — solo tiene sentido en la vista nacional (con una ciudad elegida sería
  // una sola barra).
  const emoflowCiudades = useMemo(() => {
    if (!datos) return [];
    return (datos.emoflowPorCiudad ?? []).map((c) => ({
      etiqueta: ETIQUETA_GRUPO[c.grupo_ciudad] ?? c.grupo_ciudad,
      ingresos_promedio: Number(c.ingresos_promedio ?? 0),
    }));
  }, [datos]);

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

  const kpis = useMemo(() => {
    if (!datos) return null;
    const ps = datos.programas.find(
      (p) => p.programa === programa && p.cohorte === cohorte,
    );
    // cohorte_stats viene separada por programa desde la migración de separación JC/MR
    const co = datos.cohorte.find((c) => c.cohorte === cohorte && c.programa === programa);
    // Ingresados canónicos (cohorte completa: activos + retirados)
    const ing = datos.ingresos.find((i) => i.cohorte === cohorte && i.programa === programa);

    // Si hay ciudad elegida (solo para JC), usar datos filtrados por ciudad
    let participantes = ps?.participantes ?? 0;
    let matriculas = ps?.matriculas ?? 0;
    let completadas = ps?.completadas ?? 0;
    let promedio = ps?.promedio_avance ? `${ps.promedio_avance}%` : '—';
    let edadProm = co?.edad_promedio ? Number(co.edad_promedio).toFixed(1) : '—';
    let empMarcha = datos.emprendimiento.find((e) => e.situacion === 'en_marcha')?.total ?? 0;

    if (programa === 'jc' && ciudadElegida) {
      const statsCiudad = datos.statsProgramaPorCiudad?.find((s) => s.grupo_ciudad === ciudadElegida);
      if (statsCiudad) {
        participantes = statsCiudad.participantes;
        matriculas = statsCiudad.matriculas;
        completadas = statsCiudad.completadas;
        promedio = statsCiudad.promedio_avance ? `${statsCiudad.promedio_avance}%` : '—';
        empMarcha = statsCiudad.con_emprendimiento;
      }

      // Edad promedio de la ciudad seleccionada
      const ciudadDem = participantesFiltrados[0];
      if (ciudadDem?.edad_promedio) {
        edadProm = Number(ciudadDem.edad_promedio).toFixed(1);
      }
    }

    // cohorte_ingresos (la cohorte canónica: activos + retirados) no tiene desglose por
    // ciudad — el dato de retiros no trae grupo_ciudad. Con una ciudad elegida mostramos
    // participantes activos de esa ciudad en vez de un total nacional que no aplica.
    const hayFiltroCiudad = programa === 'jc' && ciudadElegida !== null;

    // Cohorte actual sin filtro de ciudad → TODO el encabezado de cursos sale del canónico
    // (aprobacion_cursos + cohorte_ingresos): misma fuente que el dashboard GitHub y sin pasar
    // por el Sheet h2test (export_aprobacion.py entra directo a Q10). v_programa_stats (derivado
    // de enrollments/Sheets) queda solo para cohortes históricas y para la vista por ciudad,
    // donde no existe alternativa canónica. Así ambos paneles muestran los mismos números.
    // Desglose de las matrículas de la cohorte en los 4 estados accionables (canónico).
    // Suman a `cursaron`: aprobadas (>80, incl. retirados que aprobaron) + en progreso (26-80)
    // + en riesgo (0-25) + retiradas sin aprobar. Útil para decidir dónde intervenir.
    let estado: null | {
      aprobadas: number; enProgreso: number; enRiesgo: number; retiradas: number; total: number;
    } = null;

    const esCanonico = esActual && aprobacionProg.length > 0 && !hayFiltroCiudad;
    if (esCanonico) {
      matriculas = aprobacionProg.reduce((s, a) => s + a.cursaron, 0);
      completadas = aprobacionProg.reduce(
        (s, a) => s + (a.aprobados_total ?? a.aprobados + a.aprobados_retirados), 0);
      // Avance promedio ponderado por cursaron — los promedios por curso ya son canónicos,
      // el frontend solo agrega (no re-deriva desde matrículas crudas).
      const sumaPond = aprobacionProg.reduce((s, a) => s + Number(a.promedio ?? 0) * a.cursaron, 0);
      promedio = matriculas ? `${(sumaPond / matriculas).toFixed(1)}%` : promedio;
      estado = {
        aprobadas: completadas,
        enProgreso: aprobacionProg.reduce((s, a) => s + (a.banda_26_80 ?? 0), 0),
        enRiesgo: aprobacionProg.reduce((s, a) => s + (a.banda_0_25 ?? 0), 0),
        retiradas: aprobacionProg.reduce((s, a) => s + a.retirados, 0),
        total: matriculas,
      };
    }

    // Desglose por ESTUDIANTES (personas únicas) — v_cohorte_estudiantes clasifica a cada
    // estudiante activo por su avance promedio; los retirados salen de cohorte_ingresos.
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

    return {
      participantes,
      matriculas,
      pctCompletadas: matriculas ? Math.round((100 * completadas) / matriculas) : 0,
      promedio,
      pctAprobados: hayFiltroCiudad ? null : (ing?.pct_aprobados ? `${ing.pct_aprobados}%` : '—'),
      esCanonico,
      numCursos: aprobacionProg.length,
      estado,
      estadoEst,
      edadProm,
      empMarcha,
      ingresados: hayFiltroCiudad ? null : ing?.ingresados ?? null,
      activos: ing?.activos ?? null,
      retirados: ing?.retirados ?? null,
    };
  }, [datos, programa, cohorte, ciudadElegida, participantesFiltrados, esActual, aprobacionProg]);

  const ajustarTab = (p: Programa, actual: boolean) => {
    if (!tabsDisponibles(p, actual).includes(tab)) setTab('Resumen');
  };

  const cambiarPrograma = (p: Programa) => {
    setPrograma(p);
    if (p !== 'jc') setCiudadElegida(null);
    ajustarTab(p, esActual);
  };

  const cambiarCohorte = (coh: string) => {
    setCohorteElegida(coh);
    // Solo la cohorte actual tiene datos de ciudad — no arrastrar el filtro a una pasada.
    if (coh !== cohorteActual) setCiudadElegida(null);
    ajustarTab(programa, coh === cohorteActual);
  };

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

  // v_mr_demografia (formato largo) → filas de una dimensión, con etiqueta y orden fijo
  const dimensionMr = (dim: string) => {
    const filas = datos.mrDemografia.filter((d) => d.dimension === dim);
    const orden = ORDEN_MR[dim];
    if (orden) filas.sort((a, b) => orden.indexOf(a.categoria) - orden.indexOf(b.categoria));
    return filas.map((d) => ({ ...d, etiqueta: ETIQUETA_MR[d.categoria] ?? d.categoria }));
  };
  const totalMrConDatos = datos.mrDemografia
    .filter((d) => d.dimension === 'emprendimiento')
    .reduce((s, d) => s + d.total, 0);

  const emprendimientoOrdenado = ORDEN_SITUACION.map((s) => {
    const empSource = programa === 'jc' && ciudadElegida ? emprendimientoPorCiudad : datos.emprendimiento;
    return {
      nombre: ETIQUETA_SITUACION[s],
      total: empSource.find((e) => e.situacion === s)?.total ?? 0,
      color: COLOR_SITUACION[s],
    };
  });

  const empVsCursos = ORDEN_SITUACION.map((s) => {
    const fila = datos.empVsCursos.find((e) => e.situacion === s);
    return {
      etiqueta: ETIQUETA_SITUACION[s].replace('Emprendimiento ', '').replace('Tiene una ', ''),
      cursos: fila ? Number(fila.prom_cursos_completados) : 0,
    };
  });

  return (
    <>
      <Hero tema={programa} />
      <BackgroundPaths tema={programa} />
      {/* tema-mr activa la paleta naranja de Mujeres ROFÉ en todo el panel */}
      <div
        id="panel"
        className={`max-w-[1600px] mx-auto px-4 py-8 scroll-mt-20 ${programa === 'mr' ? 'tema-mr' : ''}`}
      >
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
        {/* Selector de ciudad — solo JC y solo cohorte actual: grupo_ciudad viene de la BD de
            monitorias, que únicamente cubre a los participantes del año en curso. */}
        {programa === 'jc' && esActual && ciudades.length > 0 && (
          <div className="flex gap-1 tarjeta-glass p-1 flex-wrap">
            <button
              onClick={() => setCiudadElegida(null)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                ciudadElegida === null
                  ? 'pill-metal pill-metal-amarillo'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todas
            </button>
            {ciudades.map((ciudad) => (
              <button
                key={ciudad}
                onClick={() => setCiudadElegida(ciudad)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  ciudadElegida === ciudad
                    ? 'pill-metal pill-metal-naranja'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {ETIQUETA_GRUPO[ciudad] ?? ciudad}
              </button>
            ))}
          </div>
        )}
        {/* Tabs del programa/cohorte activos */}
        <nav className="flex gap-1 tarjeta-glass p-1 flex-wrap">
          {tabsDisponibles(programa, esActual).map((t) => (
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
            {esActual && kpis.ingresados !== null ? (
              <Kpi
                titulo={`Ingresados ${NOMBRE_PROGRAMA[programa]}`}
                valor={String(kpis.ingresados)}
                detalle={`Cohorte ${cohorte} completa: ${kpis.activos} activos + ${kpis.retirados} retirados (sin perfiles de prueba ni retiros institucionales)`}
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
          {/* Estado de la cohorte — desglose canónico en 4 estados accionables. Toggle entre
              MATRÍCULAS (inscripciones, de aprobacion_cursos) y ESTUDIANTES (personas únicas, de
              v_cohorte_estudiantes). Solo cohorte actual sin filtro de ciudad; auto-adaptable. */}
          {kpis.esCanonico && kpis.estado && (
            <Seccion
              titulo="Estado de la cohorte"
              nota={
                unidadEstado === 'matriculas'
                  ? `Desglose de las ${kpis.estado.total.toLocaleString('es-CO')} matrículas (inscripciones) de la cohorte completa — una persona cuenta en cada curso. ${NOMBRE_PROGRAMA[programa]} · ${cohorte}. Se aprueba con avance > 80%.`
                  : kpis.estadoEst
                    ? `Desglose de los ${kpis.estadoEst.total.toLocaleString('es-CO')} estudiantes (personas únicas) según su avance promedio en la cohorte. ${NOMBRE_PROGRAMA[programa]} · ${cohorte}. En promedio cada uno ha aprobado ${kpis.estadoEst.promAprobados ?? '—'} cursos.`
                    : 'Sin datos por estudiante para esta cohorte.'
              }
            >
              {/* Toggle matrículas / estudiantes */}
              <div className="flex gap-1 tarjeta-glass p-1 w-fit mb-4">
                {([['matriculas', 'Por matrículas'], ['estudiantes', 'Por estudiantes']] as const).map(
                  ([u, txt]) => (
                    <button
                      key={u}
                      onClick={() => setUnidadEstado(u)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        unidadEstado === u
                          ? programa === 'mr'
                            ? 'pill-metal pill-metal-rosa'
                            : 'pill-metal pill-metal-azul'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {txt}
                    </button>
                  ),
                )}
              </div>
              {unidadEstado === 'matriculas' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <EstadoStat etiqueta="Aprobadas" valor={kpis.estado.aprobadas} total={kpis.estado.total} color={C.verde} detalle="avance > 80%" />
                  <EstadoStat etiqueta="En progreso" valor={kpis.estado.enProgreso} total={kpis.estado.total} color={C.amarillo} detalle="avance 26–80%" />
                  <EstadoStat etiqueta="En riesgo" valor={kpis.estado.enRiesgo} total={kpis.estado.total} color={C.naranja} detalle="avance 0–25%" />
                  <EstadoStat etiqueta="Retiradas sin aprobar" valor={kpis.estado.retiradas} total={kpis.estado.total} color={C.rojo} detalle="inhabilitadas < 80%" />
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
          {/* El desglose de aprobación (aprobados/retirados) sale de aprobacion_cursos, que no
              trae grupo_ciudad. Con una ciudad elegida caemos al gráfico de completación, que
              sí está desglosado por ciudad. */}
          {esActual && aprobacionProg.length > 0 && !ciudadElegida ? (
            <Seccion
              titulo={`Avance de la cohorte por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}`}
              nota={`Cada barra suma la cohorte completa que cursó (${kpis.ingresados ?? '—'} ingresados en los cursos base): aprobó = avance > 80%; quien aprobó antes de retirarse conserva su logro.`}
            >
              <GraficoAprobacion
                datos={aprobacionProg.map((a) => ({
                  curso: a.curso,
                  aprobados: a.aprobados,
                  en_curso: (a.banda_0_25 ?? 0) + (a.banda_26_80 ?? 0),
                  aprobados_retirados: a.aprobados_retirados,
                  retirados: a.retirados,
                }))}
              />
            </Seccion>
          ) : (
            <Seccion
              titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}${ciudadElegida ? ` (${ETIQUETA_GRUPO[ciudadElegida]})` : ''}`}
              nota={ciudadElegida ? `Completado = avance > 80%. Datos filtrados para ${ETIQUETA_GRUPO[ciudadElegida]}.` : "Completado = avance > 80% (mismo criterio del panel de aprobación)."}
            >
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
        </>
      )}

      {tab === 'Cursos' && esActual && aprobacionProg.length > 0 && (
        <>
          {/* Toggle matrículas / estudiantes — comparte estado con el Resumen */}
          <div className="flex gap-1 tarjeta-glass p-1 w-fit mb-4">
            {([['matriculas', 'Por matrículas'], ['estudiantes', 'Por estudiantes']] as const).map(
              ([u, txt]) => (
                <button
                  key={u}
                  onClick={() => setUnidadEstado(u)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    unidadEstado === u
                      ? programa === 'mr'
                        ? 'pill-metal pill-metal-rosa'
                        : 'pill-metal pill-metal-azul'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {txt}
                </button>
              ),
            )}
          </div>

          {unidadEstado === 'matriculas' ? (
            <>
              <Seccion
                titulo={`Avance de la cohorte por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}`}
                nota={`Cada barra suma la cohorte completa que cursó: aprobó = avance > 80%; quien aprobó antes de retirarse conserva su logro.`}
              >
                <GraficoAprobacion
                  datos={aprobacionProg.map((a) => ({
                    curso: a.curso,
                    aprobados: a.aprobados,
                    en_curso: (a.banda_0_25 ?? 0) + (a.banda_26_80 ?? 0),
                    aprobados_retirados: a.aprobados_retirados,
                    retirados: a.retirados,
                  }))}
                />
              </Seccion>
              <Seccion titulo="Detalle por curso (cohorte completa)">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-4">Curso</th>
                        <th className="py-2 pr-4 text-right">Cursaron</th>
                        <th className="py-2 pr-4 text-right">Aprobaron</th>
                        <th className="py-2 pr-4 text-right">En curso</th>
                        <th className="py-2 pr-4 text-right">Retirados sin aprobar</th>
                        <th className="py-2 pr-4 text-right">% Aprobados</th>
                        <th className="py-2 text-right">Avance promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aprobacionProg.map((a) => (
                        <tr key={a.curso} className="border-b border-slate-100">
                          <td className="py-2 pr-4">{a.curso}</td>
                          <td className="py-2 pr-4 text-right">{a.cursaron}</td>
                          <td className="py-2 pr-4 text-right">
                            {a.aprobados_total ?? a.aprobados + a.aprobados_retirados}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {(a.banda_0_25 ?? 0) + (a.banda_26_80 ?? 0)}
                          </td>
                          <td className="py-2 pr-4 text-right">{a.retirados}</td>
                          <td className="py-2 pr-4 text-right font-medium">{a.pct_aprobados ?? '—'}%</td>
                          <td className="py-2 text-right">{a.promedio ?? '—'}%</td>
                        </tr>
                      ))}
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

      {tab === 'Cursos' && !(esActual && aprobacionProg.length > 0) && (
        <>
          <Seccion
            titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}${ciudadElegida ? ` (${ETIQUETA_GRUPO[ciudadElegida]})` : ''}`}
            nota={ciudadElegida ? `Completado = avance > 80%. Datos filtrados para ${ETIQUETA_GRUPO[ciudadElegida]}.` : "Completado = avance > 80%."}
          >
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
          </Seccion>
        </>
      )}

      {tab === 'Historial' && (
        <>
          <Seccion
            titulo={`Evolución de matrículas — ${NOMBRE_PROGRAMA[programa]}${ciudadElegida ? ` · ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : ''}`}
            nota={
              ciudadElegida
                ? `Serie de ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida} desde el 14 de julio de 2026, cuando empezamos a guardar el snapshot diario por ciudad. El histórico anterior (desde el 26 de junio) es nacional: nunca guardó la ciudad, así que no se puede desglosar hacia atrás.`
                : 'Serie diaria desde el 26 de junio (histórico del dashboard + sync diario de Q10). Las matrículas de cursos terminados bajan cuando Q10 archiva estudiantes.'
            }
          >
            <GraficoHistorial
              historial={(ciudadElegida ? historialPorCiudad : historialProg).map((h) => ({
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
              ciudadElegida
                ? `Promedio de avance (%) por curso en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}. La serie por ciudad arranca el 14 de julio de 2026 y crece un punto por día.`
                : 'Promedio de avance (%) por curso a lo largo del tiempo.'
            }
          >
            <GraficoHistorial
              historial={(ciudadElegida ? historialPorCiudad : historialProg).map((h) => ({
                fecha: h.fecha,
                curso: h.curso,
                valor: h.promedio_avance !== null ? Number(h.promedio_avance) : null,
              }))}
              metrica="promedio"
              nombreMetrica="Avance promedio %"
            />
          </Seccion>
        </>
      )}

      {tab === 'Emprendimiento' && programa === 'jc' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Seccion titulo="Situación frente al emprendimiento" nota="Encuesta de diagnóstico Jóvenes creaTIvos (696 respuestas).">
            <GraficoEmprendimiento datos={emprendimientoOrdenado} />
          </Seccion>
          <Seccion titulo="Cursos completados según situación" nota="Promedio de cursos completados por participante en cada grupo.">
            <GraficoBarras datos={empVsCursos} dataKey="cursos" nombre="Cursos completados (prom.)" color={C.verde} dominioMax={9} />
            <p className="text-xs text-slate-400 mt-2">
              Los cuatro grupos avanzan de forma pareja: tener (o no) un emprendimiento no cambia el ritmo en la ruta de cursos.
            </p>
          </Seccion>
        </div>
      )}

      {tab === 'Demografía' && programa === 'mr' && (
        <>
          <p className="text-xs text-slate-400 mb-4">
            Fuente: BD-Mujeres ROFÉ — {totalMrConDatos} mujeres con datos sociodemográficos
            (cubre el 99% de la cohorte 2026; solo agregados, nunca datos individuales).
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <Seccion titulo="Estado civil">
              <GraficoEmprendimiento
                datos={dimensionMr('estado_civil').map((d, i) => ({
                  nombre: d.etiqueta,
                  total: d.total,
                  color: [C.naranja, C.azul2, C.verde, C.amarillo, C.rojo][i % 5],
                }))}
              />
            </Seccion>
            <Seccion titulo="Nivel de estudios">
              <GraficoBarras
                datos={dimensionMr('nivel_estudio')}
                dataKey="total"
                nombre="Mujeres"
                color={C.azul2}
              />
            </Seccion>
            <Seccion titulo="Tipo de vivienda">
              <GraficoEmprendimiento
                datos={dimensionMr('tipo_vivienda').map((d, i) => ({
                  nombre: d.etiqueta,
                  total: d.total,
                  color: [C.azul2, C.amarillo, C.verde][i % 3],
                }))}
              />
            </Seccion>
            <Seccion titulo="Estrato socioeconómico">
              <GraficoBarras
                datos={dimensionMr('estrato').map((d) => ({ ...d, etiqueta: `Estrato ${d.etiqueta}` }))}
                dataKey="total"
                nombre="Mujeres"
                color={C.verde}
              />
            </Seccion>
            <Seccion titulo="Distribución de edad" nota="En rangos — nunca edades individuales.">
              <GraficoBarras
                datos={dimensionMr('edad_rango')}
                dataKey="total"
                nombre="Mujeres"
                color={C.naranja}
              />
            </Seccion>
            <Seccion
              titulo="Emprendimiento"
              nota="Con emprendimiento = registra un emprendimiento con nombre en la BD."
            >
              <GraficoEmprendimiento
                datos={dimensionMr('emprendimiento').map((d) => ({
                  nombre: d.etiqueta,
                  total: d.total,
                  color: d.categoria === 'con_emprendimiento' ? C.verde : C.amarillo,
                }))}
              />
            </Seccion>
          </div>
        </>
      )}

      {tab === 'Demografía' && programa === 'jc' && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <Seccion
              titulo={ciudadElegida ? `Participantes en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : "Participantes por grupo"}
              nota={ciudadElegida ? `Desglose de participantes en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}.` : "Grupos operativos por ciudad — Jóvenes creaTIvos."}>
              <GraficoBarras
                datos={participantesFiltrados.map((d) => ({
                  etiqueta: ciudadElegida ? ETIQUETA_GRUPO[d.grupo_ciudad] ?? d.grupo_ciudad : ETIQUETA_GRUPO[d.grupo_ciudad] ?? d.grupo_ciudad,
                  total: d.total,
                }))}
                dataKey="total"
                nombre="Participantes"
                color={C.azul2}
                rotarEtiquetas
              />
            </Seccion>
            <Seccion titulo={ciudadElegida ? `Género en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : "Género por grupo"}>
              <GraficoDemografia
                datos={participantesFiltrados.map((d) => ({
                  ...d,
                  grupo_ciudad: ETIQUETA_GRUPO[d.grupo_ciudad] ?? d.grupo_ciudad,
                }))}
              />
            </Seccion>
          </div>
          <Seccion titulo="Distribución de edad" nota="En rangos — nunca edades individuales.">
            <GraficoBarras
              datos={datos.edades.map((e) => ({ etiqueta: e.rango, total: e.total }))}
              dataKey="total"
              nombre="Participantes"
              color={C.naranja}
            />
          </Seccion>
        </>
      )}

      {tab === 'Emoflow' && programa === 'jc' && (
        <>
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
                  detalle={ciudadElegida ? undefined : `${(datos.emoflowResumen?.[0]?.con_match_supabase ?? 0).toLocaleString('es-CO')} cruzan con nuestra cohorte`}
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
      </div>
    </>
  );
}
