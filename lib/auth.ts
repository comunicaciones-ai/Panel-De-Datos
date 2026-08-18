// Cliente de Auth para el panel en vivo (Fase 1, 2026-08-15) -- login con Google, restringido
// a cuentas @tocaunavida.org. Independiente de lib/api.ts (que hace fetch crudo a las vistas
// públicas, sin auth) -- aquí SÍ usamos el cliente oficial @supabase/supabase-js porque maneja
// el flujo OAuth/PKCE y la sesión por nosotros.
//
// Defensa en profundidad: aunque el proyecto de Google Cloud esté configurado como "Internal"
// (Google ya bloquea cuentas fuera del Workspace), este archivo SIEMPRE revalida el dominio del
// correo tras el login -- si algún día el consent screen queda "External", el filtro sigue acá.
'use client';

import { createClient, type Session } from '@supabase/supabase-js';

const URL_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://kbxptoowtnteflhrfwid.supabase.co';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtieHB0b293dG50ZWZsaHJmd2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MzU4MDUsImV4cCI6MjA5OTIxMTgwNX0.xfj_GJYdRgPHUCpyxReKm7G7SMGTVn4oscDhakV6DSo';

export const DOMINIO_PERMITIDO = 'tocaunavida.org';

export const supabaseAuth = createClient(URL_BASE, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export function correoPermitido(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith('@' + DOMINIO_PERMITIDO);
}

export async function iniciarSesionGoogle() {
  const redirectTo = typeof window !== 'undefined' ? window.location.href : undefined;
  await supabaseAuth.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
}

export async function cerrarSesion() {
  await supabaseAuth.auth.signOut();
}

/** Sesión válida = hay sesión Y el correo es del dominio permitido. Si alguien externo logra
 * loguearse (consent screen "External" sin filtro de Google), se cierra sesión sola. */
export async function sesionValida(): Promise<Session | null> {
  const { data } = await supabaseAuth.auth.getSession();
  const session = data.session;
  if (!session) return null;
  if (!correoPermitido(session.user.email)) {
    await cerrarSesion();
    return null;
  }
  return session;
}
