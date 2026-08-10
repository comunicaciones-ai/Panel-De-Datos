'use client';

import { useEffect, useRef, useState } from 'react';
import { WEBHOOK_RERUN } from '@/lib/api';

// Botón "Actualizar ahora": dispara el ETL de n8n (workflow rerun-dispatcher, target q10-sync)
// para refrescar Supabase bajo demanda, sin esperar al sync diario de las 9:45.
//
// Seguridad: el panel es PÚBLICO y estático (no hay backend donde esconder secretos). Por eso la
// clave del webhook (x-rerun-key) NO viaja en el bundle: la escribe el usuario una vez y se guarda
// en localStorage de su navegador. Solo quien conozca la clave puede disparar el sync.
//
// El sync corre en el PC de Samuel (8 scripts) y puede tardar 1-3 min; la respuesta HTTP llega al
// terminar. onDone() se llama al éxito para re-leer los datos del panel.

const LS_KEY = 'rofe_rerun_key';
const TARGET = 'q10-sync';
const TIMEOUT_MS = 6 * 60 * 1000; // 6 min: cubre las corridas más largas del pipeline

type Estado = 'idle' | 'pidiendo-clave' | 'corriendo' | 'ok' | 'error' | 'sin-confirmar';

export function BotonActualizar({ onDone }: { onDone?: () => void }) {
  const [estado, setEstado] = useState<Estado>('idle');
  const [mensaje, setMensaje] = useState<string>('');
  const [claveInput, setClaveInput] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado === 'pidiendo-clave') inputRef.current?.focus();
  }, [estado]);

  const leerClave = () => {
    try {
      return localStorage.getItem(LS_KEY) ?? '';
    } catch {
      return '';
    }
  };

  async function disparar(clave: string) {
    setEstado('corriendo');
    setMensaje('Actualizando… corre en el PC y puede tardar 1-3 min.');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(WEBHOOK_RERUN, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rerun-key': clave,
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ target: TARGET }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (resp.status === 403) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {}
        setEstado('pidiendo-clave');
        setMensaje('Clave incorrecta. Vuelve a intentarlo.');
        return;
      }
      if (!resp.ok) {
        setEstado('error');
        setMensaje(`El sync respondió HTTP ${resp.status}. Revisa n8n.`);
        return;
      }
      setEstado('ok');
      setMensaje('✓ Datos actualizados.');
      onDone?.();
      setTimeout(() => setEstado('idle'), 6000);
    } catch (e) {
      clearTimeout(t);
      // La orden ya se envió; puede que el sync siga corriendo aunque el navegador cortara la espera.
      setEstado('sin-confirmar');
      setMensaje(
        'No se pudo confirmar el fin del sync (puede seguir corriendo). ' +
          'Revisa el indicador de frescura en unos minutos o recarga la página.',
      );
    }
  }

  const onClick = () => {
    const clave = leerClave();
    if (clave) {
      void disparar(clave);
    } else {
      setEstado('pidiendo-clave');
      setMensaje('');
    }
  };

  const guardarYCorrer = () => {
    const clave = claveInput.trim();
    if (!clave) return;
    try {
      localStorage.setItem(LS_KEY, clave);
    } catch {}
    setClaveInput('');
    void disparar(clave);
  };

  const corriendo = estado === 'corriendo';
  const color =
    estado === 'ok'
      ? 'text-rofe-verde'
      : estado === 'error'
        ? 'text-rofe-rojo'
        : 'text-slate-400';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onClick}
        disabled={corriendo}
        title="Fuerza el sync de Q10 → Supabase ahora mismo (no espera al sync diario)."
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          corriendo
            ? 'bg-slate-200 text-slate-500 cursor-wait'
            : 'pill-metal pill-metal-azul hover:opacity-90'
        }`}
      >
        {corriendo ? '⏳ Actualizando…' : '🔄 Actualizar ahora'}
      </button>

      {estado === 'pidiendo-clave' && (
        <span className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="password"
            value={claveInput}
            onChange={(e) => setClaveInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && guardarYCorrer()}
            placeholder="Clave de actualización"
            className="px-2 py-1 rounded-md border border-slate-300 text-xs w-44"
          />
          <button
            onClick={guardarYCorrer}
            className="px-2.5 py-1 rounded-md text-xs font-semibold pill-metal pill-metal-verde"
          >
            Guardar y actualizar
          </button>
        </span>
      )}

      {mensaje && <span className={`text-xs ${color}`}>{mensaje}</span>}
    </div>
  );
}
