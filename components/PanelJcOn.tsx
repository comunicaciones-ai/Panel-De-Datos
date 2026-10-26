'use client';

// Panel JC-ON (Jóvenes creaTIvos – Transición a la Vida Productiva). Tercer programa del panel,
// con tema verde. No usa Q10: lee solo las vistas agregadas del esquema `jcon` (lib/jcon.ts) y
// mide el avance con la asistencia de Zoom, que se carga cuando arrancan las clases (02/11/2026).
// Filtros de año JC y ciudad (igual que JC): cada vista ya trae la fila de cada combinación.
// Conteos por año, horario y ciudad van completos (también 2019–2021, grupos pequeños). Género,
// edad y asistencia de grupos < 5 llegan en null desde Supabase y se muestran como "< 5".

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ETIQUETA_GRUPO } from '@/lib/api';
import { cargarJcon, DatosJcon, ETIQUETA_HORARIO, JconDemografia } from '@/lib/jcon';
import { C, GraficoBarras } from '@/components/graficos';
import { Kpi, NoAplica, Seccion } from '@/components/ui';

type TabJcon = 'Resumen' | 'Por año' | 'Asistencia';
const TABS_JCON: TabJcon[] = ['Resumen', 'Por año', 'Asistencia'];

const VERDE_OSCURO = '#3f6b2c';
const ORDEN_EDAD = ['< 18', '18-20', '21-22', '23-24', '25+'];
const ETIQUETA_GENERO: Record<string, string> = { Femenino: 'Mujeres', Masculino: 'Hombres', Otros: 'Otras identidades' };
const NOTA_PRIVACIDAD = '"< 5" = género, edad o asistencia de un grupo muy pequeño, oculto por privacidad.';
const etiquetaAnio = (a: string) => (a === 'todos' ? 'Todos' : a);

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
  const [anio, setAnio] = useState('todos');
  const [ciudad, setCiudad] = useState('todas');

  useEffect(() => {
    cargarJcon().then(setDatos).catch((e) => setError(String(e)));
  }, []);

  const cohorte = datos?.resumen[0]?.cohorte_jcon;
  const enFiltro = <T extends { cohorte_jcon: string; ciudad_f: string; anio_f: string }>(filas: T[]) =>
    filas.filter((f) => f.cohorte_jcon === cohorte && f.ciudad_f === ciudad && f.anio_f === anio);

  const total = datos?.resumen.find((r) => r.cohorte_jcon === cohorte && r.ciudad_f === 'todas' && r.anio_f === 'todos');
  const resumen = datos ? enFiltro(datos.resumen)[0] : undefined;
  const demografia = useMemo(() => (datos ? enFiltro(datos.demografia) : []), [datos, cohorte, ciudad, anio]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opciones de filtro: todos los años y ciudades con al menos un estudiante.
  const opcionesAnio = useMemo(() => {
    if (!datos) return [];
    const anios = datos.resumen
      .filter((r) => r.cohorte_jcon === cohorte && r.ciudad_f === 'todas' && r.anio_f !== 'todos' && r.inscritos != null)
      .map((r) => r.anio_f)
      .sort();
    return ['todos', ...anios];
  }, [datos, cohorte]);
  const opcionesCiudad = useMemo(() => {
    if (!datos) return [];
    return datos.resumen
      .filter((r) => r.cohorte_jcon === cohorte && r.anio_f === 'todos' && r.ciudad_f !== 'todas' && r.inscritos != null)
      .sort((a, b) => (b.inscritos ?? 0) - (a.inscritos ?? 0))
      .map((r) => r.ciudad_f);
  }, [datos, cohorte]);
  const inscritosEn = (c: string, a: string) =>
    datos?.resumen.find((r) => r.cohorte_jcon === cohorte && r.ciudad_f === c && r.anio_f === a)?.inscritos;

  const clases = useMemo(
    () =>
      datos
        ? enFiltro(datos.asistenciaClase).map((c) => ({
            etiqueta: `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}${c.horario ? (c.horario === 'manana' ? ' AM' : ' PM') : ''}`,
            pct: c.inscritos && c.asistentes != null ? (100 * c.asistentes) / c.inscritos : null,
          }))
        : [],
    [datos, cohorte, ciudad, anio], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const asistenciaGrupo = (dimension: string) =>
    (datos ? enFiltro(datos.asistenciaGrupo) : [])
      .filter((g) => g.dimension === dimension)
      .sort((a, b) => ordenar(dimension, a.categoria, b.categoria))
      .map((g) => {
        const nombre = etiquetaCategoria(dimension, g.categoria);
        return { etiqueta: g.pct_asistencia == null ? `${nombre} (< 5)` : nombre, pct: g.pct_asistencia };
      });

  const nombreFiltro = [
    anio !== 'todos' ? `JC ${etiquetaAnio(anio)}` : null,
    ciudad !== 'todas' ? ETIQUETA_GRUPO[ciudad] ?? ciudad : null,
  ].filter(Boolean).join(' · ');
  const sufijo = nombreFiltro ? ` — ${nombreFiltro}` : '';
  const anioPuntual = /^\d{4}$/.test(anio);
  const sinClases = !total || total.clases === 0;
  const avisoSinClases = (
    <NoAplica
      suave
      motivo="las clases de JC-ON aún no se han registrado. La asistencia se medirá con los reportes de Zoom de cada sesión desde el inicio del programa (2 de noviembre de 2026)."
    />
  );

  const barras = (dimension: string, titulo: string, nota: string, color = C.verde, porTotal = false) => {
    const { datos: d, base } = serie(demografia, dimension, porTotal);
    return (
      <Seccion titulo={`${titulo}${sufijo}`} nota={`${nota} Base: ${base} estudiantes con el dato. ${NOTA_PRIVACIDAD}`}>
        {d.length ? (
          <GraficoBarras datos={d} dataKey="total" nombre="Estudiantes" color={color} rotarEtiquetas={d.length > 5} />
        ) : (
          <NoAplica suave motivo="todavía no hay estudiantes con este dato." />
        )}
      </Seccion>
    );
  };

  // Tarjetas demográficas (en Resumen; la pestaña Demografía se quitó 2026-10-26). Se omite la
  // dimensión que ya fija el filtro.
  const tarjetasDemografia = (
    <>
      <div className="grid lg:grid-cols-2 gap-x-5">
        {barras('genero', 'Género', 'Identidad de género registrada en JC.', C.naranja)}
        {barras('edad_rango', 'Distribución de edad', 'Edad aproximada al 02/11/2026 (margen ±1 año).', C.azul2)}
      </div>
      {ciudad === 'todas' && barras('ciudad', 'Ciudad (sede JC)', 'Sede de Jóvenes creaTIvos en la que cursó cada estudiante.', C.verde, true)}
    </>
  );

  return (
    <div id="panel" className="max-w-[1600px] mx-auto px-4 py-8 scroll-mt-20 tema-jcon">
      {total?.actualizado && (
        <p className="text-xs text-slate-400 mb-3">
          Lista de estudiantes actualizada el {new Date(total.actualizado).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {selectorPrograma}
        {/* Año en que cursaron JC (como el selector de cohorte de JC) */}
        {opcionesAnio.length > 1 && (
          <div className="flex gap-1 tarjeta-glass p-1 flex-wrap">
            {opcionesAnio.map((a) => (
              <button
                key={a}
                onClick={() => setAnio(a)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  anio === a ? 'pill-metal pill-metal-verde' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {etiquetaAnio(a)}
              </button>
            ))}
          </div>
        )}
        {/* Ciudad (sede JC) */}
        {opcionesCiudad.length > 0 && (
          <div className="flex gap-1 tarjeta-glass p-1 flex-wrap">
            {['todas', ...opcionesCiudad].map((c) => {
              const n = inscritosEn(c, anio);
              return (
                <button
                  key={c}
                  onClick={() => setCiudad(c)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    ciudad === c ? 'pill-metal pill-metal-naranja' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {c === 'todas' ? 'Todas' : ETIQUETA_GRUPO[c] ?? c}
                  <span className="ml-1 text-xs opacity-75">{n != null ? n : '< 5'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <nav className="flex gap-1 tarjeta-glass p-1 flex-wrap mb-5 w-fit">
        {TABS_JCON.map((t) => (
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

      {datos && !total && <NoAplica suave motivo="todavía no hay estudiantes de JC-ON cargados." />}

      {total && !resumen && (
        <NoAplica suave motivo={`no hay estudiantes de JC-ON en ${nombreFiltro || 'esta selección'}. Prueba con otro año o ciudad.`} />
      )}

      {resumen?.inscritos != null && tab === 'Resumen' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            <Kpi titulo="Estudiantes JC-ON" valor={String(resumen.inscritos)} detalle={nombreFiltro || `Cohorte ${resumen.cohorte_jcon} · egresados JC`} />
            <Kpi titulo="Grupo mañana" valor={resumen.manana != null ? String(resumen.manana) : '< 5'} detalle="10:00 a 12:00" />
            <Kpi titulo="Grupo tarde" valor={resumen.tarde != null ? String(resumen.tarde) : '< 5'} detalle="2:00 a 4:00 p. m." />
            <Kpi titulo="Promociones JC" valor={String(resumen.anios_jc)} detalle="años de egreso distintos" />
            <Kpi titulo="Clases realizadas" valor={String(resumen.clases)} detalle="sesiones Zoom registradas" />
            <Kpi
              titulo="Asistencia promedio"
              valor={resumen.asistencia_promedio_pct != null ? `${resumen.asistencia_promedio_pct}%` : '—'}
              detalle={sinClases ? 'se mide desde el 02/11 con Zoom' : 'promedio por estudiante'}
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-x-5">
            {!anioPuntual && barras('anio_jc', 'Estudiantes por año en que cursaron JC', 'Promoción de Jóvenes creaTIvos de la que viene cada estudiante.')}
            {barras('horario', 'Estudiantes por horario', 'Grupo de clase asignado.', VERDE_OSCURO)}
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Género, edad y ciudad se toman del registro de cada estudiante cuando cursó JC
            {resumen.con_demografia != null ? ` (${resumen.con_demografia} de ${resumen.inscritos} con datos completos)` : ''}.
            La edad es aproximada al inicio del programa (02/11/2026).
          </p>
          {tarjetasDemografia}
        </>
      )}

      {resumen?.inscritos != null && tab === 'Por año' && (
        <>
          {!anioPuntual && barras('anio_jc', 'Estudiantes JC-ON por promoción de JC', 'Año en que cada estudiante cursó Jóvenes creaTIvos.')}
          <Seccion
            titulo={`Asistencia promedio por promoción de JC${sufijo}`}
            nota={`% de las clases de su horario a las que asistió cada estudiante, promediado por año de egreso. ${NOTA_PRIVACIDAD}`}
          >
            {sinClases ? avisoSinClases : (
              <GraficoBarras datos={asistenciaGrupo('anio_jc')} dataKey="pct" nombre="% asistencia" color={C.verde} dominioMax={100} sufijoEtiqueta="%" decimalesEtiqueta={1} />
            )}
          </Seccion>
        </>
      )}

      {resumen?.inscritos != null && tab === 'Asistencia' && (
        sinClases ? (
          <Seccion titulo="Asistencia a clases (Zoom)">{avisoSinClases}</Seccion>
        ) : (
          <>
            <Seccion titulo={`Asistencia por clase${sufijo}`} nota="Asistentes ÷ estudiantes del horario de la clase. Fuente: reportes de participantes de Zoom.">
              <GraficoBarras datos={clases} dataKey="pct" nombre="% asistencia" color={C.verde} dominioMax={100} sufijoEtiqueta="%" decimalesEtiqueta={0} rotarEtiquetas={clases.length > 8} />
            </Seccion>
            <div className="grid lg:grid-cols-2 gap-x-5">
              {(['horario', 'genero', 'ciudad'] as const)
                .filter((dim) => dim !== 'ciudad' || ciudad === 'todas')
                .map((dim) => (
                  <Seccion
                    key={dim}
                    titulo={`Asistencia promedio por ${dim === 'horario' ? 'horario' : dim === 'genero' ? 'género' : 'ciudad'}${sufijo}`}
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
