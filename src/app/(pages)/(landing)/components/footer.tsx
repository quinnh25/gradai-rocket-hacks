"use client";

import { motion, useInView } from "framer-motion";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

const footerLinks = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How It Works", href: "#how-it-works" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#about" },
    ],
  },
];

export default function Footer() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.footer
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ duration: 0.6 }}
      className="border-t border-border px-4 py-12"
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="mb-3 flex items-center gap-2.5">
              <GraduationCap className="size-5 text-primary" />
              <span className="text-base font-bold tracking-tight text-foreground">
                Grad<span className="text-primary">AI</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Smarter course planning for University of Michigan students. Built
              by students, for students.
            </p>
          </div>

          <div className="flex gap-12">
            {footerLinks.map((group) => (
              <div key={group.heading}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
                  {group.heading}
                </p>
                <ul className="flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} GradAI. Not affiliated with the
          University of Michigan.
        </div>
      </div>
    </motion.footer>
  );
}
