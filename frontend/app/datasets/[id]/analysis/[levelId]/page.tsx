"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Analysis, type Optimization } from "@/lib/api";

const difficultyColor: Record<string, string> = {
  bronze: "text-[#cd8032]",
  silver: "text-[#c0c8d0]",
  gold: "text-gold",
  platinum: "text-[#a9d6ff]",
};

function SqlBlock({ title, sql, accent }: { title: string; sql: string | null; accent: string }) {
  return (
    <div className="panel p-4 flex flex-col">
      <p className="font-pixel text-[10px] mb-2" style={{ color: accent }}>
        {title}
      </p>
      <pre className="text-xs font-mono text-grass bg-[#071009] p-3 overflow-x-auto border border-[#132a20] whitespace-pre-wrap min-h-[80px]">
        {sql ?? "— no query yet —"}
      </pre>
    </div>
  );
}

function RuntimeBars({
  user,
  reference,
  labelA = "Your query",
  labelB = "Reference",
}: {
  user: number | null;
  reference: number | null;
  labelA?: string;
  labelB?: string;
}) {
  const max = Math.max(user ?? 0, reference ?? 0, 0.001);
  const bar = (label: string, ms: number | null, color: string) => (
    <div className="flex items-center gap-3">
      <span className="text-xs text-canopy w-24 shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-[#071009] border border-[#132a20]">
        <div
          className="h-full"
          style={{ width: `${ms == null ? 0 : Math.max(4, (ms / max) * 100)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono text-[color:var(--foreground)] w-20 text-right shrink-0">
        {ms == null ? "—" : `${ms.toFixed(2)}ms`}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {bar(labelA, user, "#7ed957")}
      {bar(labelB, reference, "#fcd34d")}
    </div>
  );
}

export default function AnalysisPage() {
  const params = useParams<{ id: string; levelId: string }>();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"user" | "reference">("user");
  const [optimizing, setOptimizing] = useState(false);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [optError, setOptError] = useState<string | null>(null);

  async function runOptimize() {
    setOptimizing(true);
    setOptError(null);
    setOptimization(null);
    try {
      const res = await api.post<Optimization>(`/levels/${params.levelId}/optimize`);
      setOptimization(res.data);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setOptError(detail ?? "Could not analyze optimization.");
    } finally {
      setOptimizing(false);
    }
  }

  const load = useCallback(async () => {
    const res = await api.get<Analysis>(`/levels/${params.levelId}/analysis`);
    setAnalysis(res.data);
  }, [params.levelId]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    async function run() {
      try {
        await load();
      } catch {
        setError("Could not load analysis.");
      }
    }
    void run();
  }, [router, load]);

  if (!analysis) {
    return (
      <main className="flex-1 flex items-center justify-center pt-16">
        <p className="text-canopy font-pixel text-xs">{error ?? "Loading analysis..."}</p>
      </main>
    );
  }

  const faster =
    analysis.user_runtime_ms != null &&
    analysis.reference_runtime_ms != null &&
    analysis.user_runtime_ms < analysis.reference_runtime_ms;

  return (
    <main className="flex-1 pt-24 px-4 pb-12 max-w-5xl mx-auto w-full">
      <Link
        href={`/datasets/${params.id}/levels/${params.levelId}`}
        className="text-grass hover:underline font-pixel text-xs"
      >
        ← back to level
      </Link>

      <div className="panel p-6 mt-4">
        <p className="font-pixel text-[11px] mb-2">
          <span className="text-canopy">ANALYSIS · LEVEL {analysis.level_number}</span>
          <span className="text-leaf"> · </span>
          <span className={difficultyColor[analysis.difficulty] ?? "text-grass"}>
            {analysis.difficulty.toUpperCase()}
          </span>
        </p>
        <p className="text-[color:var(--foreground)]">{analysis.question_text}</p>
      </div>

      {/* Side-by-side queries */}
      <div className="grid gap-5 md:grid-cols-2 mt-5">
        <SqlBlock title="YOUR QUERY" sql={analysis.user_query} accent="#7ed957" />
        <SqlBlock title="REFERENCE QUERY" sql={analysis.reference_sql} accent="#fcd34d" />
      </div>

      {/* Runtime comparison */}
      <div className="panel p-5 mt-5">
        <p className="font-pixel text-[10px] text-canopy mb-4">⏱ RUNTIME · measured in DuckDB</p>
        <RuntimeBars user={analysis.user_runtime_ms} reference={analysis.reference_runtime_ms} />
        {analysis.user_runtime_ms != null && analysis.reference_runtime_ms != null && (
          <p className="text-sm mt-4" style={{ color: faster ? "#7ed957" : "#8fbfa0" }}>
            {faster
              ? "🏆 Your query ran faster than the reference!"
              : "The reference is at least as fast — check the Analysis for why."}
          </p>
        )}
      </div>

      {/* Query plans */}
      <div className="panel p-5 mt-5">
        <div className="flex items-center gap-2 mb-3">
          <p className="font-pixel text-[10px] text-canopy mr-2">QUERY PLAN</p>
          <button
            type="button"
            onClick={() => setTab("user")}
            className={`text-[10px] px-2 py-1 border-2 border-[#071009] ${
              tab === "user" ? "bg-grass-dark text-[#071009]" : "bg-[#071009] text-canopy"
            }`}
            style={{ fontFamily: "var(--font-pixel), monospace" }}
          >
            Yours
          </button>
          <button
            type="button"
            onClick={() => setTab("reference")}
            className={`text-[10px] px-2 py-1 border-2 border-[#071009] ${
              tab === "reference" ? "bg-grass-dark text-[#071009]" : "bg-[#071009] text-canopy"
            }`}
            style={{ fontFamily: "var(--font-pixel), monospace" }}
          >
            Reference
          </button>
        </div>
        <pre className="text-xs font-mono text-canopy bg-[#071009] p-3 overflow-x-auto border border-[#132a20] whitespace-pre">
          {(tab === "user" ? analysis.user_plan : analysis.reference_plan) ?? "— no plan available —"}
        </pre>
      </div>

      {/* Optimization advice */}
      <div className="panel p-5 mt-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="font-pixel text-[10px] text-gold">⚡ OPTIMIZATION</p>
          <button type="button" onClick={runOptimize} disabled={optimizing} className="btn btn-gold text-[9px]">
            {optimizing ? "Analyzing..." : optimization ? "Re-analyze" : "Optimize my query"}
          </button>
        </div>

        {optError && <p className="text-heart text-sm">{optError}</p>}
        {optimizing && (
          <p className="text-canopy text-sm">
            Running your query and any rewrite in DuckDB, then asking the tutor to explain… (a few seconds)
          </p>
        )}

        {optimization && (
          <div className="flex flex-col gap-4">
            {(() => {
              const v = optimization.verdict;
              const meta =
                v === "significant_improvement"
                  ? { label: "SIGNIFICANT IMPROVEMENT POSSIBLE", color: "#fcd34d" }
                  : v === "minor_improvement"
                    ? { label: "MINOR IMPROVEMENT POSSIBLE", color: "#a9d6ff" }
                    : { label: "ALREADY OPTIMAL 🏆", color: "#7ed957" };
              return (
                <span className="font-pixel text-[10px]" style={{ color: meta.color }}>
                  {meta.label}
                </span>
              );
            })()}

            <p className="text-sm text-[color:var(--foreground)] leading-relaxed">{optimization.explanation}</p>

            {optimization.static_findings.length > 0 && (
              <div>
                <p className="font-pixel text-[9px] text-canopy mb-2">STATIC FINDINGS</p>
                <ul className="flex flex-col gap-1.5">
                  {optimization.static_findings.map((f, i) => (
                    <li key={i} className="text-sm text-canopy flex gap-2">
                      <span className="text-gold">▸</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {optimization.rewritten_query && (
              <div>
                <p className="font-pixel text-[9px] text-canopy mb-2">
                  SUGGESTED REWRITE{" "}
                  {optimization.verified ? (
                    <span className="text-grass">✔ verified (same result)</span>
                  ) : (
                    <span className="text-leaf">— unverified suggestion</span>
                  )}
                </p>
                <pre className="text-xs font-mono text-grass bg-[#071009] p-3 overflow-x-auto border border-[#132a20] whitespace-pre-wrap">
                  {optimization.rewritten_query}
                </pre>
              </div>
            )}

            {optimization.verified && optimization.rewritten_runtime_ms != null && (
              <RuntimeBars
                user={optimization.user_runtime_ms}
                reference={optimization.rewritten_runtime_ms}
                labelA="Your query"
                labelB="Rewrite"
              />
            )}
          </div>
        )}
      </div>

      {/* Attempt history */}
      <div className="panel p-5 mt-5">
        <p className="font-pixel text-[10px] text-canopy mb-3">ATTEMPT HISTORY</p>
        {analysis.attempts.length === 0 ? (
          <p className="text-sm text-leaf">No attempts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-canopy text-xs">
                  <th className="text-left py-1 pr-4">#</th>
                  <th className="text-left py-1 pr-4">Result</th>
                  <th className="text-left py-1 pr-4">Runtime</th>
                  <th className="text-left py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {analysis.attempts.map((a, i) => (
                  <tr key={a.id} className="border-t border-[#132a20]">
                    <td className="py-1.5 pr-4 text-leaf">{analysis.attempts.length - i}</td>
                    <td className="py-1.5 pr-4">
                      {a.passed ? (
                        <span className="text-grass">✔ pass</span>
                      ) : (
                        <span className="text-heart">✘ fail</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-4 font-mono text-canopy">
                      {a.runtime_ms == null ? "—" : `${a.runtime_ms.toFixed(2)}ms`}
                    </td>
                    <td className="py-1.5 text-leaf">{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
