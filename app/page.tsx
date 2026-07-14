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

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5 }}
      className="tarjeta-glass p-4"
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="text-3xl font-bold kpi-valor mt-1">{valor}</p>
      {detalle && <p className="text-xs text-slate-400 mt-1">{detalle}</p>}
    </motion.div>
  );
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="tarjeta-glass p-5 mb-6"
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

  // Aprobación canónica de la cohorte (cursaron = activos + retirados) por programa
  const aprobacionProg = useMemo(
    () =>
      datos
        ? datos.aprobacion.filter((a) => a.programa === programa && a.cohorte === cohorte)
        : [],
    [datos, programa, cohorte],
  );

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

    return {
      participantes,
      matriculas,
      pctCompletadas: matriculas ? Math.round((100 * completadas) / matriculas) : 0,
      promedio,
      edadProm,
      empMarcha,
      ingresados: hayFiltroCiudad ? null : ing?.ingresados ?? null,
      activos: ing?.activos ?? null,
      retirados: ing?.retirados ?? null,
    };
  }, [datos, programa, cohorte, ciudadElegida, participantesFiltrados]);

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
        <div className="max-w-6xl mx-auto px-4 py-8">
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
        <div className="max-w-6xl mx-auto px-4 py-8 animate-pulse space-y-4">
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
        className={`max-w-6xl mx-auto px-4 py-8 scroll-mt-20 ${programa === 'mr' ? 'tema-mr' : ''}`}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
              detalle={`${kpis.pctCompletadas}% completadas (>80% avance)`}
            />
            <Kpi titulo="Avance promedio" valor={kpis.promedio} detalle="Sobre todas las matrículas" />
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Kpi
                  titulo={ciudadElegida ? `Estudiantes en ${ETIQUETA_GRUPO[ciudadElegida] ?? ciudadElegida}` : 'Estudiantes con Emoflow'}
                  valor={emoflowKpis.participantes.toLocaleString('es-CO')}
                  detalle={ciudadElegida ? undefined : 'de 777 activos (97%)'}
                />
                <Kpi
                  titulo="Ingresos promedio"
                  valor={emoflowKpis.promedio.toFixed(1)}
                  detalle={`mediana ${emoflowKpis.mediana}`}
                />
                <Kpi
                  titulo="Activos últimos 7 días"
                  valor={emoflowKpis.participantes ? `${Math.round((emoflowKpis.activos7 / emoflowKpis.participantes) * 100)}%` : '—'}
                  detalle={`${emoflowKpis.activos7.toLocaleString('es-CO')} estudiantes`}
                />
                <Kpi
                  titulo="Sin entrar hace +30 días"
                  valor={emoflowKpis.participantes ? `${Math.round((emoflowKpis.inactivos30 / emoflowKpis.participantes) * 100)}%` : '—'}
                  detalle={`${emoflowKpis.inactivos30.toLocaleString('es-CO')} estudiantes`}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Seccion
                  titulo="Distribución de uso"
                  nota="Ingresos = veces que el estudiante entró al sistema (acumulado). Cubre 757 de los 777 activos (97%).">
                  <GraficoBarras
                    datos={emoflowBandas}
                    dataKey="participantes"
                    nombre="Estudiantes"
                    color={C.azul2}
                  />
                </Seccion>

                <Seccion
                  titulo="¿El que más entra, aprueba más?"
                  nota="% de aprobación de cada banda de uso.">
                  <GraficoBarras
                    datos={emoflowBandas}
                    dataKey="pct_aprobacion"
                    nombre="Aprobación %"
                    color={C.verde}
                    dominioMax={100}
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    La relación es real pero suave: quienes menos entran aprueban ~82% y quienes más
                    entran ~88%. Sirve para detectar el extremo bajo, no como predictor fino.
                  </p>
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
