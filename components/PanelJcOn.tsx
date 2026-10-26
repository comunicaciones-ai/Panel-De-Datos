'use client';

// Panel JC-ON (Jóvenes creaTIvos – Transición a la Vida Productiva). Tercer programa del panel,
// con tema verde. No usa Q10: lee solo las vistas agregadas del esquema `jcon` (lib/jcon.ts) y
// mide el avance con la asistencia de Zoom, que se carga cuando arrancan las clases (02/11/2026).
// Grupos < 5 llegan en null desde Supabase y se muestran como "< 5".

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ETIQUETA_GRUPO } from '@/lib/api';
import { cargarJcon, DatosJcon, ETIQUETA_HORARIO, JconDemografia } from '@/lib/jcon';
import { C, GraficoBarras } from '@/components/graficos';
import { Kpi, NoAplica, Seccion } from '@/components/ui';

type TabJcon = 'Resumen' | 'Por año' | 'Demografía' | 'Asistencia';
const TABS_JCON: TabJcon[] = ['Resumen', 'Por año', 'Demografía', 'Asistencia'];

const VERDE_OSCURO = '#3f6b2c';
const ORDEN_EDAD = ['< 18', '18-20', '21-22', '23-24', '25+'];
const ETIQUETA_GENERO: Record<string, string> = { Femenino: 'Mujeres', Masculino: 'Hombres', Otros: 'Otras identidades' };
const NOTA_PRIVACIDAD = '"< 5" = grupo muy pequeño, oculto por privacidad.';

function etiquetaCategoria(dimension: string, categoria: string): string {
  if (dimension === 'ciudad') return ETIQUETA_GRUPO[categoria] ?? categoria;
  if (dimension === 'horario') return ETIQUETA_HORARIO[categoria] ?? categoria;
  if (dimension === 'genero') return ETIQUETA_GENERO[categoria] ?? categoria;
  return categoria;
}

function ordenar(dimension: string, a: string, b: string): number {
  if (dimension === 'edad_rango') return ORDEN_EDAD.indexOf(a) - ORDEN_EDAD.indexOf(b);
  return a.localeCompare(b, 'es');
}

// Filas de una dimensión → datos para GraficoBarras. Las celdas ocultas (< 5) se mantienen en
// el eje con la etiqueta "(< 5)" y barra vacía, para no hacer desaparecer la categoría.
function serie(filas: JconDemografia[], dimension: string, porTotal = false) {
  const datos = filas
    .filter((f) => f.dimension === dimension)
    .sort((a, b) => (porTotal ? (b.total ?? 0) - (a.total ?? 0) : ordenar(dimension, a.categoria, b.categoria)))
    .map((f) => {
      const nombre = etiquetaCategoria(dimension, f.categoria);
      return { etiqueta: f.total == null ? `${nombre} (< 5)` : nombre, total: f.total };
    });
  const base = filas.find((f) => f.dimension === dimension)?.total_dimension ?? 0;
  return { datos, base };
}

