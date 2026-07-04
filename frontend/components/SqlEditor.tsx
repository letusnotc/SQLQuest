"use client";

import Editor from "@monaco-editor/react";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
}

export function SqlEditor({ value, onChange, height = 280 }: SqlEditorProps) {
  return (
    <div className="border-[3px] border-[#071009] overflow-hidden" style={{ height }}>
      <Editor
        height="100%"
        defaultLanguage="sql"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        loading={<div className="p-3 text-canopy text-sm">Loading editor…</div>}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "var(--font-mono), monospace",
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          padding: { top: 10, bottom: 10 },
          tabSize: 2,
          renderLineHighlight: "line",
          suggestOnTriggerCharacters: true,
        }}
      />
    </div>
  );
}
