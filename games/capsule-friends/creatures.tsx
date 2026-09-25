"use client";

/**
 * Capsule Friends - procedural collectible artwork.
 *
 * Every Capsule Friend is drawn from a deterministic 16x16 symmetric "genome"
 * derived from its outcome index. Nothing is fetched: the album art is generated
 * in the sandbox, so it loads instantly and works offline. The player's own Rare
 * Friend keeps its canonical on-chain pixels (rendered separately in index.tsx).
 */

import { useEffect, useRef } from "react";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type RarityStyle = Readonly<{
  label: string;
  body: string;
  shade: string;
  accent: string;
  glow: string;
  ink: string;
}>;

export const RARITY: Readonly<Record<Rarity, RarityStyle>> = Object.freeze({
  common: { label: "Common", body: "#9aa4b2", shade: "#3c4654", accent: "#d3dbe6", glow: "#e2e8f0", ink: "#111827" },
  uncommon: { label: "Uncommon", body: "#37c98b", shade: "#0f6b4a", accent: "#a4f2ce", glow: "#86efac", ink: "#062f20" },
  rare: { label: "Rare", body: "#3fa9f5", shade: "#0b4f86", accent: "#b3ddff", glow: "#7dd3fc", ink: "#062a47" },
  epic: { label: "Epic", body: "#b06cf0", shade: "#57208f", accent: "#e2c6ff", glow: "#d8b4fe", ink: "#2c0a4d" },
  legendary: { label: "Legendary", body: "#f5b942", shade: "#8a5300", accent: "#ffe8a8", glow: "#fde68a", ink: "#3d2400" },
});

export const RARITY_ORDER: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

/** Per-item flavour text. Index matches game.json outcome order. */
export const CREATURE_BLURB: readonly string[] = [
  "A sleepy stone pal that naps in the warm shade.",
  "Dust-winged drifter, fond of lamplight.",
  "A wobbling jelly droplet. Do not shake.",
  "Wind-up scrapper assembled from spare bolts.",
  "Garden nibbler with an appetite for tidy lawns.",
  "A buzzing fuzzball charged with static.",
  "Hearth-warmed cub that hoards warm pebbles.",
  "Chill pond skater with frosted fins.",
  "Tiny storm runner, all speed and no brakes.",
  "Bubble hopper from the shallow tide.",
  "Dusk fluttering moth with velvet wings.",
  "A light-splitting gem that hums softly.",
  "Empty-shelled guardian of quiet places.",
  "A living lattice, still deciding its shape.",
  "Beautifully lopsided and proud of it.",
  "A pocket titan with very small ambitions.",
  "Many-faced seer. Answers only in riddles.",
  "An echo of the very first generation.",
  "A golden skeleton. Rarer than it looks.",
  "The first friend. It remembers everyone.",
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a 16x16 creature mask. Characters:
 *   B body, A accent/belly, S outline, W eye white, K pupil, . empty
 */
export function creatureMask(seed: number): string[] {
  const rand = mulberry32(seed * 2654435761 + 0x9e3779b9);
  const size = 16;
  const grid: string[][] = Array.from({ length: size }, () => Array<string>(size).fill("."));

  const cx = 7.5;
  const cy = 8 + Math.floor(rand() * 2);
  const rx = 4.5 + rand() * 2.2;
  const ry = 4.2 + rand() * 1.6;

  const inside = (x: number, y: number) => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };

  // Body fill.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inside(x, y)) grid[y][x] = "B";
    }
  }

  // Feet (symmetric).
  const footY = Math.min(size - 1, Math.round(cy + ry));
  for (const x of [Math.round(cx) - 2, Math.round(cx) + 1]) {
    if (x >= 0 && x < size && footY < size) grid[footY][x] = "S";
  }

  // Ears / antennae (symmetric, mirrored exactly).
  const style = Math.floor(rand() * 3);
  const topY = Math.max(0, Math.round(cy - ry));
  if (style === 0) {
    for (const x of [3, 4, 11, 12]) for (let y = topY - 2; y < topY; y++) if (y >= 0) grid[y][x] = "S";
    for (const x of [3, 4, 11, 12]) if (topY - 2 >= 0) grid[topY - 2][x] = "A";
  } else if (style === 1) {
    for (const x of [5, 10]) for (let y = topY - 3; y < topY; y++) if (y >= 0) grid[y][x] = "B";
    if (topY - 3 >= 0) {
      grid[topY - 3][5] = "A";
      grid[topY - 3][10] = "A";
    }
  }

  // Belly accent patch.
  if (rand() > 0.35) {
    for (let y = Math.round(cy); y <= Math.round(cy + ry) - 1; y++) {
      for (let x = Math.round(cx) - 1; x <= Math.round(cx); x++) {
        if (grid[y]?.[x] === "B") grid[y][x] = "A";
      }
    }
  }

  // Eyes (2x2 white + pupil), mirrored around the 7.5 centre.
  const eyeY = Math.max(1, Math.round(cy - ry * 0.45));
  const eyeLeft = 3 + Math.floor(rand() * 2); // columns 3..4 (mirror 12..11)
  const eyes = [
    [eyeLeft, eyeY],
    [size - 1 - (eyeLeft + 1), eyeY],
  ] as const;
  for (const [ex, ey] of eyes) {
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) if (grid[ey + dy]) grid[ey + dy][ex + dx] = "W";
  }
  const pupilOffset = rand() > 0.5 ? 0 : 1;
  for (const [ex, ey] of eyes) {
    const px = ex + pupilOffset;
    const py = ey + (rand() > 0.5 ? 0 : 1);
    if (grid[py]?.[px] === "W") grid[py][px] = "K";
  }

  // Mouth.
  const mouthY = Math.min(size - 1, eyeY + 3);
  for (let x = Math.round(cx) - 1; x <= Math.round(cx); x++) if (grid[mouthY]?.[x] === "B" || grid[mouthY]?.[x] === "A") grid[mouthY][x] = "S";

  // Outline pass: any empty cell touching a body cell becomes outline.
  const bodyish = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && ["B", "A", "W", "K"].includes(grid[y][x]);
  const outline: Array<[number, number]> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x] !== ".") continue;
      if (bodyish(x - 1, y) || bodyish(x + 1, y) || bodyish(x, y - 1) || bodyish(x, y + 1)) outline.push([x, y]);
    }
  }
  for (const [x, y] of outline) grid[y][x] = "S";

  return grid.map(row => row.join(""));
}

