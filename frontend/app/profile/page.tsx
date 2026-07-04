"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, clearToken, type Profile } from "@/lib/api";

const difficultyColor: Record<string, string> = {
  bronze: "text-[#cd8032]",
  silver: "text-[#c0c8d0]",
  gold: "text-gold",
  platinum: "text-[#a9d6ff]",
};
const TIERS = ["bronze", "silver", "gold", "platinum"];

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel p-4 text-center">
      <p className="font-pixel text-base" style={{ color: accent ?? "#7ed957" }}>
        {value}
      </p>
      <p className="text-xs text-canopy mt-1">{label}</p>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<Profile>("/auth/me/profile");
    setProfile(res.data);
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
        setError("Could not load your profile.");
      }
    }
    void run();
  }, [router, load]);

  function logout() {
    clearToken();
    router.push("/login");
  }

  if (!profile) {
    return (
      <main className="flex-1 flex items-center justify-center pt-16">
        <p className="text-canopy font-pixel text-xs">{error ?? "Loading..."}</p>
      </main>
    );
  }

  const joined = new Date(profile.created_at).toLocaleDateString();
  const accuracyPct = Math.round(profile.accuracy * 100);

  return (
    <main className="flex-1 pt-24 px-4 pb-12 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="panel p-6 flex items-center gap-5 flex-wrap">
        <div className="w-16 h-16 flex items-center justify-center bg-[#071009] border-4 border-[#071009] shrink-0" style={{ boxShadow: "inset 0 0 0 2px #7ed957" }}>
          <span className="text-3xl">🧑‍🌾</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="pixel-title text-lg truncate">{profile.display_name}</h1>
          <p className="text-canopy text-sm truncate">{profile.email}</p>
          <p className="text-leaf text-xs mt-1">Adventuring since {joined}</p>
        </div>
        <button type="button" onClick={logout} className="btn btn-ghost">
          Log out
        </button>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
        <Stat label="Total XP" value={`${profile.xp}`} accent="#fcd34d" />
        <Stat label="Day streak" value={`${profile.current_streak}🔥`} accent="#ef5350" />
        <Stat label="Levels solved" value={`${profile.levels_solved}/${profile.total_levels}`} />
        <Stat label="Badges" value={`${profile.badges_earned}/${profile.badges_total}`} accent="#a9d6ff" />
      </div>

      {/* Consolidated query analysis */}
      <div className="panel p-6 mt-5">
        <p className="font-pixel text-[10px] text-canopy mb-4">📊 QUERY ANALYSIS · all worlds</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <div>
            <p className="text-canopy text-xs">Worlds played</p>
            <p className="text-[color:var(--foreground)] text-lg">{profile.worlds}</p>
          </div>
          <div>
            <p className="text-canopy text-xs">Queries submitted</p>
            <p className="text-[color:var(--foreground)] text-lg">{profile.total_attempts}</p>
          </div>
          <div>
            <p className="text-canopy text-xs">Correct queries</p>
            <p className="text-[color:var(--foreground)] text-lg">{profile.passed_attempts}</p>
          </div>
          <div>
            <p className="text-canopy text-xs">Accuracy</p>
            <p className="text-grass text-lg">{accuracyPct}%</p>
          </div>
          <div>
            <p className="text-canopy text-xs">Avg runtime</p>
            <p className="text-[color:var(--foreground)] text-lg">
              {profile.avg_runtime_ms == null ? "—" : `${profile.avg_runtime_ms.toFixed(2)}ms`}
            </p>
          </div>
          <div>
            <p className="text-canopy text-xs">Fastest query</p>
            <p className="text-gold text-lg">
              {profile.best_runtime_ms == null ? "—" : `${profile.best_runtime_ms.toFixed(2)}ms`}
            </p>
          </div>
        </div>

        {/* Accuracy bar */}
        <div className="mt-5">
          <div className="h-4 bg-[#071009] border-2 border-[#071009] overflow-hidden">
            <div className="h-full bg-grass" style={{ width: `${accuracyPct}%` }} />
          </div>
        </div>
      </div>

      {/* Mastery by tier */}
      <div className="panel p-6 mt-5">
        <p className="font-pixel text-[10px] text-canopy mb-4">🏅 MASTERY BY TIER</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {TIERS.map((tier) => (
            <div key={tier} className="text-center">
              <p className={`font-pixel text-lg ${difficultyColor[tier]}`}>
                {profile.solved_by_difficulty[tier] ?? 0}
              </p>
              <p className="text-xs text-canopy capitalize mt-1">{tier}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
