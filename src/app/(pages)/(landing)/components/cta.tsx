"use client";

import { motion, useInView } from "framer-motion";
import { ArrowRight, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

export default function CTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="relative px-4 py-28">
      <div className="mx-auto max-w-4xl">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ type: "spring", stiffness: 160, damping: 20 }}
          className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/[0.03] p-10 sm:p-16"
        >
          <div className="absolute inset-0 overflow-hidden">
            <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="cta-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.8" className="fill-primary/10" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cta-dots)" />
            </svg>

            <motion.div
              animate={{
                x: [0, 40, 0],
                y: [0, -30, 0],
                scale: [1, 1.2, 1],
              }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-[80px]"
            />
            <motion.div
              animate={{
                x: [0, -30, 0],
                y: [0, 20, 0],
                scale: [1.1, 1, 1.1],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 4 }}
              className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-accent/20 blur-[60px]"
            />
          </div>

          <div className="relative z-10 flex flex-col items-center text-center sm:flex-row sm:text-left">
            <div className="flex-1">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.15 }}
                className="mb-4 inline-flex items-center gap-2"
              >
                <motion.div
                  animate={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <GraduationCap className="size-8 text-primary" />
                </motion.div>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
                className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                Ready to plan your future?
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.3 }}
                className="max-w-md text-sm leading-relaxed text-muted-foreground"
              >
                Join Michigan students who stopped stressing about course
                selection and started enjoying it.
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.4 }}
              className="mt-6 sm:mt-0"
            >
              <Button size="lg" asChild className="group px-8 text-sm">
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
