"use client";

import { motion, useInView } from "framer-motion";
import {
  BrainCircuit,
  CalendarCheck,
  GraduationCap,
  Route,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useRef } from "react";

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
  visual: ReactNode;
}[] = [
  {
    icon: BrainCircuit,
    title: "AI Course Matching",
    description:
      "Tell us your interests, major(s), and minor(s). We surface courses you'll enjoy that satisfy your requirements.",
    visual: (
      <div className="mt-5 flex flex-wrap gap-2">
        {["Machine Learning", "Bioinformatics", "NLP", "Data Viz", "Geology", "Behavioral Economics", "Quantitative Linguistics", "HCI"].map((tag, i) => (
          <motion.span
            key={tag}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.06, type: "spring", stiffness: 300, damping: 20 }}
            className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
          >
            {tag}
          </motion.span>
        ))}
      </div>
    ),
  },
  {
    icon: Route,
    title: "Graduation Roadmap",
    description:
      "Your entire program path laid out semester by semester. No more surprises about missing prerequisites.",
    visual: (
      <div className="mt-5 flex items-end gap-2">
        <div className="flex items-end gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
            <motion.div
              key={sem}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + sem * 0.06, type: "spring", stiffness: 200, damping: 15 }}
              className="origin-bottom rounded-sm bg-primary"
              style={{ width: 14, height: 10 + sem * 5 }}
            />
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8, type: "spring", stiffness: 200, damping: 15 }}
          className="mb-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10"
        >
          <GraduationCap className="size-5 text-primary" />
        </motion.div>
      </div>
    ),
  },
  {
    icon: CalendarCheck,
    title: "Smart Scheduling",
    description:
      "Build conflict-free schedules in seconds. We factor in course availability, time preferences, and workload balance.",
visual: (
      <div className="mt-5 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 25 }).map((_, i) => {
          const highlighted = [2, 7, 8, 12, 17, 18, 22].includes(i);
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 + i * 0.015 }}
              className={`h-4 rounded-sm ${highlighted ? "bg-primary/60" : "bg-border/60"}`}
            />
          );
        })}
      </div>
    ),
  },
  {
    icon: Zap,
    title: "Fast-Track Your Degree",
    description:
      "We take complicated double-counting rules and turn them into a simple, streamlined path to graduation.",
    visual: (
      <div className="mt-5 space-y-2">
        {[
          { label: "MechE Core", course: "MATH 216", },
          { label: "Math Minor Requirement", course: "MATH 216", },
          { label: "AI Minor Requirement", course: "MATH 216", },
        ].map((req, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.15, type: "spring", stiffness: 200, damping: 18 }}
            className="flex items-center justify-between rounded-lg border border-primary/10 bg-primary/5 px-3 py-2"
          >
            <span className="text-xs text-muted-foreground font-medium">{req.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary font-semibold">{req.course}</span>
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.15, type: "spring", stiffness: 300, damping: 15 }}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500"
              >
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
            </div>
          </motion.div>
        ))}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.85 }}
          className="text-center text-xs text-green-600 font-medium pt-1"
        >
          1 course → 3 requirements satisfied
        </motion.p>
      </div>
    ),
  },
];
function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[number];
  index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        type: "spring",
        stiffness: 180,
        damping: 20,
        delay: index * 0.1,
      }}
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 20 } }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card/50 p-6 backdrop-blur-sm transition-colors hover:border-primary/25 hover:bg-card/80"
    >
      <div className="flex items-start gap-3">
        <motion.div
          whileHover={{ rotate: 8, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <feature.icon className="size-5" />
        </motion.div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {feature.description}
          </p>
        </div>
      </div>
      <div className="mt-auto">{feature.visual}</div>
    </motion.div>
  );
}

export default function Features() {
  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { once: true, margin: "-60px" });

  return (
    <section id="features" className="relative px-4 py-28">
      <div className="mx-auto max-w-3xl">
        <div ref={headerRef} className="mb-12">
          <motion.p
            initial={{ opacity: 0, x: -12 }}
            animate={headerInView ? { opacity: 1, x: 0 } : {}}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary"
          >
            Features
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, x: -16 }}
            animate={headerInView ? { opacity: 1, x: 0 } : {}}
            transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.06 }}
            className="max-w-md text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            Everything you need to plan smarter
          </motion.h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
