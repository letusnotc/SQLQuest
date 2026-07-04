"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Level, type DatasetPreview, type WorldProgress } from "@/lib/api";
import { SqlEditor } from "@/components/SqlEditor";
import { DataPreview } from "@/components/DataPreview";
import { TutorDrawer } from "@/components/TutorDrawer";
import { BadgeToast } from "@/components/BadgeToast";
import type { BadgeDef } from "@/lib/api";

interface SubmitResult {
  passed: boolean;
  runtime_ms: number | null;
  reference_runtime_ms: number | null;
  row_count: number | null;
  error_message: string | null;
  diff_message: string | null;
  xp_awarded: number;
  total_xp: number;
  new_badges: BadgeDef[];
}

const difficultyColor: Record<string, string> = {
  bronze: "text-[#cd8032]",
  silver: "text-[#c0c8d0]",
  gold: "text-gold",
  platinum: "text-[#a9d6ff]",
};

export default function LevelPage() {
  const params = useParams<{ id: string; levelId: string }>();
  const router = useRouter();
  const [level, setLevel] = useState<Level | null>(null);
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [query, setQuery] = useState("SELECT ");
  const [hintsShown, setHintsShown] = useState(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastBadges, setToastBadges] = useState<BadgeDef[]>([]);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    const [levelsRes, previewRes] = await Promise.all([
      api.get<Level[]>(`/datasets/${params.id}/levels`),
      api.get<DatasetPreview>(`/datasets/${params.id}/preview`),
    ]);
    const thisLevel = levelsRes.data.find((l) => l.id === params.levelId) ?? null;
    setLevel(thisLevel);
    setPreview(previewRes.data);

    // Locked unless the previous level (by number) has been completed.
    if (thisLevel && thisLevel.level_number > 1) {
      try {
        const progress = await api.get<WorldProgress>(`/datasets/${params.id}/progress`);
        const passed = new Set(progress.data.levels.filter((l) => l.passed).map((l) => l.level_number));
        setLocked(!passed.has(thisLevel.level_number - 1));
      } catch {
        setLocked(false);
      }
    } else {
      setLocked(false);
    }
  }, [params.id, params.levelId]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    async function run() {
      try {
        await load();
      } catch {
        setError("Could not load this level.");
      }
    }
    void run();
  }, [router, load]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<SubmitResult>(`/levels/${params.levelId}/submit`, {
        user_query: query,
      });
      setResult(res.data);
      if (res.data.new_badges?.length) setToastBadges(res.data.new_badges);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (status === 403) setLocked(true);
      setError(detail ?? "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!level) {
    return (
      <main className="flex-1 flex items-center justify-center pt-16">
        <p className="text-canopy font-pixel text-xs">{error ?? "Loading..."}</p>
      </main>
    );
  }

  if (locked) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center pt-16 gap-5 px-4">
        <span className="text-6xl">🔒</span>
        <p className="pixel-title text-sm text-center">LEVEL {level.level_number} IS LOCKED</p>
        <p className="text-canopy text-center max-w-sm">
          Complete level {level.level_number - 1} first to unlock this one.
        </p>
        <Link href={`/datasets/${params.id}/world`} className="btn btn-gold">
          Back to world
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 pt-24 px-4 pb-10 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <Link href={`/datasets/${params.id}/world`} className="text-grass hover:underline font-pixel text-xs">
          ← back to world
        </Link>
        <Link
          href={`/datasets/${params.id}/analysis/${params.levelId}`}
          className="btn-ghost text-[10px]"
          style={{ fontFamily: "var(--font-pixel), monospace", padding: "0.5rem 0.8rem" }}
        >
          📊 Analysis
        </Link>
      </div>

      {/* Question + hints (full width) */}
      <div className="panel p-6">
        <p className="font-pixel text-[11px] mb-3">
          <span className="text-canopy">LEVEL {level.level_number}</span>
          <span className="text-leaf"> · </span>
          <span className={difficultyColor[level.difficulty] ?? "text-grass"}>{level.difficulty.toUpperCase()}</span>
          {level.is_boss && <span className="text-heart"> · BOSS 🦇</span>}
        </p>
        <p className="text-[color:var(--foreground)] text-lg leading-relaxed">{level.question_text}</p>
        <div className="flex gap-1.5 flex-wrap mt-4">
          {level.concept_tags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {level.hint_progression.length > 0 && (
        <div className="mt-4 panel p-5">
          <p className="font-pixel text-[10px] text-gold mb-3">💡 HINTS</p>
          {level.hint_progression.slice(0, hintsShown).map((hint, i) => (
            <p key={i} className="text-sm text-canopy mb-2">
              {i + 1}. {hint}
            </p>
          ))}
          {hintsShown < level.hint_progression.length && (
            <button
              type="button"
              onClick={() => setHintsShown((h) => h + 1)}
              className="text-sm text-grass hover:underline mt-1"
            >
              Reveal next hint
            </button>
          )}
        </div>
      )}

      {/* Editor (left) + data preview (right) */}
      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_minmax(320px,42%)] items-start">
        <div>
          <p className="font-pixel text-[10px] text-canopy mb-2">YOUR QUERY</p>
          <SqlEditor value={query} onChange={setQuery} height={300} />
          <div className="flex items-center gap-3 mt-3">
            <button type="button" onClick={handleSubmit} disabled={submitting} className="btn">
              {submitting ? "Running..." : "Submit query"}
            </button>
            {result?.passed && (
              <Link
                href={`/datasets/${params.id}/analysis/${params.levelId}`}
                className="text-grass hover:underline text-sm"
              >
                See analysis →
              </Link>
            )}
          </div>

          {error && <p className="text-heart mt-4">{error}</p>}

          {result && (
            <div
              className="mt-5 panel p-5"
              style={{ boxShadow: `inset 0 0 0 3px ${result.passed ? "#7ed957" : "#ef5350"}` }}
            >
              <p className="font-pixel text-xs mb-3" style={{ color: result.passed ? "#7ed957" : "#ef5350" }}>
                {result.passed ? "✔ CORRECT!" : "✘ NOT QUITE"}
              </p>
              {result.error_message && <p className="text-sm text-heart">{result.error_message}</p>}
              {result.diff_message && <p className="text-sm text-canopy">{result.diff_message}</p>}
              {result.passed && (
                <div className="flex flex-wrap gap-3 mt-2">
                  <span className="hud-chip">
                    <span className="text-gold">◆</span> +{result.xp_awarded} XP
                  </span>
                  <span className="hud-chip">total {result.total_xp}</span>
                  {result.runtime_ms != null && (
                    <span className="hud-chip">⏱ {result.runtime_ms.toFixed(2)}ms</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {preview && <DataPreview tables={preview.tables} />}
      </div>

      <TutorDrawer levelId={params.levelId} />
      <BadgeToast badges={toastBadges} onDone={() => setToastBadges([])} />
    </main>
  );
}
