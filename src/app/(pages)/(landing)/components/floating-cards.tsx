"use client";

import { motion } from "framer-motion";
import { BookOpen, Brain, Calendar, Clock, Star, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const cards: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  rotation: number;
  top: string;
  left?: string;
  right?: string;
  delay: number;
  bobDuration: number;
  bobAmount: number;
}[] = [
  {
    title: "EECS 281",
    subtitle: "Data Structures",
    icon: BookOpen,
    rotation: -6,
    top: "12%",
    left: "4%",
    delay: 0.2,
    bobDuration: 4.5,
    bobAmount: -10,
  },
  {
    title: "MATH 214",
    subtitle: "Linear Algebra",
    icon: TrendingUp,
    rotation: 4,
    top: "8%",
    right: "6%",
    delay: 0.35,
    bobDuration: 5.2,
    bobAmount: -7,
  },
  {
    title: "PSYCH 111",
    subtitle: "Intro Psychology",
    icon: Brain,
    rotation: -3,
    top: "45%",
    left: "2%",
    delay: 0.5,
    bobDuration: 4.8,
    bobAmount: -12,
  },
  {
    title: "ENGLISH 125",
    subtitle: "College Writing",
    icon: Star,
    rotation: 5,
    top: "50%",
    right: "3%",
    delay: 0.65,
    bobDuration: 5.5,
    bobAmount: -8,
  },
  {
    title: "SI 206",
    subtitle: "Data-Oriented Prog.",
    icon: Calendar,
    rotation: -8,
    top: "75%",
    left: "8%",
    delay: 0.4,
    bobDuration: 4.2,
    bobAmount: -9,
  },
  {
    title: "STATS 250",
    subtitle: "Intro Statistics",
    icon: Clock,
    rotation: 7,
    top: "72%",
    right: "7%",
    delay: 0.55,
    bobDuration: 5,
    bobAmount: -11,
  },
];

export default function FloatingCards() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block">
      {cards.map((card) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 180,
            damping: 18,
            delay: card.delay,
          }}
          className="absolute"
          style={{
            top: card.top,
            left: card.left,
            right: card.right,
            rotate: `${card.rotation}deg`,
          }}
        >
          <motion.div
            animate={{
              y: [0, card.bobAmount, 0],
              rotate: [0, 2, 0],
            }}
            whileHover={{
              scale: 1.08,
              rotate: 0,
            }}
            transition={{
              y: { duration: card.bobDuration, repeat: Infinity, ease: "easeInOut" },
              rotate: { duration: card.bobDuration, repeat: Infinity, ease: "easeInOut" },
              scale: { type: "spring", stiffness: 400, damping: 15 },
            }}
            style={{ scale: 1 }}
            className="pointer-events-auto cursor-default rounded-xl border border-border bg-card/80 px-4 py-3 shadow-sm backdrop-blur-md"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <card.icon className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{card.title}</p>
                <p className="text-[11px] text-muted-foreground">{card.subtitle}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
