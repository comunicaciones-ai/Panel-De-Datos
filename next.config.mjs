/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export estático: todo el dato se consulta client-side a las vistas públicas
  // de Supabase (anon key + RLS/agregados). Sin SSR → deploy estático en Vercel
  // (Netlify dado de baja 2026-08-11, ver README.md), Vercel detecta output:'export' solo.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
