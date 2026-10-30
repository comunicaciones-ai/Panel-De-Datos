'use client';

// Pestañas Asistencia y Tiempo de JC-ON. Asistencia = cuántos entran; Tiempo = cuánto se quedan.
// Un botón de población (Todos / En su sala / Colados) filtra todas las gráficas de las dos pestañas,
// igual que los botones de año JC y ciudad filtran todo el panel. Componen entre sí.
//
// Poblaciones (regla de colados del panel de asistencia, plan-colados 2026-10-12): colado = entró a la
// sala del otro grupo; no cuenta como ausente de su grupo. Cada sesión se guarda por grupo (mañana,
// viernes, 38 / tarde, sábado, 36) para medir cada grupo contra su población; la sala propia de la
// Bienvenida 1 es la del viernes y la de la Bienvenida 2 la del sábado. Sin ocultar grupos < 5
// (excepción de Samuel 2026-10-30, pendiente de ADR en TOC-197).

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ETIQUETA_GRUPO } from '@/lib/api';
import { DatosJcon, ETIQUETA_HORARIO, JconAsistenciaClase, Poblacion } from '@/lib/jcon';
import { C, GraficoBarras } from '@/components/graficos';
import { Kpi, NoAplica, Seccion } from '@/components/ui';

export const SALA_PROPIA: Record<string, string> = { '1': 'manana', '2': 'tarde' };
const numeroDe = (tema: string | null) => (tema ?? '').replace(/^\D*/, '');
export const esBienvenida = (tema: string | null) => /^bienvenida/i.test(tema ?? '');

// Sesiones reales: cada Bienvenida se guarda una vez por grupo, pero es UNA sesión, en la sala de su grupo.
export function contarSesiones(filas: Pick<JconAsistenciaClase, 'tema' | 'horario'>[]): number {
  return filas.filter((c) => !esBienvenida(c.tema) || c.horario === SALA_PROPIA[numeroDe(c.tema)]).length;
}

const VERDE_OSCURO = '#3f6b2c';
const AMBAR = '#B08900'; // amarillo oscuro: el amarillo de la paleta no contrasta como texto
const ORDEN_EDAD = ['< 18', '18-20', '21-22', '23-24', '25+'];
const ETIQUETA_GENERO: Record<string, string> = { Femenino: 'Mujeres', Masculino: 'Hombres', Otros: 'Otras identidades' };
const GRUPO = { manana: 'Mañana (viernes)', tarde: 'Tarde (sábado)' } as const;
const POBLACIONES: { id: Poblacion; etiqueta: string; ayuda: string }[] = [
  { id: 'todos', etiqueta: 'Todos', ayuda: 'todas las entradas: a su sala y a la del otro grupo' },
  { id: 'propia', etiqueta: 'En su sala', ayuda: 'solo quienes entraron a la sala de su grupo' },
  { id: 'colados', etiqueta: 'Colados', ayuda: 'solo quienes entraron a la sala del otro grupo' },
];
const DIMENSIONES = ['anio_jc', 'horario', 'genero', 'ciudad'] as const;
const TITULO_DIM = { anio_jc: 'promoción de JC', horario: 'horario', genero: 'género', ciudad: 'ciudad' } as const;

function etiquetaCategoria(dimension: string, categoria: string): string {
  if (dimension === 'ciudad') return ETIQUETA_GRUPO[categoria] ?? categoria;
  if (dimension === 'horario') return ETIQUETA_HORARIO[categoria] ?? categoria;
  if (dimension === 'genero') return ETIQUETA_GENERO[categoria] ?? categoria;
  return categoria;
}
const ordenar = (dimension: string, a: string, b: string) =>
  dimension === 'edad_rango' ? ORDEN_EDAD.indexOf(a) - ORDEN_EDAD.indexOf(b) : a.localeCompare(b, 'es');
const redondear = (x: number) => Math.round(x * 10) / 10;
const etiquetaCentro = (v: unknown) => (Number(v) ? String(v) : '');

