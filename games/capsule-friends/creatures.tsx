"use client";

/**
 * Capsule Friends - artwork.
 *
 * Capsule Friends are deterministic 16x16 pixel masks (same treatment as the
 * canonical Rare Friends sprites), padded to the SDK's 24x16 item-art frame so
 * `ItemArt` and `RewardReveal` can draw them. The capsule machine is hand-drawn
 * line art, matching the Rare Friends paper/ink look.
 */

import { useEffect, useRef } from "react";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Rarity per game.json outcome index (1-based outcome IDs). */
export const CAPSULE_RARITIES: readonly Rarity[] = [
  ...Array<Rarity>(6).fill("common"),
  ...Array<Rarity>(5).fill("uncommon"),
  ...Array<Rarity>(4).fill("rare"),
  ...Array<Rarity>(3).fill("epic"),
  ...Array<Rarity>(2).fill("legendary"),
];

export const CAPSULE_BLURB: readonly string[] = [
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

const IDS: readonly string[] = [
  "pebblin", "moff", "bloop", "tinkertot", "mossnip", "buzzle",
  "emberkit", "frostfin", "galehoof", "tideling", "duskmoth",
  "prismlet", "hollowpup", "cellulo", "asymmetra",
  "colossling", "maskoracle", "genesium",
  "aurum-frame", "rare-genesis",
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

/** Build a deterministic 16x16 creature mask. Characters: B body, A accent, S outline, W eye, K pupil, . empty. */
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
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (inside(x, y)) grid[y][x] = "B";

  const footY = Math.min(size - 1, Math.round(cy + ry));
  for (const x of [Math.round(cx) - 2, Math.round(cx) + 1]) if (x >= 0 && x < size && footY < size) grid[footY][x] = "S";

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

  if (rand() > 0.35) {
    for (let y = Math.round(cy); y <= Math.round(cy + ry) - 1; y++) {
      for (let x = Math.round(cx) - 1; x <= Math.round(cx); x++) if (grid[y]?.[x] === "B") grid[y][x] = "A";
    }
  }

  const eyeY = Math.max(1, Math.round(cy - ry * 0.45));
  const eyeLeft = 3 + Math.floor(rand() * 2);
  const eyes = [[eyeLeft, eyeY], [size - 1 - (eyeLeft + 1), eyeY]] as const;
  for (const [ex, ey] of eyes) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) if (grid[ey + dy]) grid[ey + dy][ex + dx] = "W";
  const pupilOffset = rand() > 0.5 ? 0 : 1;
  for (const [ex, ey] of eyes) {
    const px = ex + pupilOffset;
    const py = ey + (rand() > 0.5 ? 0 : 1);
    if (grid[py]?.[px] === "W") grid[py][px] = "K";
  }

  const mouthY = Math.min(size - 1, eyeY + 3);
  for (let x = Math.round(cx) - 1; x <= Math.round(cx); x++) if (grid[mouthY]?.[x] === "B" || grid[mouthY]?.[x] === "A") grid[mouthY][x] = "S";

  const bodyish = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && ["B", "A", "W", "K"].includes(grid[y][x]);
  const outline: Array<[number, number]> = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (grid[y][x] === "." && (bodyish(x - 1, y) || bodyish(x + 1, y) || bodyish(x, y - 1) || bodyish(x, y + 1))) outline.push([x, y]);
  for (const [x, y] of outline) grid[y][x] = "S";

  return grid.map(row => row.join(""));
}

/** Convert a 16x16 mask into the SDK's monochrome 24x16 item-art rows. */
export function capsuleRows(index: number): string[] {
  const mask = creatureMask(index + 1);
  return mask.map(row => `    ${[...row].map(char => (char === "." ? " " : "#")).join("")}    `);
}

export const CAPSULE_ART: readonly { id: string; rarity: Rarity; rows: string[] }[] = IDS.map((id, index) => ({
  id,
  rarity: CAPSULE_RARITIES[index],
  rows: capsuleRows(index),
}));

/** Pixel capsule used for the consumable choice. */
export const CAPSULE_ICON_ROWS: readonly string[] = [
  "                        ",
  "        ########        ",
  "      ##........##      ",
  "     #............#     ",
  "    #..............#    ",
  "    #..............#    ",
  "    #..............#    ",
  "    #..............#    ",
  "    #..............#    ",
  "    ################    ",
  "    ################    ",
  "    ################    ",
  "    ################    ",
  "                        ",
  "                        ",
  "                        ",
];

/** Line-art capsule machine. Purely decorative; shown as the activity/working art. */
export function CapsuleMachine({ ready = false }: { ready?: boolean }) {
  return (
    <svg className="cf-machine-art" viewBox="0 0 120 132" fill="none" stroke="currentColor" strokeWidth="2" shapeRendering="crispEdges" aria-hidden="true" data-ready={ready}>
      {/* glass dome */}
      <circle cx="60" cy="44" r="33" />
      <path d="M27 44h66M60 11v66" strokeDasharray="2 4" />
      {/* capsules inside */}
      <circle cx="46" cy="34" r="6" />
      <circle cx="70" cy="30" r="6" />
      <circle cx="60" cy="52" r="6" />
      <circle cx="38" cy="52" r="5" />
      <circle cx="80" cy="50" r="5" />
      {/* cabinet */}
      <rect x="22" y="77" width="76" height="50" />
      <rect x="30" y="85" width="30" height="16" />
      <path d="M34 93h22" />
      {/* chute */}
      <rect x="66" y="106" width="24" height="14" />
      {/* crank */}
      <circle cx="86" cy="92" r="7" />
      <path d="M86 92h12v-1M98 91v-6" />
      {ready && <path d="M18 20 5 12M102 20l13-8M6 44H0M114 44h6M20 70 8 78M100 70l12 8" />}
    </svg>
  );
}

/** The player's canonical Rare Friend pixels, drawn with the SDK's white halo. */
export function FriendPortrait({ rows, size = 150, className = "", label = "Your Rare Friend" }: { rows: readonly string[]; size?: number; className?: string; label?: string }) {
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
  return <canvas ref={ref} className={`cf-friend-pixels ${className}`.trim()} style={{ width: size, height: size, imageRendering: "pixelated" }} role="img" aria-label={label} />;
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m11 4-5 5H3v6h3l5 5z" />{muted ? <path d="m15 9 6 6m0-6-6 6" /> : <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</svg>;
}

export function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6" /></svg>;
}
