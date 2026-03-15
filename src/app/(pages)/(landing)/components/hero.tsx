"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import FloatingCards from "./floating-cards";
import GridBackground from "./grid-background";

const wordVariants = {
  hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      type: "spring" as const,
      stiffness: 180,
      damping: 18,
      delay: 0.08 * i,
    },
  }),
};

export default function Hero() {
  const headlineWords = ["Your", "path", "to", "graduation,", "simplified."];

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 pt-20">
      <GridBackground />
      <FloatingCards />

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
          <span className="text-xs font-medium text-primary">
            AI-powered course planning
          </span>
        </motion.div>

        <h1 className="mb-6 text-5xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-6xl md:text-7xl">
          {headlineWords.map((word, i) => (
            <motion.span
              key={i}
              custom={i}
              variants={wordVariants}
              initial="hidden"
              animate="visible"
              className={`mr-3 inline-block ${word === "graduation," ? "text-primary" : ""}`}
            >
              {word}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.5 }}
          className="mx-auto mb-10 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Stop guessing which classes to take. GradAI maps your interests to
          your requirements so you graduate on time — and actually enjoy the ride.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.65 }}
          className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <Button size="lg" asChild className="group px-6 text-sm">
              <Link href="/dashboard">
              Start Planning
              <motion.span
                className="inline-block"
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowRight className="size-4" />
              </motion.span>
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild className="px-6 text-sm">
            <Link href="#how-it-works">See How It Works</Link>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="text-muted-foreground">
              <rect x="1" y="1" width="14" height="22" rx="7" stroke="currentColor" strokeWidth="1.5" />
              <motion.circle
                animate={{ cy: [7, 14, 7] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                cx="8" r="2" fill="currentColor"
              />
            </svg>
          </motion.div>
          <span>Scroll to explore</span>
        </motion.div>
      </div>
    </section>
  );
}
