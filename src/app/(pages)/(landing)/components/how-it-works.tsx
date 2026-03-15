"use client";

import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { FileText, Lightbulb, Rocket } from "lucide-react";
import { useRef } from "react";

const steps = [
  {
    number: "01",
    icon: FileText,
    title: "Import your transcript",
    description:
      "Log in and upload your transcript. We figure out exactly where you stand.",
    accent: "bg-primary/10 text-primary",
  },
  {
    number: "02",
    icon: Lightbulb,
    title: "Tell us what excites you",
    description:
      "Pick topics, career paths, major(s), minor(s), or vibes. Our AI matches interests with courses that fulfill requirements.",
    accent: "bg-accent text-accent-foreground",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Build your schedule",
    description:
      "Get a personalized semester by semester plan. Drag, drop, swap — and export to Wolverine Access.",
    accent: "bg-primary/10 text-primary",
  },
];

function StepRow({
  step,
  index,
}: {
  step: (typeof steps)[number];
  index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const isEven = index % 2 === 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        type: "spring",
        stiffness: 160,
        damping: 20,
        delay: index * 0.12,
      }}
      className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_1fr] sm:gap-0"
    >
      <div className={isEven ? "sm:pr-6" : "order-1 sm:order-2 sm:pl-6"}>
        <motion.div
          whileHover={{ scale: 1.03, rotate: isEven ? 1.5 : -1.5 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-xl ${step.accent}`}
            >
              <step.icon className="size-5" />
            </div>
            <span className="text-4xl font-bold text-border">
              {step.number}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {step.description}
          </p>
        </motion.div>
      </div>

      <div
        className={`hidden sm:flex sm:items-center sm:justify-center ${isEven ? "order-2" : "order-1"}`}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={inView ? { scale: 1 } : {}}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 15,
            delay: 0.2 + index * 0.12,
          }}
          className="relative flex size-10 items-center justify-center"
        >
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-border" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
          />
          <span className="text-xs font-bold text-foreground">
            {step.number}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function HowItWorks() {
  const sectionRef = useRef(null);
  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { once: true, margin: "-60px" });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const lineHeight = useTransform(scrollYProgress, [0.1, 0.7], ["0%", "100%"]);

  return (
    <section id="how-it-works" ref={sectionRef} className="relative px-4 py-28">
      <div className="mx-auto max-w-3xl">
        <div ref={headerRef} className="mb-16 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary"
          >
            How It Works
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 20,
              delay: 0.08,
            }}
            className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
          Three steps to your optimal college experience
          </motion.h2>
        </div>

        <div className="relative">
          <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 overflow-hidden bg-border/30 sm:block">
            <motion.div
              style={{ height: lineHeight }}
              className="w-full bg-primary/30"
            />
          </div>

          <div className="flex flex-col gap-8">
            {steps.map((step, i) => (
              <StepRow key={step.number} step={step} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
