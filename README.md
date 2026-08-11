# Panel de Datos — Fundación ROFÉ / Jóvenes creaTIvos

Dashboard público de estadísticas agregadas (cursos, emprendimiento, demografía).
**Sin PII:** consume exclusivamente vistas de agregados de Supabase vía anon key + RLS.

## Stack

- **Next.js 14** (App Router) con `output: 'export'` → sitio 100% estático
- **Tailwind CSS** con la paleta oficial ROFÉ (Manual de Identidad 2025)
- **Recharts** para gráficos
- **Supabase** (proyecto `panel-datos-rofe`) — datos sincronizados diariamente
  desde Q10 por n8n (repo de automatizaciones, proceso `panel-datos-etl`)

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # genera out/ (export estático)
```

## Deploy (Vercel)

**Netlify dado de baja 2026-08-11 — el deploy es solo Vercel.** Export estático puro
(`output: 'export'` en `next.config.mjs`), sin SSR ni API routes — Vercel lo detecta solo, no hace
falta `vercel.json`.

- **Repo de deploy:** `Samuel-Rojas-Monroy-Official-Repository/panel_de_datos` (remote
  `samuel_oficial` en este clon local). Cada push a su `main` redespliega solo:
  `git push samuel_oficial HEAD:main`.
- Framework Preset: se autodetecta "Next.js" — Build Command y Output Directory por defecto
  (Vercel reconoce `output: 'export'`; si el formulario pide Output Directory a mano, es `out`).
- Variables de entorno: **no son obligatorias** — el anon key público ya tiene default en
  `lib/api.ts`. Solo agregar `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` para
  sobreescribirlo.

## Seguridad

- El frontend solo conoce el **anon key** — RLS de Supabase limita la lectura a
  vistas de agregados (`v_*`) y `cohorte_stats`. Las filas individuales de
  `participants` están bloqueadas.
- La **service_role/secret key jamás** debe aparecer en este repo.

## Fuente de datos

| Vista | Tab |
|---|---|
| `cohorte_stats` | KPIs Resumen |
| `v_curso_completion` | Resumen + Cursos |
| `v_emprendimiento_situacion` / `v_emprendimiento_vs_cursos` | Emprendimiento |
| `v_demografia_grupo` / `v_edad_distribucion` | Demografía |

Documentación completa del proceso: repo de automatizaciones →
`docs/procesos/panel-datos-etl.md`.
