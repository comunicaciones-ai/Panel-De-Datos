'use client';

// Hero de presentación: fondo profundo de marca + partículas interactivas +
// título con animación por palabra + CTA metal líquido. Tema por programa:
// azul (JC, default) o rosado (Mujeres ROFÉ — tintes del panel docs/mujeres-rofe).

import { motion, useReducedMotion } from 'framer-motion';
import { ParticleHero } from './ParticleHero';
import { LiquidMetalButton } from './LiquidMetalButton';

const TITULO = 'Datos que tocan vidas';

// Partículas MR: prioridad a los rosados, con chispas amarillas de marca
const PARTICULAS_MR = ['#E5C5CC', '#F0DDE2', '#E5798F', '#C12D4C', '#FDF6F8', '#EEC935'];

export function Hero({ tema = 'jc' }: { tema?: 'jc' | 'mr' }) {
  const reducido = useReducedMotion();
  const palabras = TITULO.split(' ');
  const esMr = tema === 'mr';

  const irAlPanel = () => {
    document.getElementById('panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      className={`relative overflow-hidden bg-gradient-to-br ${
        esMr
          ? 'from-[#3a1120] via-[#7a1f38] to-rofe-rojo'
          : 'from-[#16283d] via-[#2b4a6f] to-rofe-azul'
      }`}
    >
      <ParticleHero
        key={tema}
        paleta={esMr ? PARTICULAS_MR : undefined}
        colorEnlace={esMr ? '229, 197, 204' : undefined}
      />
      {/* halo suave de marca */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full blur-3xl ${
          esMr ? 'bg-[#E5C5CC]/25' : 'bg-rofe-azul3/20'
        }`}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center md:py-32">
        <motion.p
          initial={reducido ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className={`mb-4 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-medium tracking-wide backdrop-blur-sm ${
            esMr ? 'text-[#F0DDE2]' : 'text-rofe-azul3'
          }`}
        >
          Fundación ROFÉ · Jóvenes creaTIvos · Mujeres ROFÉ
        </motion.p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight text-white md:text-6xl">
          {palabras.map((palabra, i) => (
            <motion.span
              key={i}
              className="mr-3 inline-block"
              initial={reducido ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              {palabra === 'vidas' ? <span className="text-rofe-amarillo">{palabra}</span> : palabra}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={reducido ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.7 }}
          className="mt-5 max-w-2xl text-sm leading-relaxed text-white/75 md:text-base"
        >
          Cuatro cohortes, miles de historias: el recorrido completo de nuestros
          participantes en cursos, emprendimiento y comunidad — datos agregados,
          actualizados cada día, sin información personal.
        </motion.p>

        <motion.div
          initial={reducido ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.7 }}
          className="mt-9"
        >
          <LiquidMetalButton onClick={irAlPanel} className={esMr ? 'liquid-metal-rosa' : ''}>
            Explorar los datos
            <span aria-hidden>↓</span>
          </LiquidMetalButton>
        </motion.div>
      </div>
      {/* transición suave hacia el contenido (funde al color de fondo del tema) */}
      <div
        className={`absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent ${
          esMr ? 'to-[#FAF0F3]' : 'to-slate-50'
        }`}
      />
    </section>
  );
}
