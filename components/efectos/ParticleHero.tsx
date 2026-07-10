'use client';

// Campo de partículas interactivo para el hero (inspirado en particle-hero de 21st.dev,
// implementación propia en canvas — sin dependencias). Partículas en la paleta ROFÉ
// sobre el azul profundo de marca; el mouse las repele suavemente.
// Respeta prefers-reduced-motion: render estático sin animación.

import { useEffect, useRef } from 'react';

const COLORES = ['#EEC935', '#D1793F', '#6EA050', '#6FA0BC', '#83B6DD', '#C12D4C'];
// rgb del color de las líneas de conexión (JC: azul claro de marca)
const ENLACE_DEFAULT = '131, 182, 221';

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  alpha: number;
}

export function ParticleHero({
  className = '',
  paleta = COLORES,
  colorEnlace = ENLACE_DEFAULT,
}: {
  className?: string;
  paleta?: string[];
  colorEnlace?: string; // "r, g, b"
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ancho = 0;
    let alto = 0;
    let particulas: Particula[] = [];
    const mouse = { x: -9999, y: -9999 };
    let rafId = 0;

    const redimensionar = () => {
      const rect = canvas.getBoundingClientRect();
      ancho = rect.width;
      alto = rect.height;
      canvas.width = ancho * dpr;
      canvas.height = alto * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(110, Math.floor((ancho * alto) / 11000));
      particulas = Array.from({ length: n }, () => ({
        x: Math.random() * ancho,
        y: Math.random() * alto,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 2.2,
        color: paleta[Math.floor(Math.random() * paleta.length)],
        alpha: 0.35 + Math.random() * 0.5,
      }));
    };

    const dibujar = () => {
      ctx.clearRect(0, 0, ancho, alto);
      // conexiones sutiles entre partículas cercanas
      for (let i = 0; i < particulas.length; i++) {
        for (let j = i + 1; j < particulas.length; j++) {
          const a = particulas[i];
          const b = particulas[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            ctx.strokeStyle = `rgba(${colorEnlace}, ${0.12 * (1 - d2 / (110 * 110))})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const p of particulas) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const paso = () => {
      for (const p of particulas) {
        // repulsión suave del mouse
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 130 * 130 && d2 > 0.01) {
          const f = (1 - Math.sqrt(d2) / 130) * 0.6;
          p.vx += (dx / Math.sqrt(d2)) * f;
          p.vy += (dy / Math.sqrt(d2)) * f;
        }
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = ancho + 10;
        if (p.x > ancho + 10) p.x = -10;
        if (p.y < -10) p.y = alto + 10;
        if (p.y > alto + 10) p.y = -10;
      }
      dibujar();
      rafId = requestAnimationFrame(paso);
    };

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    redimensionar();
    if (reducido) {
      dibujar(); // un solo frame estático
    } else {
      rafId = requestAnimationFrame(paso);
      canvas.addEventListener('mousemove', onMouse);
      canvas.addEventListener('mouseleave', onLeave);
    }
    window.addEventListener('resize', redimensionar);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', redimensionar);
      canvas.removeEventListener('mousemove', onMouse);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [paleta, colorEnlace]);

  return <canvas ref={ref} className={`absolute inset-0 h-full w-full ${className}`} />;
}
