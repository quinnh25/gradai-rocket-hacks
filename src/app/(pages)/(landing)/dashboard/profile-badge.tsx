"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function ProfileBadge({
  email,
  image,
  name,
}: {
  email: string;
  image?: string | null;
  name?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/");
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-green-500/20 border border-green-500 text-green-700 px-4 py-2 rounded-full hover:bg-green-500/30 transition-colors"
      >
        {image ? (
          <img src={image} alt="Profile" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-xs font-bold">
            {name?.[0] ?? "?"}
          </div>
        )}
        <span className="text-sm font-medium">{email}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="mt-2 w-40 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          >
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
            >
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}