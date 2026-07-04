export const TILE_SIZE = 16;
export const MAP_SCALE = 2;

export const DUDE_FRAME_WIDTH = 16;
export const DUDE_FRAME_HEIGHT = 25;
export const ENEMY_FRAME_WIDTH = 21;
export const ENEMY_FRAME_HEIGHT = 22;
export const BAT_FRAME_WIDTH = 20;
export const BAT_FRAME_HEIGHT = 32;
export const COIN_FRAME_WIDTH = 16;
export const COIN_FRAME_HEIGHT = 16;

// Frame sets for /game/dude/sprites/dude_spritesheet.png (4 cols x 3 rows @ 16x25)
export const DUDE_ANIM = {
  walk: [0, 1, 2, 3],
  damaged: [4, 5, 6, 7],
  idle: 0,
};

// Green goblin enemy walk cycle (from the original Dude-SideScroll Enemy.ts)
export const ENEMY_ANIM = {
  walk: [4, 3, 2, 3, 4, 1, 0, 1],
};

export const BAT_ANIM = {
  fly: [0, 1, 2, 3],
};

// Sky colour behind the parallax, shifting subtly per difficulty tier
export const DIFFICULTY_SKY: Record<string, number> = {
  bronze: 0x9fd3b8,
  silver: 0x9fc3d3,
  gold: 0xd3c39f,
  platinum: 0xb8a9d3,
};

// Each SQL level occupies this much world width (already in 2x-scaled space)
export const LEVEL_SPACING = 520;
export const LEVEL_START_X = 260;

// Procedurally-generated jungle terrain (guaranteed traversable — no walls/pits
// that can trap the player). Tile indices are 0-based into jungle_tileset.png.
export const TERRAIN = {
  rows: 14,
  baseGroundRow: 10, // grass-top row for flat stretches
  grassTop: 42, // solid grass tile in jungle_tileset (0-based frame index)
  dirtFill: 119, // solid dark-earth tile
};

export interface WorldLevel {
  id: string;
  level_number: number;
  difficulty: "bronze" | "silver" | "gold" | "platinum";
  question_text: string;
  is_boss: boolean;
}
