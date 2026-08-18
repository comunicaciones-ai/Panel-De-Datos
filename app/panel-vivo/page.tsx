'use client';

// Panel de clase en vivo -- Fase 2 (2026-08-18). Lee Supabase DIRECTO, client-side (ver
// lib/panelVivo.ts) -- ya no depende de servidor_panel_vivo.py local ni de un túnel efímero,
// por eso funciona igual en localhost y en Vercel. Muestra TODAS las salas activas (no 2
// fijas por cuenta) -- el límite de "1 sala por cuenta" fue justo lo que se rompió el
// 2026-08-15 con 3 salas concurrentes.
//
// Login: Google OAuth restringido a @tocaunavida.org (ver lib/auth.ts) -- ese login ES el
// gate real ahora (RLS exige rol authenticated + dominio del correo, migración
// 051_panel_vivo_supabase). Ya no hace falta la clave de localStorage de la Fase 1.

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sesionValida, iniciarSesionGoogle, cerrarSesion, DOMINIO_PERMITIDO } from '@/lib/auth';
import { obtenerPanelVivo, type PanelVivoData } from '@/lib/panelVivo';
import { Centrado, TarjetaSala } from '@/components/PanelVivoVista';

const INTERVALO_MS = 25_000; // sondeo cada 25s -- conservador a propósito, mismo criterio
// documentado en panel-clase-vivo.md (evitar sondear tan seguido que compita con otra cosa).

export default function PanelVivoPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = cargando
  const [datos, setDatos] = useState<PanelVivoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  useEffect(() => {
    sesionValida().then(setSession);
  }, []);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await obtenerPanelVivo();
      setDatos(d);
      setUltimaActualizacion(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    refrescar();
    const id = setInterval(refrescar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [session, refrescar]);

  const salasFiltradas = useMemo(() => {
    if (!datos) return [];
    if (!filtro.trim()) return datos.salas;
    const f = filtro.trim().toLowerCase();
    return datos.salas
      .map((s) => ({
        ...s,
        roster: s.roster.filter(
          (r) => r.nombre.toLowerCase().includes(f) || r.correo.toLowerCase().includes(f)
        ),
      }))
      .filter((s) => s.roster.length > 0 || s.topic.toLowerCase().includes(f));
  }, [datos, filtro]);

  // --- Estado: cargando sesión ---
  if (session === undefined) {
    return <Centrado>Cargando…</Centrado>;
  }

  // --- Estado: sin login ---
  if (!session) {
    return (
      <Centrado>
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-slate-800">Panel de clase en vivo</h1>
          <p className="text-sm text-slate-500">
            Acceso restringido a cuentas <strong>@{DOMINIO_PERMITIDO}</strong>.
          </p>
          <button
            onClick={() => iniciarSesionGoogle()}
            className="w-full rounded-lg bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-700 transition"
          >
            Entrar con Google
          </button>
        </div>
      </Centrado>
    );
  }

  // --- Estado: panel completo ---
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Panel de clase en vivo</h1>
          <p className="text-xs text-slate-400">
            {session.user.email} ·{' '}
            {ultimaActualizacion
              ? `actualizado ${ultimaActualizacion.toLocaleTimeString('es-CO')}`
              : 'cargando…'}{' '}
            {cargando && '· actualizando…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar nombre o correo…"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-56"
          />
          <button
            onClick={() => cerrarSesion().then(() => setSession(null))}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Salir
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
          {error}
        </div>
      )}

      {datos && salasFiltradas.length === 0 && (
        <p className="text-sm text-slate-400">No hay reuniones activas ahora mismo.</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {salasFiltradas.map((s) => (
          <TarjetaSala key={s.uuid} sala={s} />
        ))}
      </div>
    </div>
  );
}

