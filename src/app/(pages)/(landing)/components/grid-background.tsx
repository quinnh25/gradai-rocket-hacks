"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const spacing = 32;
      const cols = Math.ceil(w / spacing) + 1;
      const rows = Math.ceil(h / spacing) + 1;
      const cx = w / 2;
      const cy = h / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * spacing;
          const y = row * spacing;

          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = Math.sqrt(cx * cx + cy * cy);

          const wave = Math.sin(dist * 0.008 - time * 0.6) * 0.5 + 0.5;
          const fade = 1 - (dist / maxDist) * 0.7;
          const opacity = wave * fade * 0.35;

          const size = 1.2 + wave * 1;

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `oklch(0.67 0.16 245 / ${opacity})`;
          ctx.fill();
        }
      }

      time += 0.016;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ opacity: 0.6 }}
    />
  );
}

export default function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <DotGrid />

      <motion.div
        animate={{ opacity: [0.12, 0.22, 0.12] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-1/2 top-[20%] h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/20 blur-[150px]"
      />

      <motion.div
        animate={{ opacity: [0.06, 0.14, 0.06] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        className="absolute bottom-0 right-[10%] h-[400px] w-[400px] rounded-full bg-accent/30 blur-[120px]"
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(135deg, transparent 40%, oklch(0.67 0.16 245 / 0.03) 50%, transparent 60%),
            linear-gradient(225deg, transparent 40%, oklch(0.67 0.16 245 / 0.02) 50%, transparent 60%)
          `,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, transparent 0%, var(--background) 100%)`,
        }}
      />
    </div>
  );
}
