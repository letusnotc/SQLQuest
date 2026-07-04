import Phaser from "phaser";
import {
  TILE_SIZE,
  MAP_SCALE,
  DUDE_FRAME_WIDTH,
  DUDE_FRAME_HEIGHT,
  ENEMY_FRAME_WIDTH,
  ENEMY_FRAME_HEIGHT,
  BAT_FRAME_WIDTH,
  BAT_FRAME_HEIGHT,
  COIN_FRAME_WIDTH,
  COIN_FRAME_HEIGHT,
  DUDE_ANIM,
  ENEMY_ANIM,
  BAT_ANIM,
  LEVEL_SPACING,
  LEVEL_START_X,
  TERRAIN,
  type WorldLevel,
} from "../constants";

export const LEVEL_SELECT_EVENT = "sqlquest:level-select";
export const LEVEL_FOCUS_EVENT = "sqlquest:level-focus";
export const LEVEL_LOCKED_EVENT = "sqlquest:level-locked";

interface WorldSceneData {
  levels: WorldLevel[];
  startLevelNumber?: number;
  completedLevels?: number[];
}

const MOVE_SPEED = 150;
const RUN_SPEED = 230;
const JUMP_VELOCITY = -470;
const PROMPT_DISTANCE = 55;
const SKY_COLOR = 0xaedecb;
const TS = TILE_SIZE * MAP_SCALE; // scaled tile size (32px)

const PARALLAX_LAYERS = [
  { key: "plx-2", factor: 0.1, depth: -20 },
  { key: "plx-3", factor: 0.25, depth: -19 },
  { key: "plx-4", factor: 0.45, depth: -18 },
  { key: "plx-5", factor: 0.7, depth: -17 },
];

interface Enemy {
  sprite: Phaser.Physics.Arcade.Sprite;
  dir: 1 | -1;
  minX: number;
  maxX: number;
}

export class WorldScene extends Phaser.Scene {
  private levels: WorldLevel[] = [];
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D" | "SHIFT", Phaser.Input.Keyboard.Key>;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private enemies: Enemy[] = [];
  private nodeMarkers: { level: WorldLevel; x: number }[] = [];
  private parallax: { sprite: Phaser.GameObjects.TileSprite; factor: number }[] = [];
  private groundTopByCol: number[] = [];
  private groundSurfaceY = 0;
  private worldWidth = 0;
  private worldHeight = 0;
  private lastSafeX = 60;
  private nearestLevel: WorldLevel | null = null;
  private startLevelNumber = 0;
  private completed = new Set<number>();

  constructor() {
    super("World");
  }

  init(data: WorldSceneData) {
    this.levels = data.levels ?? [];
    this.startLevelNumber = data.startLevelNumber ?? 0;
    this.completed = new Set(data.completedLevels ?? []);
  }

  /** A level is playable only once the previous level has been completed. */
  private isUnlocked(level: WorldLevel): boolean {
    return level.level_number <= 1 || this.completed.has(level.level_number - 1);
  }

  preload() {
    this.load.spritesheet("jungle_tiles", "/game/dude/backgrounds/jungle_tileset.png", {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
    });
    for (const layer of PARALLAX_LAYERS) {
      this.load.image(layer.key, `/game/dude/backgrounds/${layer.key}.png`);
    }
    this.load.spritesheet("dude", "/game/dude/sprites/dude_spritesheet.png", {
      frameWidth: DUDE_FRAME_WIDTH,
      frameHeight: DUDE_FRAME_HEIGHT,
    });
    this.load.spritesheet("enemy", "/game/dude/sprites/enemy.png", {
      frameWidth: ENEMY_FRAME_WIDTH,
      frameHeight: ENEMY_FRAME_HEIGHT,
    });
    this.load.spritesheet("bat", "/game/dude/sprites/bat_spritesheet.png", {
      frameWidth: BAT_FRAME_WIDTH,
      frameHeight: BAT_FRAME_HEIGHT,
    });
    this.load.spritesheet("coin", "/game/dude/items/spr_coin_ama.png", {
      frameWidth: COIN_FRAME_WIDTH,
      frameHeight: COIN_FRAME_HEIGHT,
    });
  }

  create() {
    const neededWidth = LEVEL_START_X + this.levels.length * LEVEL_SPACING + LEVEL_SPACING;
    const cols = Math.ceil(neededWidth / TS) + 4;
    this.worldWidth = cols * TS;
    this.worldHeight = TERRAIN.rows * TS;
    this.groundSurfaceY = TERRAIN.baseGroundRow * TS;

    this.cameras.main.setBackgroundColor(SKY_COLOR);
    this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight + 400);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

    this.createAnimations();
    this.buildParallax();
    this.buildTerrain(cols);
    this.buildLevelNodes();
    this.buildEnemies();
    this.buildPlayer();

