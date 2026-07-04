"use client";

import { useState } from "react";
import type { TablePreview } from "@/lib/api";

const MAX_VISIBLE_COLS = 6;

function TableCard({ table }: { table: TablePreview }) {
  const [showAllCols, setShowAllCols] = useState(false);
  const [columnsModal, setColumnsModal] = useState(false);

  const truncated = table.columns.length > MAX_VISIBLE_COLS;
  const visibleCols = showAllCols ? table.columns : table.columns.slice(0, MAX_VISIBLE_COLS);
  const visibleIdx = visibleCols.map((c) => table.columns.indexOf(c));

  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="font-pixel text-[10px] text-grass truncate">▦ {table.name}</span>
        <button
          type="button"
          onClick={() => setColumnsModal(true)}
          className="btn-ghost text-[9px] px-2 py-1 shrink-0"
          style={{ fontFamily: "var(--font-pixel), monospace" }}
        >
          Columns ({table.columns.length})
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col}
                  className="text-left px-2 py-1 border border-[#071009] bg-[#071009] text-canopy whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
              {truncated && !showAllCols && (
                <th className="px-2 py-1 border border-[#071009] bg-[#071009] text-leaf">
                  <button type="button" onClick={() => setShowAllCols(true)} className="hover:text-grass">
                    +{table.columns.length - MAX_VISIBLE_COLS}…
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="odd:bg-[#0c1d16]">
                {visibleIdx.map((ci) => (
                  <td
                    key={ci}
                    className="px-2 py-1 border border-[#132a20] text-[color:var(--foreground)] whitespace-nowrap max-w-[160px] truncate"
                    title={row[ci] ?? "NULL"}
                  >
                    {row[ci] === null ? <span className="text-leaf italic">NULL</span> : row[ci]}
                  </td>
                ))}
                {truncated && !showAllCols && <td className="border border-[#132a20] text-leaf px-2">…</td>}
              </tr>
            ))}
            {table.rows.length === 0 && (
              <tr>
                <td className="px-2 py-2 text-leaf" colSpan={visibleCols.length}>
                  (no rows)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAllCols && truncated && (
        <button type="button" onClick={() => setShowAllCols(false)} className="text-[10px] text-leaf mt-2 hover:text-grass">
          Show fewer columns
        </button>
      )}

      {columnsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040a06]/80 p-4"
          onClick={() => setColumnsModal(false)}
        >
          <div className="panel p-5 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-pixel text-[10px] text-grass">{table.name} — columns</span>
              <button type="button" onClick={() => setColumnsModal(false)} className="text-canopy hover:text-grass">
                ✕
              </button>
            </div>
            <ol className="flex flex-col gap-1">
              {table.columns.map((col, i) => (
                <li key={col} className="text-sm text-canopy flex gap-2">
                  <span className="text-leaf w-6 text-right">{i + 1}.</span>
                  <span className="text-[color:var(--foreground)] font-mono">{col}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export function DataPreview({ tables }: { tables: TablePreview[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-pixel text-[10px] text-canopy">DATA PREVIEW · first 10 rows</p>
      {tables.map((t) => (
        <TableCard key={t.name} table={t} />
      ))}
    </div>
  );
}
