import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("sqlquest_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export interface User {
  id: string;
  email: string;
  display_name: string;
  xp: number;
  hearts: number;
  current_streak: number;
}

export interface Dataset {
  id: string;
  name: string;
  schema_profile: {
    tables: { name: string; row_count: number; columns: unknown[]; sample_rows: unknown[] }[];
    relationships: unknown[];
  };
  created_at: string;
}

export interface Level {
  id: string;
  dataset_id: string;
  level_number: number;
  difficulty: "bronze" | "silver" | "gold" | "platinum";
  concept_tags: string[];
  question_text: string;
  hint_progression: string[];
  is_boss: boolean;
  created_at: string;
}

export interface TablePreview {
  name: string;
  columns: string[];
  rows: (string | null)[][];
}

export interface DatasetPreview {
  tables: TablePreview[];
}

export interface Attempt {
  id: string;
  query_text: string;
  passed: boolean;
  runtime_ms: number | null;
  error_message: string | null;
  row_count: number | null;
  created_at: string;
}

export interface Analysis {
  level_number: number;
  difficulty: string;
  question_text: string;
  reference_sql: string;
  reference_runtime_ms: number | null;
  reference_plan: string | null;
  user_query: string | null;
  user_runtime_ms: number | null;
  user_plan: string | null;
  last_passed: boolean | null;
  attempts: Attempt[];
}

export interface Profile {
  display_name: string;
  email: string;
  created_at: string;
  xp: number;
  hearts: number;
  current_streak: number;
  worlds: number;
  total_levels: number;
  levels_solved: number;
  total_attempts: number;
  passed_attempts: number;
  accuracy: number;
  badges_earned: number;
  badges_total: number;
  avg_runtime_ms: number | null;
  best_runtime_ms: number | null;
  solved_by_difficulty: Record<string, number>;
}

export interface LeaderboardEntry {
  rank: number;
  display_name: string;
  xp: number;
  current_streak: number;
  is_me: boolean;
}

export interface GlobalLeaderboard {
  entries: LeaderboardEntry[];
  my_rank: number;
  my_xp: number;
}

export interface ProgressLevel {
  level_id: string;
  level_number: number;
  difficulty: string;
  is_boss: boolean;
  attempts: number;
  passed: boolean;
  best_runtime_ms: number | null;
}

export interface WorldProgress {
  dataset_name: string;
  total_levels: number;
  solved_levels: number;
  levels: ProgressLevel[];
}

export interface BadgeDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
}

export interface Optimization {
  verdict: "optimal" | "minor_improvement" | "significant_improvement";
  explanation: string;
  static_findings: string[];
  rewritten_query: string | null;
  user_runtime_ms: number | null;
  rewritten_runtime_ms: number | null;
  verified: boolean;
}

export function saveToken(token: string) {
  window.localStorage.setItem("sqlquest_token", token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("sqlquest_token");
}

export function clearToken() {
  window.localStorage.removeItem("sqlquest_token");
}
