"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, saveToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      saveToken(res.data.access_token);
      router.push("/dashboard");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm panel p-7 flex flex-col gap-4">
        <div className="text-center mb-2">
          <h1 className="pixel-title text-lg">SQLQUEST</h1>
          <p className="text-canopy text-xs mt-2">Enter the jungle</p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm text-canopy">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-canopy">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </label>
        {error && <p className="text-heart text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="btn mt-2 w-full">
          {loading ? "Logging in..." : "Log in"}
        </button>
        <p className="text-sm text-canopy text-center">
          No account?{" "}
          <Link href="/register" className="text-grass hover:underline">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
