"use client";

import { motion } from "framer-motion";
import {
  Atom,
  BookOpen,
  BrainCircuit,
  Building2,
  Calculator,
  FlaskConical,
  Globe,
  Heart,
  Landmark,
  Leaf,
  type LucideIcon,
  MessageSquare,
  Music,
  Palette,
  Scale,
  TrendingUp,
} from "lucide-react";

const items: { label: string; icon: LucideIcon; accent: string }[] = [
  {
    label: "Computer Science",
    icon: BrainCircuit,
    accent: "border-primary/30 bg-primary/5 text-primary",
  },
  {
    label: "Psychology",
    icon: Heart,
    accent: "border-destructive/20 bg-destructive/5 text-destructive",
  },
  {
    label: "Business",
    icon: TrendingUp,
    accent: "border-primary/30 bg-primary/5 text-primary",
  },
  {
    label: "Engineering",
    icon: Atom,
    accent: "border-primary/25 bg-primary/5 text-primary",
  },
  {
    label: "Information",
    icon: Globe,
    accent: "border-accent-foreground/20 bg-accent text-accent-foreground",
  },
  {
    label: "Data Science",
    icon: Calculator,
    accent: "border-primary/30 bg-primary/5 text-primary",
  },
  {
    label: "Political Science",
    icon: Landmark,
    accent: "border-primary/25 bg-primary/5 text-primary",
  },
  {
    label: "Biology",
    icon: Leaf,
    accent: "border-green-500/20 bg-green-500/5 text-green-700",
  },
  {
    label: "Economics",
    icon: TrendingUp,
    accent: "border-primary/30 bg-primary/5 text-primary",
  },
  {
    label: "Philosophy",
    icon: Scale,
    accent: "border-accent-foreground/20 bg-accent text-accent-foreground",
  },
  {
    label: "Chemistry",
    icon: FlaskConical,
    accent: "border-destructive/20 bg-destructive/5 text-destructive",
  },
  {
    label: "Architecture",
    icon: Building2,
    accent: "border-primary/25 bg-primary/5 text-primary",
  },
  {
    label: "Linguistics",
    icon: MessageSquare,
    accent: "border-accent-foreground/20 bg-accent text-accent-foreground",
  },
  {
    label: "Music",
    icon: Music,
    accent: "border-primary/30 bg-primary/5 text-primary",
  },
  {
    label: "Art & Design",
    icon: Palette,
    accent: "border-destructive/20 bg-destructive/5 text-destructive",
  },
  {
    label: "Literature",
    icon: BookOpen,
    accent: "border-primary/25 bg-primary/5 text-primary",
  },
];

function MarqueeRow({
  reverse = false,
  speed = 35,
  tilt = 0,
}: {
  reverse?: boolean;
  speed?: number;
  tilt?: number;
}) {
  const doubled = [...items, ...items];

  return (
    <div
      className="relative flex overflow-hidden py-2"
      style={{
        transform: `rotate(${tilt}deg)`,
        margin: `0 ${tilt ? -40 : 0}px`,
      }}
    >
      <motion.div
        animate={{ x: reverse ? ["0%", "-50%"] : ["-50%", "0%"] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
        className="flex shrink-0 gap-3"
      >
        {doubled.map((item, i) => (
          <motion.div
            key={`${item.label}-${i}`}
            whileHover={{
              scale: 1.1,
              y: -4,
              transition: { type: "spring", stiffness: 400, damping: 15 },
            }}
            className={`flex shrink-0 cursor-default items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-shadow hover:shadow-md ${item.accent}`}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

export default function Marquee() {
  return (
    <div className="relative overflow-hidden py-10">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-background to-transparent" />

      <div className="flex flex-col gap-3">
        <MarqueeRow speed={40} tilt={-1} />
        <MarqueeRow reverse speed={32} />
        <MarqueeRow speed={45} tilt={1.5} />
      </div>
    </div>
  );
}
