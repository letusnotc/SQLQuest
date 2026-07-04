"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, type GlobalLeaderboard } from "@/lib/api";

export default function LeaderboardPage() {
  const router = useRouter();
  const [board, setBoard] = useState<GlobalLeaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<GlobalLeaderboard>("/leaderboard");
    setBoard(res.data);
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
        setError("Could not load the leaderboard.");
      }
    }
    void run();
  }, [router, load]);

  if (!board) {
    return (
      <main className="flex-1 flex items-center justify-center pt-16">
        <p className="text-canopy font-pixel text-xs">{error ?? "Loading..."}</p>
      </main>
    );
  }

  const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`);

  return (
    <main className="flex-1 pt-24 px-4 pb-12 max-w-2xl mx-auto w-full">
      <h1 className="pixel-title text-xl mb-1">🏆 Leaderboard</h1>
      <p className="text-canopy text-sm mb-6">Top explorers ranked by XP.</p>

      <div className="panel p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-canopy text-xs">
              <th className="text-left py-2 w-16">Rank</th>
              <th className="text-left py-2">Player</th>
              <th className="text-right py-2">🔥</th>
              <th className="text-right py-2">XP</th>
            </tr>
          </thead>
          <tbody>
            {board.entries.map((e) => (
              <tr
                key={e.rank}
                className={`border-t border-[#132a20] ${e.is_me ? "bg-grass-dark/20" : ""}`}
              >
                <td className="py-2 font-pixel text-[11px] text-gold">{medal(e.rank)}</td>
                <td className="py-2">
                  <span className={e.is_me ? "text-grass font-semibold" : "text-[color:var(--foreground)]"}>
                    {e.display_name}
                    {e.is_me && <span className="text-leaf text-xs"> (you)</span>}
                  </span>
                </td>
                <td className="py-2 text-right text-canopy">{e.current_streak}</td>
                <td className="py-2 text-right font-mono text-gold">{e.xp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!board.entries.some((e) => e.is_me) && (
        <p className="text-canopy text-sm mt-4 text-center">
          You&apos;re rank <span className="text-gold font-pixel text-xs">#{board.my_rank}</span> with{" "}
          <span className="text-gold">{board.my_xp} XP</span> — climb into the top {board.entries.length}!
        </p>
      )}
    </main>
  );
}
