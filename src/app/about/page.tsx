"use client";

import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowLeft, Brain, Database, GraduationCap, Music, Sparkles, Zap, Code2, FlaskConical, Calculator } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

// ── Reused dot-grid background from hero ──────────────────────────────────────
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
          const opacity = wave * fade * 0.3;
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
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ opacity: 0.5 }} />;
}

// ── Word-by-word headline (same as hero) ──────────────────────────────────────
const wordVariants = {
  hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 180, damping: 18, delay: 0.08 * i },
  }),
};

// ── Team data ─────────────────────────────────────────────────────────────────
const team = [
  {
    name: "Quinn Hague",
    role: "CS · Linguistics · Mathematics",
    bio: "Pursuing natural language processing at the intersection of language, logic, and computation.",
    initial: "Q",
    icon: Brain,
    bobDuration: 4.5,
    rotation: -3,
  },
  {
    name: "Brady Jensenius",
    role: "Computer Engineering",
    bio: "Passionate about discrete mathematics, quantum systems, and electromagnetics.",
    initial: "B",
    icon: FlaskConical,
    bobDuration: 5.2,
    rotation: 2,
  },
  {
    name: "Jacob Kensler",
    role: "Electrical Engineering · Trombone",
    bio: "Dual degree spanning the College of Engineering and the School of Music, Theatre & Dance.",
    initial: "J",
    icon: Music,
    bobDuration: 4.8,
    rotation: -2,
  },
  {
    name: "Landon Harder",
    role: "Computer Science",
    bio: "Builder at heart, focused on turning complex systems into elegant solutions.",
    initial: "L",
    icon: Code2,
    bobDuration: 5.0,
    rotation: 3,
  },
];

// ── Problem points ────────────────────────────────────────────────────────────
const problemPoints = [
  {
    icon: Brain,
    title: "LLMs alone aren't enough",
    body: "We tried ChatGPT and Gemini to plan our schedules and verify requirements. They failed — not because they're not powerful, but because they lack access to the specific, ever-evolving data around U of M courses and degree programs.",
  },
  {
    icon: Database,
    title: "The data problem",
    body: "U of M's course catalog is massive, constantly changing, and deeply interconnected. Prerequisites, cross-listed courses, and double-counting rules create a combinatorial puzzle no general-purpose LLM can reliably solve from memory.",
  },
  {
    icon: Zap,
    title: "The logic problem",
    body: "Even with the right data, ensuring all program requirements are fulfilled while optimizing for double-counting and scheduling constraints requires structured reasoning that vanilla LLMs consistently get wrong.",
  },
];

// ── Tech stack pills ──────────────────────────────────────────────────────────
const techStack = [
  "Prompt Engineering", "Agent Tooling", "Vector Databases",
  "Structured Output", "Type Validation", "RAG Pipeline",
  "Next.js", "Prisma", "Better Auth",
];

