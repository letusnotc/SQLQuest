"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getToken } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Mode = "nudge" | "teach" | "explain";
interface Message {
  role: "you" | "sage";
  text: string;
}

const MODE_LABEL: Record<Mode, string> = {
  nudge: "Nudge me",
  teach: "Teach me",
  explain: "Explain my query",
};

export function TutorDrawer({ levelId }: { levelId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("nudge");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(selectedMode: Mode, message: string | null) {
    if (streaming) return;
    setStreaming(true);

    const userLabel =
      message ?? (selectedMode === "explain" ? "Explain my last query" : MODE_LABEL[selectedMode]);
    setMessages((m) => [...m, { role: "you", text: userLabel }, { role: "sage", text: "" }]);

    try {
      const res = await fetch(`${API}/levels/${levelId}/tutor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ mode: selectedMode, message }),
      });
      if (!res.ok || !res.body) {
        throw new Error("no stream");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "sage", text: copy[copy.length - 1].text + chunk };
          return copy;
        });
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "sage", text: "Sorry, I couldn't reach the tutor. Try again." };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleSend() {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    void ask(mode, msg);
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-30 btn btn-gold flex items-center gap-2"
          aria-label="Open tutor"
        >
          🦉 Ask Sage
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-40 h-full w-full max-w-sm panel border-r-0 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b-2 border-[#071009]">
              <span className="pixel-title text-xs">🦉 SAGE</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close tutor"
                className="text-canopy hover:text-grass text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-1 p-3 border-b-2 border-[#071009]">
              {(["nudge", "teach"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`text-[9px] px-2 py-1.5 border-2 border-[#071009] flex-1 ${
                    mode === m ? "bg-grass-dark text-[#071009]" : "bg-[#071009] text-canopy"
                  }`}
                  style={{ fontFamily: "var(--font-pixel), monospace" }}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void ask("explain", null)}
                disabled={streaming}
                className="text-[9px] px-2 py-1.5 border-2 border-[#071009] flex-1 bg-[#071009] text-gold hover:text-[#fde28a]"
                style={{ fontFamily: "var(--font-pixel), monospace" }}
              >
                Explain
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && (
                <p className="text-canopy text-sm">
                  I&apos;m Sage 🦉 — pick <b>Nudge me</b> for a hint, <b>Teach me</b> to learn the concept, or{" "}
                  <b>Explain</b> to break down your last query. You can also just type a question below.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm p-3 border-2 border-[#071009] ${
                    m.role === "you" ? "bg-grass-dark text-[#071009] self-end" : "bg-[#071009] text-canopy self-start"
                  } max-w-[90%] whitespace-pre-wrap`}
                >
                  {m.text || (streaming ? "…" : "")}
                </div>
              ))}
            </div>

            <div className="p-3 border-t-2 border-[#071009] flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={`Ask Sage (${MODE_LABEL[mode]})…`}
                className="input flex-1 text-sm"
              />
              <button type="button" onClick={handleSend} disabled={streaming} className="btn px-3">
                ➤
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
