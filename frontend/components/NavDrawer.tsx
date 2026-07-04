"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useParams } from "next/navigation";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "\u{1F3E0}" },
  { href: "/profile", label: "Profile", icon: "\u{1F9D1}\u{200D}\u{1F33E}" },
  { href: "/badges", label: "Badges", icon: "\u{1F396}\u{FE0F}" },
  { href: "/leaderboard", label: "Leaderboard", icon: "\u{1F3C6}" },
];

export function NavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();

  const datasetLinks = params?.id
    ? [
        { href: `/datasets/${params.id}/world`, label: "World Map", icon: "\u{1F5FA}️" },
        { href: `/datasets/${params.id}/progress`, label: "World Progress", icon: "\u{1F4C8}" },
      ]
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 left-3 z-40 flex h-11 w-11 flex-col items-center justify-center gap-1 bg-panel pixel-border cursor-pointer hover:bg-panel-2 transition-colors"
      >
        <span className="block h-0.5 w-5 bg-grass" />
        <span className="block h-0.5 w-5 bg-grass" />
        <span className="block h-0.5 w-5 bg-grass" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-[#040a06]/80"
              onClick={() => setOpen(false)}
            />
            <motion.nav
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed left-0 top-0 z-50 h-full w-72 panel border-l-0 p-5 flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <span className="pixel-title text-xs">🌴 SQLQUEST</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="text-canopy hover:text-grass cursor-pointer text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <ul className="flex flex-col gap-2">
                {[...datasetLinks, ...NAV_LINKS].map((link) => {
                  const active = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm border-2 border-[#071009] transition-colors ${
                          active
                            ? "bg-grass-dark text-[#071009] font-semibold"
                            : "bg-[#071009] text-canopy hover:bg-panel-2 hover:text-grass"
                        }`}
                      >
                        <span>{link.icon}</span>
                        <span>{link.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-auto text-[10px] text-leaf font-pixel leading-relaxed">
                press ESC or tap outside to close
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
