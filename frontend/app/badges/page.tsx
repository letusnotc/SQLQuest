"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, type BadgeDef } from "@/lib/api";

export default function BadgesPage() {
  const router = useRouter();
  const [badges, setBadges] = useState<BadgeDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<BadgeDef[]>("/auth/me/badges");
    setBadges(res.data);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    async function run() {
      try {
        await load();
      } catch {
        setError("Could not load badges.");
      }
    }
    void run();
  }, [router, load]);

  if (!badges) {
    return (
      <main className="flex-1 flex items-center justify-center pt-16">
        <p className="text-canopy font-pixel text-xs">{error ?? "Loading..."}</p>
      </main>
    );
  }

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <main className="flex-1 pt-24 px-4 pb-12 max-w-3xl mx-auto w-full">
      <h1 className="pixel-title text-xl mb-1">🎖️ Badges</h1>
      <p className="text-canopy text-sm mb-6">
        {earnedCount} / {badges.length} earned
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {badges.map((b) => (
          <div
            key={b.key}
            className={`panel p-4 flex items-center gap-4 ${b.earned ? "" : "opacity-45 grayscale"}`}
          >
            <span className="text-4xl">{b.earned ? b.icon : "🔒"}</span>
            <div>
              <p className="font-pixel text-[10px] text-grass">{b.name}</p>
              <p className="text-sm text-canopy mt-1">{b.description}</p>
              {b.earned && <p className="text-[10px] text-gold font-pixel mt-1">UNLOCKED</p>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
