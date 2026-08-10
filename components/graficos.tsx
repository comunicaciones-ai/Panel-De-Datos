'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Paleta de DATOS (subconjunto ROFÉ validado para marcas de datos; el azul de
// marca #406C9E se reserva para el chrome de la página).
export const C = {
  verde: '#6EA050',
  amarillo: '#EEC935',
  naranja: '#D1793F',
  rojo: '#C12D4C',
  azul2: '#6FA0BC',
  azul3: '#83B6DD',
};

export function abreviar(nombre: string, max = 26): string {
  const bonito = nombre
    .toLowerCase()
    .replace(/(^|[\s(])\p{L}/gu, (m) => m.toUpperCase());
  return bonito.length > max ? bonito.slice(0, max - 1) + '…' : bonito;
}

/** Barras apiladas horizontales por curso: completados / en progreso / sin iniciar. */
export function GraficoCursos({
  datos,
}: {
  datos: { curso: string; completados: number; en_progreso: number; sin_iniciar: number }[];
}) {
  const filas = datos.map((d) => ({ ...d, etiqueta: abreviar(d.curso) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, filas.length * 44)}>
      <BarChart data={filas} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={190}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          formatter={(v: number, nombre: string) => [v, nombre]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.curso ?? ''}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="completados" name="Completados (>80%)" stackId="a" fill={C.verde} />
        <Bar dataKey="en_progreso" name="En progreso" stackId="a" fill={C.amarillo} />
        <Bar dataKey="sin_iniciar" name="Sin iniciar (0%)" stackId="a" fill={C.rojo} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Avance de la cohorte COMPLETA por curso (cursaron = activos + retirados).
 *  Segmentos: aprobó (activo) / en curso / aprobó y se retiró / se retiró sin aprobar. */
export function GraficoAprobacion({
  datos,
}: {
  datos: {
    curso: string;
    aprobados: number;
    en_curso: number;
    aprobados_retirados: number;
    retirados: number;
  }[];
}) {
  const filas = datos.map((d) => ({ ...d, etiqueta: abreviar(d.curso) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, filas.length * 44)}>
      <BarChart data={filas} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="etiqueta" width={190} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: number, nombre: string) => [v, nombre]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.curso ?? ''}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="aprobados" name="Aprobó (>80%)" stackId="a" fill={C.verde} />
        <Bar dataKey="en_curso" name="En curso" stackId="a" fill={C.amarillo} />
        <Bar dataKey="aprobados_retirados" name="Aprobó y se retiró" stackId="a" fill={C.azul3} />
        <Bar dataKey="retirados" name="Se retiró sin aprobar" stackId="a" fill={C.rojo} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dona de situación de emprendimiento. */
export function GraficoEmprendimiento({
  datos,
}: {
  datos: { nombre: string; total: number; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={datos}
          dataKey="total"
          nameKey="nombre"
          innerRadius={60}
          outerRadius={110}
          paddingAngle={2}
        >
          {datos.map((d) => (
            <Cell key={d.nombre} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Barras verticales genéricas (edades, cursos promedio por situación, etc.). */
export function GraficoBarras({
  datos,
  dataKey,
  nombre,
  color = C.azul2,
  etiquetaKey = 'etiqueta',
  alto = 280,
  dominioMax,
  rotarEtiquetas = false,
}: {
  datos: Record<string, unknown>[];
  dataKey: string;
  nombre: string;
  color?: string;
  etiquetaKey?: string;
  alto?: number;
  dominioMax?: number;
  rotarEtiquetas?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={rotarEtiquetas ? alto + 40 : alto}>
      <BarChart data={datos} margin={{ right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={etiquetaKey}
          tick={{ fontSize: 11 }}
          interval={0}
          angle={rotarEtiquetas ? -30 : 0}
          textAnchor={rotarEtiquetas ? 'end' : 'middle'}
          height={rotarEtiquetas ? 70 : 30}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          domain={dominioMax ? [0, dominioMax] : undefined}
        />
        <Tooltip />
        <Bar dataKey={dataKey} name={nombre} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const PALETA_LINEAS = [C.verde, C.azul2, C.naranja, C.rojo, C.amarillo, C.azul3, '#8a6fbc'];

/** Serie de tiempo multi-curso: una línea por curso (matriculados o promedio). */
export function GraficoHistorial({
  historial,
  metrica,
  nombreMetrica,
}: {
  historial: { fecha: string; curso: string; valor: number | null }[];
  metrica: string;
  nombreMetrica: string;
}) {
  // pivot: [{fecha, "Curso A": v, "Curso B": v, ...}]
  const cursos = Array.from(new Set(historial.map((h) => h.curso)));
  const porFecha = new Map<string, Record<string, number | string | null>>();
  for (const h of historial) {
    if (!porFecha.has(h.fecha)) porFecha.set(h.fecha, { fecha: h.fecha });
    porFecha.get(h.fecha)![abreviar(h.curso, 22)] = h.valor;
  }
  const filas = Array.from(porFecha.values()).sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha)),
  );
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={filas} margin={{ right: 24 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="fecha"
          tick={{ fontSize: 11 }}
          tickFormatter={(f: string) => (/^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(5) : f)}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {cursos.map((c, i) => (
          <Line
            key={c}
            type="monotone"
            dataKey={abreviar(c, 22)}
            name={abreviar(c, 30)}
            stroke={PALETA_LINEAS[i % PALETA_LINEAS.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras apiladas por grupo operativo: mujeres / hombres / otros. */
export function GraficoDemografia({
  datos,
}: {
  datos: { grupo_ciudad: string; mujeres: number; hombres: number; otros_genero: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={datos} margin={{ right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="grupo_ciudad"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="mujeres" name="Mujeres" stackId="g" fill={C.naranja} />
        <Bar dataKey="hombres" name="Hombres" stackId="g" fill={C.azul2} />
        <Bar dataKey="otros_genero" name="Otras identidades" stackId="g" fill={C.amarillo} />
      </BarChart>
    </ResponsiveContainer>
  );
}
