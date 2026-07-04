"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getToken, type Level, type Dataset, type WorldProgress } from "@/lib/api";
import { GameCanvas } from "@/components/game/GameCanvas";

export default function WorldPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [startLevel, setStartLevel] = useState(0);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    const [datasetRes, levelsRes] = await Promise.all([
      api.get<Dataset>(`/datasets/${params.id}`),
      api.get<Level[]>(`/datasets/${params.id}/levels`),
    ]);

    // Completed levels drive both the resume spawn and the sequential locking.
    let solved: number[] = [];
    try {
      const progress = await api.get<WorldProgress>(`/datasets/${params.id}/progress`);
      solved = progress.data.levels.filter((l) => l.passed).map((l) => l.level_number);
    } catch {
      solved = [];
    }

    // Set together so the game mounts once with the correct data.
    setDataset(datasetRes.data);
    setCompletedLevels(solved);
    setStartLevel(solved.length ? Math.max(...solved) : 0);
    setLevels(levelsRes.data);
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
        setError("Could not load this world.");
      }
    }
    void run();
  }, [router, load]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await api.post(`/datasets/${params.id}/generate-levels`);
      await load();
    } catch {
      setError("Could not generate levels for this dataset.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col pt-20 px-4 pb-4">
      <h1 className="pixel-title text-base mb-4 px-2 text-center">🌴 {dataset?.name ?? "World"}</h1>

      {error && <p className="text-heart mb-3 px-2 text-center">{error}</p>}

      {levels?.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="panel p-6 text-center max-w-sm">
            <p className="text-canopy mb-1">This dataset has no levels yet.</p>
            <p className="text-leaf text-sm">
              Generate a jungle of SQL challenges from your data — takes about 30 seconds.
            </p>
          </div>
          <button type="button" onClick={handleGenerate} disabled={generating} className="btn btn-gold">
            {generating ? "Generating..." : "Generate levels"}
          </button>
        </div>
      )}

      {levels && levels.length > 0 && (
        <GameCanvas
          levels={levels}
          startLevelNumber={startLevel}
          completedLevels={completedLevels}
          onEnterLevel={(levelId) => router.push(`/datasets/${params.id}/levels/${levelId}`)}
        />
      )}
    </main>
  );
}
