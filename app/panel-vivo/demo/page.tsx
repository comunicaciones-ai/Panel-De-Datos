'use client';

// Vista de PRUEBA del panel de clase en vivo -- datos 100% inventados, sin login, sin
// depender del backend (n8n en pausa de pruebas al 2026-08-15). Usa los MISMOS componentes
// visuales que la página real (components/PanelVivoVista.tsx) -- lo que se ve acá es
// exactamente el diseño final, solo que con nombres/correos falsos.

import { useState, useMemo } from 'react';
import { TarjetaSala } from '@/components/PanelVivoVista';
import type { PanelVivoData } from '@/lib/panelVivo';

const DATOS_DEMO: PanelVivoData = {
  generado: new Date().toISOString(),
  salas: [
    {
      uuid: 'demo-sala-1',
      host: 'comunicaciones',
      topic: 'Desarrollo Web - GIT, HTML y CSS - Sala 1',
      abierta_desde: '2026-08-15 10:01',
      horario_resuelto: 'HTML - Sábado 10:00 A.M. COL/ECU/PAN | 12:00 M UY',
      hora_lectura: '2026-08-15 10:10',
      resumen_lectura: {
        presentes: 1,
        presentes_alterno: 1,
        presentes_detectado: 0,
        nunca_entro: 4,
        total_roster: 6,
        sin_identificar: 1,
      },
      roster: [
        {
          nombre: 'Valentina Gómez Ríos',
          correo: 'valentina.gomez@example.com',
          estado: 'presente_exacto',
          ultima_hora: '2026-08-15 10:28:14',
          correo_zoom: null,
          celular: '3011234567',
          ciudad: 'Bogotá',
        },
        {
          nombre: 'Santiago Herrera Muñoz',
          correo: 'santiago.herrera@example.com',
          estado: 'presente_exacto',
          ultima_hora: '2026-08-15 10:30:02',
          correo_zoom: null,
          celular: '3129876543',
          ciudad: 'Barranquilla',
        },
        {
          nombre: 'Camila Andrea Torres Pardo',
          correo: 'camila.torres@example.com',
          estado: 'presente_alterno',
          ultima_hora: '2026-08-15 10:15:40',
          correo_zoom: 'camila.t@example.com',
          celular: '3187654321',
          ciudad: 'Cali',
        },
        {
          nombre: 'Juan Esteban Rodríguez Villa',
          correo: 'juan.rodriguez@example.com',
          estado: 'presente_detectado',
          ultima_hora: '2026-08-15 10:22:51',
          correo_zoom: 'juanes.rv@example.com',
          celular: '3045551234',
          ciudad: 'Medellín',
        },
        {
          nombre: 'Mariana Sofía López Cruz',
          correo: 'mariana.lopez@example.com',
          estado: 'nunca_entro',
          ultima_hora: null,
          correo_zoom: null,
          celular: '3156667788',
          ciudad: 'Cartagena',
        },
        {
          nombre: 'David Felipe Castaño Ruiz',
          correo: 'david.castano@example.com',
          estado: 'nunca_entro',
          ultima_hora: null,
          correo_zoom: null,
          celular: '3223334455',
          ciudad: 'Quito',
        },
      ],
      sin_identificar: [
        {
          nombre: 'Cristian Restrepo',
          correo: 'cristian.r@example.com',
          ultima_hora: '2026-08-15 10:19:03',
          candidato_db: {
            nombre: 'Cristian David Restrepo Ortiz',
            correo: 'cristian.r@example.com',
            fuente: 'postulantes_jc',
          },
        },
        {
          nombre: 'invitado123',
          correo: 'zoomguest48291@zoom.us',
          ultima_hora: '2026-08-15 10:26:47',
          candidato_db: null,
        },
      ],
      resumen: {
        presentes: 2,
        presentes_alterno: 1,
        presentes_detectado: 1,
        nunca_entro: 2,
        total_roster: 6,
        sin_identificar: 2,
      },
    },
    {
      uuid: 'demo-sala-2',
      host: 'jovenescreativos',
      topic: 'Desarrollo Web - GIT, HTML y CSS - Sala 2',
      abierta_desde: '2026-08-15 10:03',
      horario_resuelto: 'HTML - Sábado 10:00 A.M. COL/ECU/PAN | 12:00 M UY',
      hora_lectura: '2026-08-15 10:13', // aún no llega -- muestra "pendiente" en la demo
      resumen_lectura: null,
      roster: [
        {
          nombre: 'Isabella Ramírez Ocampo',
          correo: 'isabella.ramirez@example.com',
          estado: 'presente_exacto',
          ultima_hora: '2026-08-15 10:31:10',
          correo_zoom: null,
          celular: '3011112222',
          ciudad: 'Guayaquil',
        },
        {
          nombre: 'Sebastián Andrés Molina Vega',
          correo: 'sebastian.molina@example.com',
          estado: 'nunca_entro',
          ultima_hora: null,
          correo_zoom: null,
          celular: '3193334444',
          ciudad: 'Panamá',
        },
      ],
      sin_identificar: [],
      resumen: {
        presentes: 1,
        presentes_alterno: 0,
        presentes_detectado: 0,
        nunca_entro: 1,
        total_roster: 2,
        sin_identificar: 0,
      },
    },
    {
      uuid: 'demo-sala-3',
      host: 'comunicaciones',
      topic: 'Reunión sin alias configurado',
      abierta_desde: '2026-08-15 10:05',
      horario_resuelto: null,
      hora_lectura: null, // sin Alias Zoom en CUPOS -- tampoco hay hora oficial, no se muestra nada
      resumen_lectura: null,
      roster: [],
      sin_identificar: [],
      resumen: {
        presentes: 0,
        presentes_alterno: 0,
        presentes_detectado: 0,
        nunca_entro: 0,
        total_roster: 0,
        sin_identificar: 0,
      },
    },
  ],
};

export default function PanelVivoDemoPage() {
  const [filtro, setFiltro] = useState('');

  const salasFiltradas = useMemo(() => {
    if (!filtro.trim()) return DATOS_DEMO.salas;
    const f = filtro.trim().toLowerCase();
    return DATOS_DEMO.salas
      .map((s) => ({
        ...s,
        roster: s.roster.filter(
          (r) => r.nombre.toLowerCase().includes(f) || r.correo.toLowerCase().includes(f)
        ),
      }))
      .filter((s) => s.roster.length > 0 || s.topic.toLowerCase().includes(f));
  }, [filtro]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div className="rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm px-4 py-2 font-medium">
        ⚠️ VISTA DE PRUEBA — nombres, correos y números son inventados. No es información real
        de ningún estudiante.
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Panel de clase en vivo (demo)</h1>
          <p className="text-xs text-slate-400">Datos de ejemplo — sin login, sin backend</p>
        </div>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar nombre o correo…"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-56"
        />
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {salasFiltradas.map((s) => (
          <TarjetaSala key={s.uuid} sala={s} />
        ))}
      </div>
    </div>
  );
}
