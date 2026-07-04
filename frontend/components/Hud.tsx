"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api, getToken, type User } from "@/lib/api";

export function Hud() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!getToken()) {
        if (!cancelled) setUser(null);
        return;
      }
      try {
        const res = await api.get<User>("/auth/me");
        if (!cancelled) setUser(res.data);
      } catch {
        if (!cancelled) setUser(null);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // Re-fetch on navigation so XP/hearts reflect the latest after playing.
  }, [pathname]);

  // Hide on auth screens
  if (!user || pathname === "/login" || pathname === "/register") return null;

  const maxHearts = 5;

  return (
    <div className="fixed top-3 right-3 z-30 flex items-center gap-2">
      <div className="hud-chip">
        {Array.from({ length: maxHearts }).map((_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src="/game/dude/ui/heart.png"
            alt=""
            width={16}
            height={16}
            style={{
              imageRendering: "pixelated",
              opacity: i < user.hearts ? 1 : 0.25,
            }}
          />
        ))}
      </div>
      <div className="hud-chip">
        <span className="text-gold">◆</span>
        <span className="text-canopy">{user.xp} XP</span>
      </div>
      <div className="hud-chip">
        <span>🔥</span>
        <span className="text-canopy">{user.current_streak}</span>
      </div>
    </div>
  );
}
