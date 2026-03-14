"use client";

import { motion } from "framer-motion";
import { GraduationCap, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// ⚠️ Make sure this path matches where you put your Better-Auth client file!
import { authClient } from "@/lib/auth/client"; 

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 left-0 right-0 z-50 px-4 py-3"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-background/80 px-5 py-2.5 backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: 12, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <GraduationCap className="size-6 text-primary" />
            </motion.div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Grad<span className="text-primary">AI</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="relative rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* DESKTOP BUTTONS */}
          <div className="hidden items-center gap-2 md:flex">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
            >
              Log in
            </Button>
            <Button 
              size="sm" 
              onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
            >
              Get Started
            </Button>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="mt-2 rounded-2xl border border-border bg-background/95 p-4 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              
              {/* MOBILE BUTTONS */}
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
                >
                  Log in
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
                >
                  Get Started
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}