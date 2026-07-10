# Extensión Digital del Manual de Identidad — Fundación ROFÉ

**Complementa** el Manual de Identidad Corporativa 2025 (DE-004-M v03) para productos
digitales interactivos. **No lo reemplaza ni lo contradice**: la paleta, tipografías y
reglas del logo del manual oficial se conservan íntegras. Este documento define cómo
la marca cobra vida en pantalla (Panel de Datos y futuros productos web).

---

## 1. Paleta (sin cambios — manual oficial)

| Color | Hex | Rol digital |
|---|---|---|
| Amarillo | `#EEC935` | Acento de énfasis (palabras clave del hero, highlights) |
| Naranja | `#D1793F` | Programa Mujeres ROFÉ, datos secundarios |
| Rojo | `#C12D4C` | Alertas, series "riesgo/sin iniciar" |
| Azul marca | `#406C9E` | **Solo chrome/UI** (títulos, botones, hero) — nunca marcas de datos (falla contraste CVD) |
| Verde | `#6EA050` | Éxito, "completado", selector de cohorte |
| Azul sec. 1 | `#6FA0BC` | Series de datos primarias |
| Azul sec. 2 | `#83B6DD` | Series de datos, conexiones de partículas |

**Nuevos derivados permitidos (solo fondos, nunca marcas de datos):**
- Azul profundo `#16283D` y `#2B4A6F` — extremos oscuros del azul de marca para el
  gradiente del hero (`#16283D → #2B4A6F → #406C9E`). Dan profundidad sin salir de la
  familia cromática del azul oficial.

## 2. Tipografía (sin cambios)
Century Gothic (fallback del manual para digital) en todo el panel. Jerarquía:
hero 4-6xl bold · títulos de sección base bold · datos 3xl bold · notas xs.

## 3. Sistema de movimiento (nuevo)

Principios: **el movimiento sirve al dato, nunca compite con él.**
- Entradas: fade + desplazamiento vertical 14-28 px, 0.5-0.7 s, ease `cubic-bezier(.22,1,.36,1)`, una sola vez (viewport once).
- Título del hero: palabras escalonadas (~0.12 s entre palabras).
- Fondos animados: opacidad ≤ 0.12 por trazo; ciclos largos (20 s+) — presencia, no distracción.
- **Accesibilidad obligatoria:** todo efecto respeta `prefers-reduced-motion`
  (partículas → frame estático; paths → estáticos; botón → sin animación).

## 4. Componentes de firma

### 4.1 Hero de partículas (`ParticleHero`)
Canvas de partículas en los 6 colores de la paleta sobre el gradiente azul profundo,
con conexiones en azul sec. 2 y repulsión suave al cursor. Uso: portada de productos
digitales. Densidad ≤ 110 partículas; nunca sobre contenido de datos.

### 4.2 Trazos de fondo (`BackgroundPaths`)
Curvas SVG en azul de marca fluyendo tras el contenido (fixed, -z-10, opacidad total
≤ 0.6). Uso: fondo de secciones de datos. Jamás detrás de texto pequeño con opacidad alta.

### 4.3 Botón metal líquido (`LiquidMetalButton`) y pills metálicas (`.pill-metal`)
Dos niveles de jerarquía metálica:
- **CTA completo** (`LiquidMetalButton`): fondo azul profundo, borde cónico giratorio
  (azul marca → azul sec. → amarillo) + barrido de brillo. **Solo un CTA primario por
  vista** — máxima jerarquía.
- **Metal suave** (`.pill-metal` + variante de color): estado ACTIVO de selectores —
  gradiente metálico en el color del grupo (azul=JC, naranja=MR, verde=cohorte,
  oscuro=tabs) + barrido de brillo desincronizado entre grupos (animation-delay).
  Sin borde giratorio: los selectores informan, no gritan. Los estados inactivos
  permanecen planos.

### 4.4 Tarjetas glass (`.tarjeta-glass`)
`bg-white/75 + backdrop-blur + borde y sombra vía variables de tema`. Contenedor
estándar de KPIs, gráficos y selectores sobre los fondos animados.

### 4.5 Tema por programa (2026-07-10, v1.2: rosado MR)
Al seleccionar **Mujeres ROFÉ** el sitio completo cambia a la gama ROSADA de la
sección (paleta del panel `docs/mujeres-rofe`: base rojo/rosa de marca `#C12D4C`
+ tintes `#FDF6F8 / #FAF0F3 / #F0DDE2 / #E5C5CC`); con Jóvenes creaTIvos vuelve
al azul `#406C9E`. Piezas del tema:
- **Hero:** gradiente `#3a1120 → #7a1f38 → #C12D4C` (derivados oscuros del rojo,
  solo-fondos), halo `#E5C5CC/25`, partículas con prioridad rosa (`PARTICULAS_MR`)
  y chispa amarilla, botón `liquid-metal-rosa`.
- **Fondo de página:** `body.tema-mr-body` → `#FAF0F3` (transición 0.5s); el
  fade inferior del hero funde al mismo tono. Trazos de fondo en `#C12D4C`.
- **Chrome del panel:** `#panel.tema-mr` → `--acento #C12D4C`, bordes/sombras
  glass en alfas rosa. Pill del selector MR: `pill-metal-rosa`.
Los colores SEMÁNTICOS de los gráficos (verde=aprobó, amarillo=en curso,
rojo=retirado…) NO cambian con el tema — el significado del color es invariante.

## 5. Reglas de oro
1. Paleta oficial intacta — los derivados oscuros son solo para fondos.
2. Logo: reglas del manual (full color sobre blanco; header claro siempre).
3. Azul de marca jamás como color de serie de datos (regla CVD ya validada).
4. Datos primero: si un efecto compite con la lectura de un gráfico, se quita.
5. `prefers-reduced-motion` no es opcional.

---
**Versión:** 1.2 · 2026-07-10 · Panel de Datos ROFÉ
**Cambios:** 1.0 creación — hero de partículas, trazos de fondo, botón metal líquido,
tarjetas glass, sistema de movimiento y derivados de fondo del azul de marca.
1.1 — tema por programa (chrome naranja al seleccionar Mujeres ROFÉ).
1.2 — tema MR completo en ROSADO (hero, partículas, fondo de página, trazos,
chrome) con la paleta del panel docs/mujeres-rofe; reemplaza el naranja de 1.1.
