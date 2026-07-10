'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  cargarTodo,
  Datos,
  ETIQUETA_SITUACION,
  NOMBRE_PROGRAMA,
  ORDEN_SITUACION,
} from '@/lib/api';
import {
  C,
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
type Tab = 'Resumen' | 'Cursos' | 'Historial' | 'Emprendimiento' | 'Demografía';

const COHORTE_ACTUAL = '2026';

// Emprendimiento y Demografía provienen de la BD de monitorias JC de la cohorte
// actual; el Historial (serie diaria) también arranca en la cohorte 2026.
// Cohortes pasadas (2023-2025, importadas de Q10): Resumen + Cursos.
function tabsDisponibles(programa: Programa, cohorte: string): Tab[] {
  if (cohorte !== COHORTE_ACTUAL) return ['Resumen', 'Cursos'];
  return programa === 'jc'
    ? ['Resumen', 'Cursos', 'Historial', 'Emprendimiento', 'Demografía']
    : ['Resumen', 'Cursos', 'Historial'];
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
      <p className="text-3xl font-bold text-rofe-azul mt-1">{valor}</p>
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
  const [cohorte, setCohorte] = useState<string>(COHORTE_ACTUAL);
  const [tab, setTab] = useState<Tab>('Resumen');

  useEffect(() => {
    cargarTodo().then(setDatos).catch((e) => setError(String(e)));
  }, []);

  const cohortes = useMemo(
    () =>
      datos
        ? Array.from(new Set(datos.cursos.map((c) => c.cohorte))).sort().reverse()
        : [COHORTE_ACTUAL],
    [datos],
  );

  const cursosProg = useMemo(
    () =>
      datos
        ? datos.cursos.filter((c) => c.programa === programa && c.cohorte === cohorte)
        : [],
    [datos, programa, cohorte],
  );

  const historialProg = useMemo(
    () => (datos ? datos.historial.filter((h) => h.programa === programa) : []),
    [datos, programa],
  );

  const kpis = useMemo(() => {
    if (!datos) return null;
    const ps = datos.programas.find(
      (p) => p.programa === programa && p.cohorte === cohorte,
    );
    const co = datos.cohorte.find((c) => c.cohorte === cohorte);
    return {
      participantes: ps?.participantes ?? 0,
      matriculas: ps?.matriculas ?? 0,
      pctCompletadas: ps?.matriculas
        ? Math.round((100 * ps.completadas) / ps.matriculas)
        : 0,
      promedio: ps?.promedio_avance ? `${ps.promedio_avance}%` : '—',
      edadProm: co?.edad_promedio ? Number(co.edad_promedio).toFixed(1) : '—',
      empMarcha: datos.emprendimiento.find((e) => e.situacion === 'en_marcha')?.total ?? 0,
    };
  }, [datos, programa, cohorte]);

  const ajustarTab = (p: Programa, coh: string) => {
    if (!tabsDisponibles(p, coh).includes(tab)) setTab('Resumen');
  };

  const cambiarPrograma = (p: Programa) => {
    setPrograma(p);
    ajustarTab(p, cohorte);
  };

  const cambiarCohorte = (coh: string) => {
    setCohorte(coh);
    ajustarTab(programa, coh);
  };

  if (error)
    return (
      <>
        <Hero />
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
        <Hero />
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

  const emprendimientoOrdenado = ORDEN_SITUACION.map((s) => ({
    nombre: ETIQUETA_SITUACION[s],
    total: datos.emprendimiento.find((e) => e.situacion === s)?.total ?? 0,
    color: COLOR_SITUACION[s],
  }));

  const empVsCursos = ORDEN_SITUACION.map((s) => {
    const fila = datos.empVsCursos.find((e) => e.situacion === s);
    return {
      etiqueta: ETIQUETA_SITUACION[s].replace('Emprendimiento ', '').replace('Tiene una ', ''),
      cursos: fila ? Number(fila.prom_cursos_completados) : 0,
    };
  });

  return (
    <>
      <Hero />
      <BackgroundPaths />
      <div id="panel" className="max-w-6xl mx-auto px-4 py-8 scroll-mt-20">
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
                    ? 'bg-rofe-naranja text-white'
                    : 'bg-rofe-azul text-white'
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
                  ? 'bg-rofe-verde text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {coh}
            </button>
          ))}
        </div>
        {/* Tabs del programa/cohorte activos */}
        <nav className="flex gap-1 tarjeta-glass p-1 flex-wrap">
          {tabsDisponibles(programa, cohorte).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
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
            <Kpi
              titulo={`Participantes ${NOMBRE_PROGRAMA[programa]}`}
              valor={String(kpis.participantes)}
              detalle={
                cohorte === COHORTE_ACTUAL
                  ? `Activos en la cohorte ${cohorte}`
                  : `Cohorte ${cohorte} (histórico Q10 — no incluye retirados)`
              }
            />
            <Kpi
              titulo="Matrículas"
              valor={String(kpis.matriculas)}
              detalle={`${kpis.pctCompletadas}% completadas (>80% avance)`}
            />
            <Kpi titulo="Avance promedio" valor={kpis.promedio} detalle="Sobre todas las matrículas" />
            {programa === 'jc' && cohorte === COHORTE_ACTUAL ? (
              <Kpi titulo="Edad promedio" valor={kpis.edadProm} detalle="Participantes con dato demográfico" />
            ) : (
              <Kpi
                titulo="Cursos"
                valor={String(cursosProg.length)}
                detalle={`Ruta ${NOMBRE_PROGRAMA[programa]} ${cohorte}`}
              />
            )}
          </div>
          <Seccion
            titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}`}
            nota="Completado = avance > 80% (mismo criterio del panel de aprobación)."
          >
            <GraficoCursos datos={cursosProg} />
          </Seccion>
        </>
      )}

      {tab === 'Cursos' && (
        <>
          <Seccion titulo={`Completación por curso — ${NOMBRE_PROGRAMA[programa]} · ${cohorte}`} nota="Completado = avance > 80%.">
            <GraficoCursos datos={cursosProg} />
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
                  {cursosProg.map((c) => (
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
            titulo={`Evolución de matrículas — ${NOMBRE_PROGRAMA[programa]}`}
            nota="Serie diaria desde el 26 de junio (histórico del dashboard + sync diario de Q10). Las matrículas de cursos terminados bajan cuando Q10 archiva estudiantes."
          >
            <GraficoHistorial
              historial={historialProg.map((h) => ({ fecha: h.fecha, curso: h.curso, valor: h.matriculados }))}
              metrica="matriculados"
              nombreMetrica="Matriculados"
            />
          </Seccion>
          <Seccion
            titulo={`Evolución del avance promedio — ${NOMBRE_PROGRAMA[programa]}`}
            nota="Promedio de avance (%) por curso a lo largo del tiempo."
          >
            <GraficoHistorial
              historial={historialProg.map((h) => ({
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

      {tab === 'Demografía' && programa === 'jc' && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <Seccion titulo="Participantes por grupo" nota="Grupos operativos por ciudad — Jóvenes creaTIvos.">
              <GraficoBarras
                datos={datos.demografia.map((d) => ({ etiqueta: d.grupo_ciudad, total: d.total }))}
                dataKey="total"
                nombre="Participantes"
                color={C.azul2}
              />
            </Seccion>
            <Seccion titulo="Género por grupo">
              <GraficoDemografia datos={datos.demografia} />
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
      </div>
    </>
  );
}