// ── Team card ─────────────────────────────────────────────────────────────────
function TeamCard({ member, index }: { member: typeof team[number]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ type: "spring", stiffness: 180, damping: 20, delay: index * 0.1 }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 400, damping: 20 } }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card/50 p-6 backdrop-blur-sm transition-colors hover:border-primary/25 hover:bg-card/80"
    >
      {/* Hover glow */}
      <div className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(400px circle at var(--x,50%) var(--y,50%), oklch(0.67 0.16 245 / 0.06), transparent 60%)" }}
      />

      <div className="flex gap-4">
        <motion.div
          whileHover={{ rotate: 8, scale: 1.1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10"
        >
          <member.icon className="size-5 text-primary" />
        </motion.div>
        <div>
          <p className="font-semibold text-foreground">{member.name}</p>
          <p className="text-xs text-primary font-medium mb-2">{member.role}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Problem card ──────────────────────────────────────────────────────────────
function ProblemCard({ point, index }: { point: typeof problemPoints[number]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ type: "spring", stiffness: 180, damping: 20, delay: index * 0.12 }}
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 20 } }}
      className="group rounded-2xl border border-border bg-card/50 p-6 backdrop-blur-sm transition-colors hover:border-primary/25 hover:bg-card/80"
    >
      <motion.div
        whileHover={{ rotate: 8, scale: 1.05 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"
      >
        <point.icon className="size-4 text-primary" />
      </motion.div>
      <p className="mb-2 font-semibold text-foreground text-sm">{point.title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{point.body}</p>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function About() {
  const heroWords = ["Built", "by", "students,", "for", "students."];
  const solutionRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: solutionRef, offset: ["start end", "end start"] });
  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 0]);

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Navbar ── */}
      <div className="fixed top-0 left-0 right-0 z-50 px-4 py-3">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex items-center justify-between rounded-2xl border border-border bg-background/80 px-5 py-2.5 backdrop-blur-xl"
          >
            <Link href="/" className="flex items-center gap-2.5">
              <motion.div whileHover={{ rotate: 12, scale: 1.1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
                <GraduationCap className="size-6 text-primary" />
              </motion.div>
              <span className="text-lg font-bold tracking-tight">Grad<span className="text-primary">AI</span></span>
            </Link>
            <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
          </motion.div>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative flex min-h-[60vh] items-center justify-center overflow-hidden px-4 pt-24 pb-16">
        <DotGrid />
        <motion.div
          animate={{ opacity: [0.12, 0.22, 0.12] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-[20%] h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/20 blur-[150px]"
        />
        <motion.div
          animate={{ opacity: [0.06, 0.14, 0.06] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute bottom-0 right-[10%] h-[300px] w-[300px] rounded-full bg-accent/30 blur-[120px]"
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, transparent 0%, var(--background) 100%)" }}
        />

        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 backdrop-blur-sm"
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            >
              <Sparkles className="size-3.5 text-primary" />
            </motion.div>
            <span className="text-xs font-medium text-primary">University of Michigan · College of Engineering</span>
          </motion.div>

          <h1 className="mb-6 text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            {heroWords.map((word, i) => (
              <motion.span
                key={i}
                custom={i}
                variants={wordVariants}
                initial="hidden"
                animate="visible"
                className={`mr-3 inline-block ${word === "students." ? "text-primary" : ""}`}
              >
                {word}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.55 }}
            className="mx-auto max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            We're four engineers who got tired of guessing which classes to take — so we built the tool we wish existed.
          </motion.p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 pb-24">

        {/* ── Team ── */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="mb-4"
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">The Team</p>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.06 }}
          className="mb-10 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Who we are
        </motion.h2>

        <div className="mb-24 grid gap-4 sm:grid-cols-2">
          {team.map((member, i) => (
            <TeamCard key={member.name} member={member} index={i} />
          ))}
        </div>

        {/* ── Problem ── */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="mb-4"
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">The Problem</p>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.06 }}
          className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Course planning is <span className="text-primary">broken</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
          className="mb-10 max-w-2xl text-base text-muted-foreground leading-relaxed"
        >
          All four of us spent hours every semester browsing the catalog, cross-referencing requirements, and untangling prerequisites, cross-listed courses, and double-counting rules. A simple question — <em>"what should I take next?"</em> — turned into a research project every single time.
        </motion.p>

        <div className="mb-24 grid gap-4 sm:grid-cols-3">
          {problemPoints.map((point, i) => (
            <ProblemCard key={point.title} point={point} index={i} />
          ))}
        </div>

        {/* ── Solution ── */}
        <div ref={solutionRef}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 160, damping: 20 }}
            className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/[0.03] p-10 sm:p-14"
          >
            {/* Animated dot pattern */}
            <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="about-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.8" className="fill-primary/10" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#about-dots)" />
            </svg>

            {/* Floating orbs */}
            <motion.div
              animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-[80px]"
            />
            <motion.div
              animate={{ x: [0, -30, 0], y: [0, 20, 0], scale: [1.1, 1, 1.1] }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 4 }}
              className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-accent/20 blur-[60px]"
            />

            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="mb-2"
              >
                <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
                  How we solved it
                </span>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
                className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl"
              >
                The right model + the right data
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.18 }}
                className="mb-4 max-w-2xl text-base text-muted-foreground leading-relaxed"
              >
                These models aren't incapable — they just need the right information at the right time. Course scheduling is well within their limits. So we built the scaffolding around them.
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.24 }}
                className="mb-8 max-w-2xl text-base text-muted-foreground leading-relaxed"
              >
                Using the latest developments in AI tooling, GradAI gives cutting-edge models exactly what they need: live U of M course data, your degree requirements, and a structured reasoning framework to optimize your path to graduation.
              </motion.p>

              {/* Tech stack pills — same style as features.tsx tags */}
              <div className="flex flex-wrap gap-2">
                {techStack.map((tag, i) => (
                  <motion.span
                    key={tag}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.06, type: "spring", stiffness: 300, damping: 20 }}
                    whileHover={{ scale: 1.08, y: -2, transition: { type: "spring", stiffness: 400, damping: 15 } }}
                    className="cursor-default rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {tag}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  );
}