    this.physics.add.collider(this.player, this.ground);
    for (const enemy of this.enemies) {
      this.physics.add.collider(enemy.sprite, this.ground);
    }

    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.cameras.main.setDeadzone(140, 80);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        SHIFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      };
      const enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      enter.on("down", () => this.tryEnterLevel());
    }
  }

  private createAnimations() {
    const add = (key: string, sheet: string, frames: number[], rate: number) => {
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(sheet, { frames }),
          frameRate: rate,
          repeat: -1,
        });
      }
    };
    add("dude-walk", "dude", DUDE_ANIM.walk, 12);
    add("enemy-walk", "enemy", ENEMY_ANIM.walk, 10);
    add("bat-fly", "bat", BAT_ANIM.fly, 8);
    if (!this.anims.exists("coin-spin")) {
      this.anims.create({
        key: "coin-spin",
        frames: this.anims.generateFrameNumbers("coin", { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  private buildParallax() {
    const camW = this.scale.width;
    const camH = this.scale.height;
    for (const layer of PARALLAX_LAYERS) {
      const tex = this.textures.get(layer.key).getSourceImage();
      const scale = camH / tex.height;
      const sprite = this.add
        .tileSprite(0, 0, camW, camH, layer.key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(layer.depth);
      sprite.tileScaleX = scale;
      sprite.tileScaleY = scale;
      this.parallax.push({ sprite, factor: layer.factor });
    }
  }

  /**
   * Builds a rolling grassy jungle floor from explicitly-placed tiles (a static
   * physics group for the surface + decorative fill below). The ground is
   * continuous (never a bottomless pit) and only ever steps up or down by a
   * single tile, so the player can always walk/jump to every level. Terrain is
   * forced flat around each level node so markers sit on reachable ground.
   */
  private buildTerrain(cols: number) {
    const rows = TERRAIN.rows;
    const base = TERRAIN.baseGroundRow;
    this.ground = this.physics.add.staticGroup();

    // Columns that must stay flat (a window around every level node)
    const flatCols = new Set<number>();
    this.levels.forEach((_, i) => {
      const nodeCol = Math.round((LEVEL_START_X + i * LEVEL_SPACING) / TS);
      for (let c = nodeCol - 3; c <= nodeCol + 3; c++) flatCols.add(c);
    });

    let top = base;
    for (let c = 0; c < cols; c++) {
      if (!flatCols.has(c) && c > 4 && c % 6 === 0) {
        const step = Math.random() < 0.5 ? -1 : 1;
        top = Phaser.Math.Clamp(top + step, base - 2, base + 1);
      }
      if (flatCols.has(c)) top = base;
      this.groundTopByCol[c] = top;

      const cx = c * TS + TS / 2;

      // Surface tile — a real static body the player stands on / bumps into.
      const surface = this.ground.create(cx, top * TS + TS / 2, "jungle_tiles", TERRAIN.grassTop) as Phaser.Physics.Arcade.Sprite;
      surface.setScale(MAP_SCALE);
      surface.refreshBody();
      surface.setDepth(-4);

      // Decorative fill below (no collision needed — surface holds the player).
      for (let r = top + 1; r < rows; r++) {
        this.add.image(cx, r * TS + TS / 2, "jungle_tiles", TERRAIN.dirtFill).setScale(MAP_SCALE).setDepth(-5);
      }
    }
  }

  private buildEnemies() {
    // Space goblins between the level nodes, on flat-ish ground
    const count = Math.max(2, Math.floor(this.levels.length / 2));
    for (let i = 0; i < count; i++) {
      const x = LEVEL_START_X + LEVEL_SPACING * (i + 0.5) * (this.levels.length / Math.max(1, count));
      const col = Phaser.Math.Clamp(Math.round(x / TS), 2, this.groundTopByCol.length - 2);
      const groundY = this.groundTopByCol[col] * TS;
      this.spawnEnemy(col * TS, groundY - 40);
    }
  }

  private spawnEnemy(x: number, y: number) {
    const sprite = this.physics.add.sprite(x, y, "enemy", 0);
    sprite.setScale(1.8);
    sprite.play("enemy-walk");
    this.enemies.push({ sprite, dir: 1, minX: x - 100, maxX: x + 100 });
  }

  private buildLevelNodes() {
    this.levels.forEach((level, index) => {
      const x = LEVEL_START_X + index * LEVEL_SPACING;
      const y = this.groundSurfaceY - 80;
      const unlocked = this.isUnlocked(level);
      const done = this.completed.has(level.level_number);

      if (level.is_boss) {
        const boss = this.add.sprite(x, y - 24, "bat", 0);
        boss.setScale(2.4);
        boss.play("bat-fly");
        boss.setAlpha(unlocked ? 1 : 0.4);
        this.tweens.add({ targets: boss, y: boss.y - 16, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      } else {
        const coin = this.add.sprite(x, y, "coin", 0);
        coin.setScale(2.2);
        coin.play("coin-spin");
        coin.setAlpha(unlocked ? 1 : 0.35);
        this.tweens.add({ targets: coin, y: y - 10, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }

      // Lock icon over levels that aren't unlocked yet.
      if (!unlocked) {
        this.add.text(x, y - 4, "🔒", { fontSize: "22px" }).setOrigin(0.5).setDepth(51);
      } else if (done) {
        this.add.text(x, y - 4, "✓", { fontSize: "20px", color: "#7ed957" }).setOrigin(0.5).setDepth(51);
      }

      const label = this.add.text(x, y - 48, `${level.level_number}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: level.is_boss ? "#fecaca" : "#0f172a",
        backgroundColor: !unlocked ? "#334155" : level.is_boss ? "#7f1d1d" : "#fde047",
        padding: { x: 6, y: 3 },
      });
      label.setOrigin(0.5, 1).setDepth(50).setAlpha(unlocked ? 1 : 0.7);

      this.nodeMarkers.push({ level, x });
    });
  }

  private buildPlayer() {
    // Resume at the last completed level's node (fall back to the start).
    let spawnX = 60;
    if (this.startLevelNumber > 0) {
      const idx = this.levels.findIndex((l) => l.level_number === this.startLevelNumber);
      if (idx >= 0) spawnX = LEVEL_START_X + idx * LEVEL_SPACING;
    }
    this.lastSafeX = spawnX;

    this.player = this.physics.add.sprite(spawnX, this.groundSurfaceY - 60, "dude", DUDE_ANIM.idle);
    this.player.setScale(1.8);
    this.player.setBounce(0);
    this.player.setDragX(1400);
    this.player.setMaxVelocity(RUN_SPEED, 1200);
    this.player.setSize(DUDE_FRAME_WIDTH * 0.6, DUDE_FRAME_HEIGHT * 0.9);
    this.player.setOffset(DUDE_FRAME_WIDTH * 0.2, DUDE_FRAME_HEIGHT * 0.1);
  }

  update() {
    if (!this.player) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    const left = this.cursors?.left?.isDown || this.wasd?.A?.isDown;
    const right = this.cursors?.right?.isDown || this.wasd?.D?.isDown;
    const jump = this.cursors?.up?.isDown || this.wasd?.W?.isDown || this.cursors?.space?.isDown;
    const running = this.cursors?.shift?.isDown || this.wasd?.SHIFT?.isDown;
    const speed = running ? RUN_SPEED : MOVE_SPEED;

    if (left) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true);
      if (body.blocked.down) this.player.play("dude-walk", true);
    } else if (right) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false);
      if (body.blocked.down) this.player.play("dude-walk", true);
    } else {
      this.player.setVelocityX(0);
      if (body.blocked.down) {
        this.player.anims.stop();
        this.player.setFrame(DUDE_ANIM.idle);
      }
    }

    if (jump && body.blocked.down) {
      this.player.setVelocityY(JUMP_VELOCITY);
    }

    if (body.blocked.down) {
      this.lastSafeX = this.player.x;
    }

    if (this.player.y > this.worldHeight + 200) {
      this.player.setVelocity(0, 0);
      this.player.setPosition(this.lastSafeX, this.groundSurfaceY - 80);
    }

    this.updateEnemies();
    this.updateParallax();
    this.updateNearestLevel();
  }

  private updateEnemies() {
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;

      // Turn around at the patrol edges OR the moment a wall blocks the way,
      // so a goblin never wedges itself against a raised terrain step.
      if (enemy.sprite.x <= enemy.minX || body.blocked.left || body.touching.left) {
        enemy.dir = 1;
      }
      if (enemy.sprite.x >= enemy.maxX || body.blocked.right || body.touching.right) {
        enemy.dir = -1;
      }

      enemy.sprite.setVelocityX(70 * enemy.dir);
      enemy.sprite.setFlipX(enemy.dir === -1);
    }
  }

  private updateParallax() {
    const scrollX = this.cameras.main.scrollX;
    for (const layer of this.parallax) {
      layer.sprite.tilePositionX = scrollX * layer.factor;
    }
  }

  private updateNearestLevel() {
    let nearest: WorldLevel | null = null;
    let nearestDist = Infinity;
    for (const marker of this.nodeMarkers) {
      const dist = Math.abs(marker.x - this.player.x);
      if (dist < PROMPT_DISTANCE && dist < nearestDist) {
        nearest = marker.level;
        nearestDist = dist;
      }
    }
    if (nearest?.id !== this.nearestLevel?.id) {
      this.nearestLevel = nearest;
      this.game.events.emit(LEVEL_FOCUS_EVENT, nearest);
    }
  }

  private tryEnterLevel() {
    if (!this.nearestLevel) return;
    if (this.isUnlocked(this.nearestLevel)) {
      this.game.events.emit(LEVEL_SELECT_EVENT, this.nearestLevel.id);
    } else {
      this.game.events.emit(LEVEL_LOCKED_EVENT, this.nearestLevel.level_number - 1);
    }
  }
}
