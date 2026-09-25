# Capsule Friends

A Rare Friends gacha arcade. Your selected, verified Rare Friend runs the capsule
machine: load a capsule, crank it, and reveal one of twenty collectible Capsule
Friends across five rarity tiers. Keep them in your album or redeem them for
simulated RF.

FriendSDK **v0.1.2**, using the same canonical presentation as the SDK's fishing
example — `ExperiencePanel`, `RewardReveal`, `GameHud`, `ActivityPrompt` and
`GameMenu` — on a paper-and-ink theme: off-white paper, 1px black rules, pixel
artwork, and signal green (`#CCFF00`) reserved for the primary action and
rarity reveals. All balances, capsules, pulls and redemptions are **simulated
preview** values that belong to the selected Friend for the runtime session only.
An eligible hardwired Generations NFT (generation ≥ 1) on Robinhood mainnet is
still required to play.

## Run it

From the FriendSDK root:

```sh
npm ci
npm run dev:game -- games/capsule-friends
```

Open the printed URL (normally `http://localhost:4173`), connect a wallet on
Robinhood mainnet, and choose your owned Friend.

To play from a phone on the same network:

```sh
npm run dev:game -- games/capsule-friends -- --host 0.0.0.0 --port 4173
```

Then open `http://YOUR_COMPUTER_LAN_IP:4173` on the phone.

Build and verify:

```sh
node scripts/dev-game.mjs build games/capsule-friends
node scripts/dev-game.mjs check games/capsule-friends
node scripts/dev-game.mjs test  games/capsule-friends --screenshot ./artifacts/capsule-friends.png
```

## Controls

The scene shows your Rare Friend next to the capsule machine. Interact with the
machine chip (or the quick-bar on phones); menus handle everything else.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Capsule machine | `E` or `M` | Tap the **Capsule machine** chip / quick-bar |
| Crank ×10 | `X` (needs 10 capsules) | Tap **Crank ×10** |
| Capsule album | `C` | Tap the album button in the HUD |
| Odds | `O` | Settings → Odds |
| Settings (sound, reduce motion) | — | Settings button |

Inside the machine: choose a capsule → **Crank · 1 capsule** → **Open capsule**
→ **Keep friend** or **Redeem**. Cash out any time from the album.

## Rules

- One capsule costs **1 RF**. Loading a capsule reserves **10 RF** of backing
  (the highest prize) until it is opened; new loads pause when free backing runs
  out. This is the SDK's supplied chance-game accounting.
- Cranking opens exactly one capsule and reveals exactly one Capsule Friend. Each
  pull is independent: no pity timer, no reroll. **Crank ×10** opens ten at once
  in a single confirmed action.
- Keep a friend to add it to your album, or redeem it for its fixed RF value. Kept
  friends hold their value with no expiry. The album tracks unique friends
  (of 20) and total kept friends.
- Expected return is **0.901 RF** per 1 RF capsule (≈ **90.1%**). The remaining
  ≈ 9.9% is the community pool edge. Maximum prize is **10 RF**.

### Capsule Friends, odds and redemption values

| # | Capsule Friend | Rarity | Chance | Redemption |
| --: | --- | --- | --: | --: |
| 1 | Pebblin | common | 9.00% | 0.5 RF |
| 2 | Moff | common | 9.00% | 0.5 RF |
| 3 | Bloop | common | 9.00% | 0.5 RF |
| 4 | Tinkertot | common | 9.00% | 0.5 RF |
| 5 | Mossnip | common | 9.00% | 0.5 RF |
| 6 | Buzzle | common | 9.00% | 0.5 RF |
| 7 | Emberkit | uncommon | 5.70% | 0.6 RF |
| 8 | Frostfin | uncommon | 5.70% | 0.6 RF |
| 9 | Galehoof | uncommon | 5.70% | 0.6 RF |
| 10 | Tideling | uncommon | 5.70% | 0.6 RF |
| 11 | Duskmoth | uncommon | 5.70% | 0.6 RF |
| 12 | Prismlet | rare | 3.00% | 1.5 RF |
| 13 | Hollowpup | rare | 3.00% | 1.5 RF |
| 14 | Cellulo | rare | 3.00% | 1.5 RF |
| 15 | Asymmetra | rare | 3.00% | 1.5 RF |
| 16 | Colossling | epic | 1.50% | 4 RF |
| 17 | Maskoracle | epic | 1.50% | 4 RF |
| 18 | Genesium | epic | 1.50% | 4 RF |
| 19 | Aurum Frame | legendary | 0.50% | 10 RF |
| 20 | Rare Genesis | legendary | 0.50% | 10 RF |

Tier totals: common 54%, uncommon 28.5%, rare 12%, epic 4.5%, legendary 1%.
Weights total 10,000 basis points.

## Artwork

- The player's Rare Friend uses its **canonical on-chain 16 × 16 pixels**, loaded
  through the SDK sprite reader and drawn with the SDK's white-halo treatment.
- Capsule Friends are **procedurally generated** deterministic 16 × 16 pixel
  masks in `creatures.tsx`, padded to the SDK's 24 × 16 item-art frame. They are
  drawn monochrome by `ItemArt`/`RewardReveal`, so no external image files are
  needed and the art loads instantly.
- The capsule machine is hand-drawn line art, matching the Rare Friends
  paper-and-ink look. Rarity reads from the SDK's rarity chip and reveal
  particles, with signal green reserved for rare and above.

## Files

| File | Purpose |
| --- | --- |
| `index.tsx` | Scene, machine flow, ×10 pull, album, odds, settings |
| `game.json` | Capsule price and the 20-outcome weighted table |
| `creatures.tsx` | Pixel-mask art, line-art capsule machine, Friend portrait |
| `style.css` | Sandboxed game UI (paper/ink theme) |
| `host.css` | Trusted runtime layout (portrait frame on phones) |