export function PanelJcOn({ selectorPrograma }: { selectorPrograma: ReactNode }) {
  const [datos, setDatos] = useState<DatosJcon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabJcon>('Resumen');

  useEffect(() => {
    cargarJcon().then(setDatos).catch((e) => setError(String(e)));
  }, []);

  const resumen = datos?.resumen[0];
  const cohorte = resumen?.cohorte_jcon;
  const demografia = useMemo(
    () => (datos && cohorte ? datos.demografia.filter((d) => d.cohorte_jcon === cohorte) : []),
    [datos, cohorte],
  );
  const clases = useMemo(
    () =>
      datos && cohorte
        ? datos.asistenciaClase
            .filter((c) => c.cohorte_jcon === cohorte)
            .map((c) => ({
              etiqueta: `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}${c.horario ? (c.horario === 'manana' ? ' AM' : ' PM') : ''}`,
              pct: c.inscritos ? (100 * c.asistentes) / c.inscritos : null,
              asistentes: c.asistentes,
              inscritos: c.inscritos,
            }))
        : [],
    [datos, cohorte],
  );
  const asistenciaGrupo = (dimension: string) =>
    (datos?.asistenciaGrupo ?? [])
      .filter((g) => g.cohorte_jcon === cohorte && g.dimension === dimension)
      .sort((a, b) => ordenar(dimension, a.categoria, b.categoria))
      .map((g) => {
        const nombre = etiquetaCategoria(dimension, g.categoria);
        return { etiqueta: g.pct_asistencia == null ? `${nombre} (< 5)` : nombre, pct: g.pct_asistencia };
      });

  const sinClases = !resumen || resumen.clases === 0;
  const avisoSinClases = (
    <NoAplica
      suave
      motivo="las clases de JC-ON aún no se han registrado. La asistencia se medirá con los reportes de Zoom de cada sesión desde el inicio del programa (2 de noviembre de 2026)."
    />
  );

  const barras = (dimension: string, titulo: string, nota: string, color = C.verde, porTotal = false) => {
    const { datos: d, base } = serie(demografia, dimension, porTotal);
    return (
      <Seccion titulo={titulo} nota={`${nota} Base: ${base} estudiantes con el dato. ${NOTA_PRIVACIDAD}`}>
        {d.length ? (
          <GraficoBarras datos={d} dataKey="total" nombre="Estudiantes" color={color} rotarEtiquetas={d.length > 5} />
        ) : (
          <NoAplica suave motivo="todavía no hay estudiantes con este dato." />
        )}
      </Seccion>
    );
  };

  return (
    <div id="panel" className="max-w-[1600px] mx-auto px-4 py-8 scroll-mt-20 tema-jcon">
      {resumen?.actualizado && (
        <p className="text-xs text-slate-400 mb-3">
          Lista de estudiantes actualizada el {new Date(resumen.actualizado).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {selectorPrograma}
        <nav className="flex gap-1 tarjeta-glass p-1 flex-wrap">
          {TABS_JCON.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'pill-metal pill-metal-verde' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="bg-rofe-rojo/10 border border-rofe-rojo text-rofe-rojo rounded-xl p-6">
          <p className="font-bold">No se pudieron cargar los datos de JC-ON.</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {!error && !datos && (
        <div className="animate-pulse grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-[#e2efd9] rounded-xl" />
          ))}
        </div>
      )}

      {datos && !resumen && <NoAplica suave motivo="todavía no hay estudiantes de JC-ON cargados." />}

      {resumen && tab === 'Resumen' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            <Kpi titulo="Estudiantes JC-ON" valor={String(resumen.inscritos)} detalle={`Cohorte ${resumen.cohorte_jcon} · egresados JC`} />
            <Kpi titulo="Grupo mañana" valor={String(resumen.manana)} detalle="10:00 a 12:00" />
            <Kpi titulo="Grupo tarde" valor={String(resumen.tarde)} detalle="2:00 a 4:00 p. m." />
            <Kpi titulo="Promociones JC" valor={String(resumen.anios_jc)} detalle="años de egreso distintos" />
            <Kpi titulo="Clases realizadas" valor={String(resumen.clases)} detalle="sesiones Zoom registradas" />
            <Kpi
              titulo="Asistencia promedio"
              valor={resumen.asistencia_promedio_pct != null ? `${resumen.asistencia_promedio_pct}%` : '—'}
              detalle={sinClases ? 'se mide desde el 02/11 con Zoom' : 'promedio por estudiante'}
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-x-5">
            {barras('anio_jc', 'Estudiantes por año en que cursaron JC', 'Promoción de Jóvenes creaTIvos de la que viene cada estudiante.')}
            {barras('horario', 'Estudiantes por horario', 'Grupo de clase asignado.', VERDE_OSCURO)}
          </div>
          {resumen.retirados > 0 && (
            <p className="text-xs text-slate-400">{resumen.retirados} estudiante(s) retirado(s) no se cuentan en estas cifras.</p>
          )}
        </>
      )}

      {resumen && tab === 'Por año' && (
        <>
          {barras('anio_jc', 'Estudiantes JC-ON por promoción de JC', 'Año en que cada estudiante cursó Jóvenes creaTIvos.')}
          <Seccion
            titulo="Asistencia promedio por promoción de JC"
            nota={`% de las clases de su horario a las que asistió cada estudiante, promediado por año de egreso. ${NOTA_PRIVACIDAD}`}
          >
            {sinClases ? avisoSinClases : (
              <GraficoBarras datos={asistenciaGrupo('anio_jc')} dataKey="pct" nombre="% asistencia" color={C.verde} dominioMax={100} sufijoEtiqueta="%" decimalesEtiqueta={1} />
            )}
          </Seccion>
        </>
      )}

      {resumen && tab === 'Demografía' && (
        <>
          <p className="text-xs text-slate-400 mb-3">
            Género, edad y ciudad se toman del registro de cada estudiante cuando cursó JC ({resumen.con_demografia} de {resumen.inscritos} con
            datos completos). La edad es aproximada al inicio del programa (02/11/2026).
          </p>
          <div className="grid lg:grid-cols-2 gap-x-5">
            {barras('genero', 'Género', 'Identidad de género registrada en JC.', C.naranja)}
            {barras('edad_rango', 'Distribución de edad', 'Edad aproximada al 02/11/2026 (margen ±1 año).', C.azul2)}
          </div>
          {barras('ciudad', 'Ciudad (sede JC)', 'Sede de Jóvenes creaTIvos en la que cursó cada estudiante.', C.verde, true)}
        </>
      )}

      {resumen && tab === 'Asistencia' && (
        sinClases ? (
          <Seccion titulo="Asistencia a clases (Zoom)">{avisoSinClases}</Seccion>
        ) : (
          <>
            <Seccion titulo="Asistencia por clase" nota="Asistentes ÷ estudiantes del horario de la clase. Fuente: reportes de participantes de Zoom.">
              <GraficoBarras datos={clases} dataKey="pct" nombre="% asistencia" color={C.verde} dominioMax={100} sufijoEtiqueta="%" decimalesEtiqueta={0} rotarEtiquetas={clases.length > 8} />
            </Seccion>
            <div className="grid lg:grid-cols-2 gap-x-5">
              {(['horario', 'genero', 'ciudad'] as const).map((dim) => (
                <Seccion
                  key={dim}
                  titulo={`Asistencia promedio por ${dim === 'horario' ? 'horario' : dim === 'genero' ? 'género' : 'ciudad'}`}
                  nota={NOTA_PRIVACIDAD}
                >
                  <GraficoBarras datos={asistenciaGrupo(dim)} dataKey="pct" nombre="% asistencia" color={dim === 'genero' ? C.naranja : C.verde} dominioMax={100} sufijoEtiqueta="%" decimalesEtiqueta={1} />
                </Seccion>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
