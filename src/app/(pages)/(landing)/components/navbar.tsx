"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "/about" },
];

function NavProfileBadge() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.refresh();
    setOpen(false);
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
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
    );
  }

  const user = session.user;

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-green-500/20 border border-green-500 text-green-700 px-4 py-2 rounded-full hover:bg-green-500/30 transition-colors"
      >
        {user.image ? (
          <img src={user.image} alt="Profile" className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-xs font-bold">
            {user.name?.[0] ?? "?"}
          </div>
        )}
        <span className="text-sm font-medium">{user.email}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute top-16 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50"
          >
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="block w-full text-left px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors font-medium"
            >
              Go to Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium border-t border-border"
            >
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = authClient.useSession();

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

          {/* DESKTOP — session-aware */}
          <div className="hidden md:flex relative">
            <NavProfileBadge />
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

              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                {session?.user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors font-medium"
                    >
                      Go to Dashboard
                    </Link>
                    <button
                      onClick={() => authClient.signOut()}
                      className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium text-left"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}