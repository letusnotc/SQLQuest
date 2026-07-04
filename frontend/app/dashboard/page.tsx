"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Dataset } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDatasets = useCallback(async () => {
    const res = await api.get<Dataset[]>("/datasets");
    setDatasets(res.data);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    async function run() {
      try {
        await loadDatasets();
      } catch {
        setError("Could not load datasets.");
      }
    }
    void run();
  }, [router, loadDatasets]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      await api.post("/datasets/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadDatasets();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ? `Upload failed: ${detail}` : "Upload failed. Make sure you selected CSV or Excel files.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <main className="flex-1 p-8 pt-24 max-w-4xl mx-auto w-full">
      <h1 className="pixel-title text-2xl mb-2">Your Worlds</h1>
      <p className="text-canopy text-sm mb-8">
        Upload a dataset and it becomes a playable jungle of SQL levels.
      </p>

      <label className="block mb-10 cursor-pointer w-fit">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          onChange={handleUpload}
          className="hidden"
        />
        <span className="btn btn-gold">
          {uploading ? "Uploading..." : "+ Upload dataset"}
        </span>
      </label>

      {error && <p className="text-heart mb-4">{error}</p>}

      {datasets === null && <p className="text-canopy font-pixel text-xs">Loading...</p>}
      {datasets?.length === 0 && (
        <div className="panel p-6 text-canopy">
          No worlds yet — upload a CSV or Excel file to grow your first jungle.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {datasets?.map((ds) => (
          <Link
            key={ds.id}
            href={`/datasets/${ds.id}/world`}
            className="panel p-5 hover:-translate-y-1 transition-transform group"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🌴</span>
              <h2 className="font-pixel text-xs text-grass group-hover:text-[#93e56d]">{ds.name}</h2>
            </div>
            <p className="text-sm text-canopy">
              {ds.schema_profile.tables.length} table(s) ·{" "}
              {ds.schema_profile.tables.reduce((acc, t) => acc + t.row_count, 0)} rows
            </p>
            <p className="text-xs text-leaf mt-3 font-pixel">ENTER WORLD →</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
