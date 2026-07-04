"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BadgeDef } from "@/lib/api";

export function BadgeToast({ badges, onDone }: { badges: BadgeDef[]; onDone: () => void }) {
  useEffect(() => {
    if (badges.length === 0) return;
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [badges, onDone]);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
      <AnimatePresence>
        {badges.map((b) => (
          <motion.div
            key={b.key}
            initial={{ y: 40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="panel px-5 py-3 flex items-center gap-3"
            style={{ boxShadow: "inset 0 0 0 3px #fcd34d, 0 6px 0 0 rgba(0,0,0,0.4)" }}
          >
            <span className="text-3xl">{b.icon}</span>
            <div>
              <p className="font-pixel text-[10px] text-gold">BADGE UNLOCKED</p>
              <p className="text-sm text-[color:var(--foreground)]">{b.name}</p>
              <p className="text-xs text-canopy">{b.description}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