const CHAR_COLOR: Readonly<Record<string, keyof RarityStyle>> = Object.freeze({
  B: "body",
  A: "accent",
  S: "shade",
  W: "body",
  K: "ink",
});

/** Pixel canvas that renders one Capsule Friend. */
export function Creature({ seed, rarity, size = 64, title }: { seed: number; rarity: Rarity; size?: number; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const palette = RARITY[rarity];
    const rows = creatureMask(seed);
    const scale = 1; // canvas backing store is 16x16, CSS scales it up crisply.
    canvas.width = 16;
    canvas.height = 16;
    context.clearRect(0, 0, 16, 16);
    context.imageSmoothingEnabled = false;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const char = rows[y][x];
        if (char === ".") continue;
        let color: string;
        if (char === "W") color = "#ffffff";
        else color = palette[CHAR_COLOR[char]];
        context.fillStyle = color;
        context.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }, [seed, rarity]);
  return <canvas ref={ref} className="capsule-creature" width={16} height={16} style={{ width: size, height: size, imageRendering: "pixelated" }} role="img" aria-label={title ?? "Capsule Friend"} />;
}

/** The player's canonical Rare Friend pixels, drawn with the SDK's halo treatment. */
export function FriendPortrait({ rows, size = 160, className = "", label = "Your Rare Friend" }: { rows: readonly string[]; size?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = 16;
    canvas.height = 16;
    context.clearRect(0, 0, 16, 16);
    context.imageSmoothingEnabled = false;
    const pixels = rows.flatMap((row, py) => [...row].flatMap((pixel, px) => (pixel === "#" ? [[px, py] as const] : [])));
    // White one-pixel halo behind the black mask, matching the SDK renderer.
    context.save();
    context.beginPath();
    context.rect(0, 0, 16, 16);
    context.clip();
    context.fillStyle = "#ffffff";
    for (const [px, py] of pixels) context.fillRect(px - 1, py - 1, 3, 3);
    context.fillStyle = "#111111";
    for (const [px, py] of pixels) context.fillRect(px, py, 1, 1);
    context.restore();
  }, [rows]);
  return <canvas ref={ref} className={`capsule-friend ${className}`} style={{ width: size, height: size, imageRendering: "pixelated" }} role="img" aria-label={label} />;
}
