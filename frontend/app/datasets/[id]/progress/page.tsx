"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type WorldProgress } from "@/lib/api";

const difficultyColor: Record<string, string> = {
  bronze: "text-[#cd8032]",
  silver: "text-[#c0c8d0]",
  gold: "text-gold",
  platinum: "text-[#a9d6ff]",
};

export default function ProgressPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [progress, setProgress] = useState<WorldProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<WorldProgress>(`/datasets/${params.id}/progress`);
    setProgress(res.data);
  }, [params.id]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    async function run() {
      try {
        await load();
      } catch {
        setError("Could not load progress.");
      }
    }
    void run();
  }, [router, load]);

  if (!progress) {
    return (
      <main className="flex-1 flex items-center justify-center pt-16">
        <p className="text-canopy font-pixel text-xs">{error ?? "Loading..."}</p>
      </main>
    );
  }

  const pct = progress.total_levels ? Math.round((progress.solved_levels / progress.total_levels) * 100) : 0;

  return (
    <main className="flex-1 pt-24 px-4 pb-12 max-w-3xl mx-auto w-full">
      <Link href={`/datasets/${params.id}/world`} className="text-grass hover:underline font-pixel text-xs">
        ← back to world
      </Link>

      <h1 className="pixel-title text-lg mt-4 mb-1">🌴 {progress.dataset_name}</h1>
      <p className="text-canopy text-sm mb-4">
        {progress.solved_levels} / {progress.total_levels} levels solved · {pct}% complete
      </p>

      <div className="h-5 bg-[#071009] border-2 border-[#071009] mb-6 overflow-hidden">
        <div className="h-full bg-grass transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="panel p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-canopy text-xs">
              <th className="text-left py-2 w-16">Level</th>
              <th className="text-left py-2">Tier</th>
              <th className="text-left py-2">Status</th>
              <th className="text-right py-2">Best runtime</th>
              <th className="text-right py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {progress.levels.map((l) => (
              <tr key={l.level_id} className="border-t border-[#132a20]">
                <td className="py-2 font-pixel text-[11px] text-canopy">
                  {l.level_number}
                  {l.is_boss && <span className="text-heart"> ★</span>}
                </td>
                <td className={`py-2 text-xs ${difficultyColor[l.difficulty] ?? "text-grass"}`}>
                  {l.difficulty}
                </td>
                <td className="py-2">
                  {l.passed ? (
                    <span className="text-grass">✔ solved</span>
                  ) : l.attempts > 0 ? (
                    <span className="text-heart">✘ {l.attempts} tries</span>
                  ) : (
                    <span className="text-leaf">— locked</span>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-canopy">
                  {l.best_runtime_ms == null ? "—" : `${l.best_runtime_ms.toFixed(2)}ms`}
                </td>
                <td className="py-2 text-right">
                  <Link
                    href={`/datasets/${params.id}/levels/${l.level_id}`}
                    className="text-grass hover:underline text-xs"
                  >
                    play →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