export function JconAsistencia({
  vista,
  datos,
  cohorte,
  ciudad,
  anio,
  sufijo,
}: {
  vista: 'Asistencia' | 'Tiempo';
  datos: DatosJcon;
  cohorte: string;
  ciudad: string;
  anio: string;
  sufijo: string;
}) {
  const [poblacion, setPoblacion] = useState<Poblacion>('todos');
  const [verBienvenida, setVerBienvenida] = useState(true);
  const anioPuntual = /^\d{4}$/.test(anio);
  const delFiltro = <T extends { cohorte_jcon: string; ciudad_f: string; anio_f: string }>(filas: T[]) =>
    filas.filter((f) => f.cohorte_jcon === cohorte && f.ciudad_f === ciudad && f.anio_f === anio);

  // ── Asistencia: cuántos entran ──────────────────────────────────────────────────────────────
  const filasClase = useMemo(
    () => [...delFiltro(datos.asistenciaClase)].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [datos, cohorte, ciudad, anio], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bienvenidas = useMemo(() => {
    const porTema = new Map<string, typeof filasClase>();
    for (const c of filasClase) {
      if (!esBienvenida(c.tema)) continue;
      porTema.set(c.tema!, [...(porTema.get(c.tema!) ?? []), c]);
    }
    return [...porTema.entries()].map(([tema, filas]) => {
      const propiaH = SALA_PROPIA[numeroDe(tema)];
      const propia = filas.find((f) => f.horario === propiaH);
      const colados = filas.find((f) => f.horario && f.horario !== propiaH);
      return {
        nombre: `Bienvenida ${numeroDe(tema)}`,
        dia: `${filas[0].fecha.slice(8, 10)}/${filas[0].fecha.slice(5, 7)}`,
        grupo: propiaH ? GRUPO[propiaH as keyof typeof GRUPO] : 'Todos',
        otroGrupo: propiaH === 'manana' ? GRUPO.tarde : GRUPO.manana,
        propia: propia?.asistentes ?? null,
        poblacion: propia?.inscritos ?? null,
        pct: propia?.inscritos && propia.asistentes != null ? redondear((100 * propia.asistentes) / propia.inscritos) : null,
        colados: colados?.asistentes ?? 0,
      };
    });
  }, [filasClase]);
  // Semanas de clase: mismo diseño. Por semana y por grupo: quién entró a su sala (asistentes − colados,
  // contra la población del grupo) y los colados aparte.
  const semanas = useMemo(() => {
    const porSemana = new Map<string, typeof filasClase>();
    for (const c of filasClase) {
      if (esBienvenida(c.tema)) continue;
      const clave = c.tema ?? c.fecha;
      porSemana.set(clave, [...(porSemana.get(clave) ?? []), c]);
    }
    return [...porSemana.entries()].map(([tema, filas]) => {
      const grupo = (h: string) => {
        const f = filas.find((x) => x.horario === h);
        const propia = f && f.asistentes != null ? f.asistentes - (f.colados ?? 0) : null;
        return { propia, poblacion: f?.inscritos ?? null, pct: propia != null && f?.inscritos ? redondear((100 * propia) / f.inscritos) : null, colados: f?.colados ?? 0 };
      };
      const m = grupo('manana');
      const t = grupo('tarde');
      return { tema, etiqueta: tema.replace(/^semana\s*/i, 'Sem. '), manana: m, tarde: t, colados: m.colados + t.colados };
    });
  }, [filasClase]);

  const bienvenidasVisibles = verBienvenida ? bienvenidas : [];
  const veEnSuSala = poblacion !== 'colados';
  const veColados = poblacion !== 'propia';
  const totalColados = filasClase.reduce((a, c) => a + (c.colados ?? 0), 0);
  const totalEntradas = filasClase.reduce((a, c) => a + (c.asistentes ?? 0), 0);
  const conteoPoblacion: Record<Poblacion, number> = { todos: totalEntradas, propia: totalEntradas - totalColados, colados: totalColados };

  // Gráficas por grupo de la población elegida (vista 005); sin ella (aún no existe) se omiten.
  const grupos = useMemo(
    () => delFiltro(datos.tiempoGrupo).filter((g) => g.poblacion === poblacion),
    [datos, cohorte, ciudad, anio, poblacion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const serieGrupo = (dim: string, valor: (g: (typeof grupos)[number]) => number | null) =>
    grupos
      .filter((g) => g.dimension === dim)
      .sort((a, b) => ordenar(dim, a.categoria, b.categoria))
      .map((g) => ({ etiqueta: etiquetaCategoria(dim, g.categoria), valor: valor(g) }));
  const dimensionesVisibles = DIMENSIONES.filter((d) => (d !== 'ciudad' || ciudad === 'todas') && (d !== 'anio_jc' || !anioPuntual));

  // ── Tiempo: cuánto se quedan ────────────────────────────────────────────────────────────────
  const sesionesTiempo = useMemo(() => {
    const filas = delFiltro(datos.tiempoClase).filter((t) => t.poblacion === poblacion);
    const porTema = new Map<string, typeof filas>();
    for (const t of filas) porTema.set(t.tema ?? t.fecha, [...(porTema.get(t.tema ?? t.fecha) ?? []), t]);
    return [...porTema.entries()]
      .map(([tema, fs]) => {
        const n = fs.reduce((a, f) => a + f.asistentes, 0);
        const ponderado = (campo: 'minutos_prom' | 'permanencia_prom_pct') => {
          const con = fs.filter((f) => f[campo] != null);
          const peso = con.reduce((a, f) => a + f.asistentes, 0);
          return peso ? redondear(con.reduce((a, f) => a + (f[campo] as number) * f.asistentes, 0) / peso) : null;
        };
        const bienvenida = esBienvenida(tema);
        return {
          tema,
          bienvenida,
          fecha: fs[0].fecha,
          etiqueta: bienvenida ? `Bienvenida ${numeroDe(tema)}` : tema.replace(/^semana\s*/i, 'Sem. '),
          asistentes: n,
          duracion: fs[0].duracion_min,
          minutos: ponderado('minutos_prom'),
          permanencia: ponderado('permanencia_prom_pct'),
          menos_25: fs.reduce((a, f) => a + f.menos_25, 0),
          de_25_a_49: fs.reduce((a, f) => a + f.de_25_a_49, 0),
          de_50_a_79: fs.reduce((a, f) => a + f.de_50_a_79, 0),
          de_80_o_mas: fs.reduce((a, f) => a + f.de_80_o_mas, 0),
          color: bienvenida ? C.azul2 : C.verde,
        };
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .filter((s) => verBienvenida || !s.bienvenida);
  }, [datos, cohorte, ciudad, anio, poblacion, verBienvenida]); // eslint-disable-line react-hooks/exhaustive-deps
  const entradasTiempo = sesionesTiempo.reduce((a, s) => a + s.asistentes, 0);
  const promedioPonderado = (campo: 'minutos' | 'permanencia') => {
    const con = sesionesTiempo.filter((s) => s[campo] != null);
    const peso = con.reduce((a, s) => a + s.asistentes, 0);
    return peso ? redondear(con.reduce((a, s) => a + (s[campo] as number) * s.asistentes, 0) / peso) : null;
  };
  const suma = (campo: 'menos_25' | 'de_80_o_mas') => sesionesTiempo.reduce((a, s) => a + s[campo], 0);

  const hayBienvenida = bienvenidas.length > 0 || datos.tiempoClase.some((t) => esBienvenida(t.tema));
  const textoPoblacion = POBLACIONES.find((p) => p.id === poblacion)!.ayuda;

  // ── Controles compartidos (botón de población + interruptor de Bienvenida) ────────────────────
  const controles = (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div role="radiogroup" aria-label="Población" className="flex gap-1 tarjeta-glass p-1 flex-wrap">
        {POBLACIONES.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={poblacion === p.id}
            onClick={() => setPoblacion(p.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              poblacion === p.id ? 'pill-metal pill-metal-azul' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {p.etiqueta}
            <span className="ml-1 text-xs opacity-75">{conteoPoblacion[p.id]}</span>
          </button>
        ))}
      </div>
      {hayBienvenida && (
        <button
          role="switch"
          aria-checked={verBienvenida}
          onClick={() => setVerBienvenida((v) => !v)}
          className="flex items-center gap-2 tarjeta-glass px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: verBienvenida ? C.azul2 : '#cbd5e1' }} />
          Bienvenida {verBienvenida ? 'visible' : 'oculta'}
        </button>
      )}
      <p className="text-xs text-slate-400">
        Mostrando {textoPoblacion}. {verBienvenida ? '' : 'Bienvenida oculta: solo las semanas de clase. '}El número junto a cada botón son entradas.
      </p>
    </div>
  );

  // ── Pestaña Asistencia ──────────────────────────────────────────────────────────────────────
  if (vista === 'Asistencia') {
    const sinNada = bienvenidasVisibles.length === 0 && semanas.length === 0;
    return (
      <>
        {controles}
        {sinNada ? (
          <Seccion titulo={`Asistencia por sesión${sufijo}`}>
            <NoAplica suave motivo="JC-ON solo ha tenido la Bienvenida; las clases de las semanas empiezan el 2 de noviembre de 2026." />
          </Seccion>
        ) : (
          <>
            {bienvenidasVisibles.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {bienvenidasVisibles.flatMap((b) => [
                    veEnSuSala && (
                      <Kpi
                        key={`${b.nombre}-propia`}
                        titulo={`${b.nombre} · ${b.grupo} · ${b.dia}`}
                        valor={b.pct != null ? `${Math.round(b.pct)}%` : '—'}
                        detalle={b.propia != null && b.poblacion != null ? `${b.propia} de ${b.poblacion} entraron a su sala` : undefined}
                        acento={C.azul2}
                      />
                    ),
                    veColados && (
                      <Kpi
                        key={`${b.nombre}-colados`}
                        titulo={`${b.nombre} · Colados · ${b.dia}`}
                        valor={String(b.colados)}
                        detalle={`del grupo ${b.otroGrupo.toLowerCase()}, entraron a esta sala`}
                        acento={AMBAR}
                      />
                    ),
                  ])}
                </div>
                <Seccion
                  titulo={`Bienvenida: quién entró a cada sala${sufijo}`}
                  nota="Tres poblaciones que no se mezclan: grupo de la mañana (viernes, 38) y grupo de la tarde (sábado, 36), cada uno medido contra su propia población, y los colados, que entraron a la sala del otro grupo. Un colado no cuenta como ausente de su grupo. Las barras muestran personas. Fuente: reportes de participantes de Zoom."
                >
                  <div className="overflow-x-auto">
                    <div className="min-w-[480px]">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={bienvenidasVisibles.map((b) => ({
                            etiqueta: `${b.nombre} · sala ${b.grupo.split(' ')[0].toLowerCase()} · ${b.dia}`,
                            en_su_sala: veEnSuSala ? b.propia ?? 0 : 0,
                            colados: veColados ? b.colados : 0,
                          }))}
                          margin={{ top: 20, right: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} />
                          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          {veEnSuSala && (
                            <Bar dataKey="en_su_sala" name="Entraron a la sala de su grupo" stackId="a" fill={C.azul2}>
                              <LabelList dataKey="en_su_sala" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                            </Bar>
                          )}
                          {veColados && (
                            <Bar dataKey="colados" name="Colados (sala del otro grupo)" stackId="a" fill={C.amarillo} radius={[4, 4, 0, 0]}>
                              <LabelList dataKey="colados" position="center" fill="#5a4a1a" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                            </Bar>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Seccion>
              </>
            )}

            {semanas.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                  {veEnSuSala && (
                    <>
                      <Kpi titulo="Semanas · Mañana (viernes)" valor={promedioPct(semanas.map((s) => s.manana.pct))} detalle="promedio de las semanas, entrando a su sala" acento={C.verde} />
                      <Kpi titulo="Semanas · Tarde (sábado)" valor={promedioPct(semanas.map((s) => s.tarde.pct))} detalle="promedio de las semanas, entrando a su sala" acento={VERDE_OSCURO} />
                    </>
                  )}
                  {veColados && <Kpi titulo="Semanas · Colados" valor={String(semanas.reduce((a, s) => a + s.colados, 0))} detalle="entradas a la sala del otro grupo" acento={AMBAR} />}
                </div>
                <Seccion
                  titulo={`Semanas de clase: quién entró a cada sala${sufijo}`}
                  nota="Igual que en la Bienvenida: cada grupo se mide contra su propia población y los colados van aparte, sin contar como ausentes. Las barras muestran personas."
                >
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: Math.max(480, semanas.length * 70) }}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={semanas.map((s) => ({
                            etiqueta: s.etiqueta,
                            manana: veEnSuSala ? s.manana.propia ?? 0 : 0,
                            tarde: veEnSuSala ? s.tarde.propia ?? 0 : 0,
                            colados: veColados ? s.colados : 0,
                          }))}
                          margin={{ top: 20, right: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} />
                          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          {veEnSuSala && (
                            <Bar dataKey="manana" name="Mañana (viernes) en su sala" stackId="a" fill={C.verde}>
                              <LabelList dataKey="manana" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                            </Bar>
                          )}
                          {veEnSuSala && (
                            <Bar dataKey="tarde" name="Tarde (sábado) en su sala" stackId="a" fill={VERDE_OSCURO}>
                              <LabelList dataKey="tarde" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                            </Bar>
                          )}
                          {veColados && (
                            <Bar dataKey="colados" name="Colados (sala del otro grupo)" stackId="a" fill={C.amarillo} radius={[4, 4, 0, 0]}>
                              <LabelList dataKey="colados" position="center" fill="#5a4a1a" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                            </Bar>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-3">Semana</th>
                          {veEnSuSala && <th className="py-1 pr-3">Mañana (viernes)</th>}
                          {veEnSuSala && <th className="py-1 pr-3">Tarde (sábado)</th>}
                          {veColados && <th className="py-1">Colados</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {semanas.map((s) => (
                          <tr key={s.tema} className="border-t border-slate-200/60">
                            <td className="py-1 pr-3 font-medium text-slate-600">{s.etiqueta}</td>
                            {veEnSuSala && <td className="py-1 pr-3">{s.manana.pct != null ? `${Math.round(s.manana.pct)}% · ${s.manana.propia} de ${s.manana.poblacion}` : '—'}</td>}
                            {veEnSuSala && <td className="py-1 pr-3">{s.tarde.pct != null ? `${Math.round(s.tarde.pct)}% · ${s.tarde.propia} de ${s.tarde.poblacion}` : '—'}</td>}
                            {veColados && <td className="py-1" style={{ color: AMBAR }}>{s.colados}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Seccion>
              </>
            )}

            {/* Quiénes entraron, por grupo, para la población elegida (vista 005). */}
            {grupos.length > 0 && (
              <div className="grid lg:grid-cols-2 gap-x-5">
                {dimensionesVisibles.map((dim) => (
                  <Seccion
                    key={dim}
                    titulo={`Quiénes entraron, por ${TITULO_DIM[dim]}${sufijo}`}
                    nota={`% de los estudiantes del grupo que entraron al menos una vez (${textoPoblacion}).`}
                  >
                    <GraficoBarras
                      datos={serieGrupo(dim, (g) => (g.total ? redondear((100 * g.entraron) / g.total) : null))}
                      dataKey="valor"
                      nombre="% que entró"
                      color={dim === 'genero' ? C.naranja : poblacion === 'colados' ? C.amarillo : C.verde}
                      dominioMax={100}
                      sufijoEtiqueta="%"
                      decimalesEtiqueta={1}
                    />
                  </Seccion>
                ))}
              </div>
            )}
          </>
        )}
      </>
    );
  }

  // ── Pestaña Tiempo ──────────────────────────────────────────────────────────────────────────
  return (
    <>
      {controles}
      {sesionesTiempo.length === 0 ? (
        <Seccion titulo={`Tiempo en sesión${sufijo}`}>
          <NoAplica suave motivo="todavía no hay tiempos cargados para esta selección. Se calculan con los minutos conectados de cada sesión (reportes de Zoom)." />
        </Seccion>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Kpi titulo="Tiempo promedio" valor={promedioPonderado('minutos') != null ? `${promedioPonderado('minutos')} min` : '—'} detalle={`por entrada · ${entradasTiempo} entradas`} acento={C.azul2} />
            <Kpi titulo="Permanencia promedio" valor={promedioPonderado('permanencia') != null ? `${promedioPonderado('permanencia')}%` : '—'} detalle="del tiempo de cada sesión" acento={C.verde} />
            <Kpi titulo="Se quedaron 80 % o más" valor={String(suma('de_80_o_mas'))} detalle={entradasTiempo ? `${Math.round((100 * suma('de_80_o_mas')) / entradasTiempo)}% de las entradas` : undefined} acento={VERDE_OSCURO} />
            <Kpi titulo="Menos del 25 %" valor={String(suma('menos_25'))} detalle={entradasTiempo ? `${Math.round((100 * suma('menos_25')) / entradasTiempo)}% de las entradas` : undefined} acento={C.naranja} />
          </div>

          <Seccion
            titulo={`Tiempo promedio por sesión${sufijo}`}
            nota="Minutos conectados por entrada, promediados por sesión (los dos grupos juntos). Azul = Bienvenida, verde = semana de clase."
          >
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(480, sesionesTiempo.length * 70) }}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sesionesTiempo} margin={{ top: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="minutos" name="Minutos promedio" radius={[4, 4, 0, 0]}>
                      {sesionesTiempo.map((s) => (
                        <Cell key={s.tema} fill={s.color} />
                      ))}
                      <LabelList dataKey="minutos" position="top" fill="#334155" fontSize={11} fontWeight={700} formatter={(v: unknown) => (v == null ? '' : `${v} min`)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Seccion>

          <Seccion
            titulo={`Cuánto se quedan en cada sesión${sufijo}`}
            nota="Personas según el % de la sesión que permanecieron conectadas. Menos tiempo en naranja, más tiempo en verde."
          >
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(480, sesionesTiempo.length * 70) }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sesionesTiempo} margin={{ top: 20, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="menos_25" name="Menos del 25 %" stackId="t" fill={C.naranja}>
                      <LabelList dataKey="menos_25" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                    </Bar>
                    <Bar dataKey="de_25_a_49" name="25 a 49 %" stackId="t" fill={C.amarillo}>
                      <LabelList dataKey="de_25_a_49" position="center" fill="#5a4a1a" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                    </Bar>
                    <Bar dataKey="de_50_a_79" name="50 a 79 %" stackId="t" fill={C.azul3}>
                      <LabelList dataKey="de_50_a_79" position="center" fill="#1e3a52" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                    </Bar>
                    <Bar dataKey="de_80_o_mas" name="80 % o más" stackId="t" fill={C.verde} radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="de_80_o_mas" position="center" fill="#fff" fontSize={11} fontWeight={700} formatter={etiquetaCentro} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Seccion>

          {grupos.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-x-5">
              {dimensionesVisibles.map((dim) => (
                <Seccion
                  key={dim}
                  titulo={`Permanencia promedio por ${TITULO_DIM[dim]}${sufijo}`}
                  nota={`% del tiempo de cada sesión que se quedan, entre quienes entraron (${textoPoblacion}).`}
                >
                  <GraficoBarras
                    datos={serieGrupo(dim, (g) => g.permanencia_prom_pct)}
                    dataKey="valor"
                    nombre="% de permanencia"
                    color={dim === 'genero' ? C.naranja : poblacion === 'colados' ? C.amarillo : C.verde}
                    dominioMax={100}
                    sufijoEtiqueta="%"
                    decimalesEtiqueta={1}
                  />
                </Seccion>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function promedioPct(xs: (number | null)[]): string {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? `${(v.reduce((a, n) => a + n, 0) / v.length).toFixed(1)}%` : '—';
}
