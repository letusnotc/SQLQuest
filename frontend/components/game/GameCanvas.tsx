"use client";

import { useEffect, useRef, useState } from "react";
import type { WorldLevel } from "./constants";

interface GameCanvasProps {
  levels: WorldLevel[];
  onEnterLevel: (levelId: string) => void;
  startLevelNumber?: number;
  completedLevels?: number[];
}

const DIFFICULTY_LABEL: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

export function GameCanvas({
  levels,
  onEnterLevel,
  startLevelNumber,
  completedLevels = [],
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedLevel, setFocusedLevel] = useState<WorldLevel | null>(null);
  const [ready, setReady] = useState(false);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);

  const completedSet = new Set(completedLevels);
  const isLocked = (lvl: WorldLevel) => lvl.level_number > 1 && !completedSet.has(lvl.level_number - 1);

  useEffect(() => {
    let destroyed = false;
    let gameInstance: import("phaser").Game | null = null;

    async function boot() {
      const [{ default: Phaser }, { WorldScene, LEVEL_SELECT_EVENT, LEVEL_FOCUS_EVENT, LEVEL_LOCKED_EVENT }] =
        await Promise.all([import("phaser"), import("./scenes/WorldScene")]);

      if (destroyed || !containerRef.current) return;

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        pixelArt: true,
        roundPixels: true,
        backgroundColor: "#aedecb",
        // The game has no sound — disable Web Audio so Phaser doesn't create an
        // audio context that throws "Cannot resume a context that has been
        // closed" when the canvas is destroyed on navigation.
        audio: { noAudio: true },
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 900 }, debug: false },
        },
        scale: {
          // Fixed 2:1 world resolution, scaled to fit whatever box the canvas
          // sits in (laptop / monitor / mobile) with no overflow or empty gaps.
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: 832,
          height: 416,
        },
        scene: [WorldScene],
      });

      game.scene.start("World", { levels, startLevelNumber, completedLevels });

      game.events.on(LEVEL_FOCUS_EVENT, (level: WorldLevel | null) => {
        setFocusedLevel(level);
      });
      game.events.on(LEVEL_SELECT_EVENT, (levelId: string) => {
        onEnterLevel(levelId);
      });
      game.events.on(LEVEL_LOCKED_EVENT, (requiredLevel: number) => {
        setLockedMsg(`🔒 Complete level ${requiredLevel} first to unlock this one.`);
        setTimeout(() => setLockedMsg(null), 2800);
      });

      gameInstance = game;
      setReady(true);
    }

    boot();

    return () => {
      destroyed = true;
      gameInstance?.destroy(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, startLevelNumber, completedLevels]);

  return (
    <div className="relative w-full max-w-7xl mx-auto">
      <div
        ref={containerRef}
        className="w-full aspect-[2/1] max-h-[86vh] pixel-border overflow-hidden bg-[#aedecb]"
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
          <p className="font-pixel text-xs text-emerald-400">LOADING WORLD...</p>
        </div>
      )}
      {focusedLevel && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/90 pixel-border px-4 py-3 text-center max-w-md">
          <p className="font-pixel text-[10px] text-emerald-400 mb-1">
            LEVEL {focusedLevel.level_number} · {DIFFICULTY_LABEL[focusedLevel.difficulty]}
            {focusedLevel.is_boss ? " · BOSS" : ""}
          </p>
          {isLocked(focusedLevel) ? (
            <p className="text-sm text-slate-300">
              🔒 Locked — complete level {focusedLevel.level_number - 1} first
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-200 mb-2">{focusedLevel.question_text}</p>
              <p className="text-xs text-slate-400">Press ENTER or ↑ to start</p>
            </>
          )}
        </div>
      )}
      {lockedMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-slate-950/90 pixel-border px-4 py-2 text-sm text-slate-100">
          {lockedMsg}
        </div>
      )}
      <div className="absolute top-3 right-3 bg-slate-950/80 pixel-border px-3 py-2 text-xs text-slate-300">
        ← → move · SHIFT run · ↑ jump · ENTER enter level
      </div>
    </div>
  );
}
