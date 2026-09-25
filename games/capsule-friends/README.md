# Capsule Friends

A Rare Friends gacha **yard**. Walk your selected, verified Rare Friend around a
paper-and-ink garden with seven stations: a **key shop**, four **capsule
machines** of rising luck, a **capsule vault**, and the **capsule album**. Buy
keys, crank a machine, and reveal collectible Capsule Friends across five rarity
tiers.

FriendSDK **v0.1.2**, using the canonical SDK world renderer and chrome:
`GameWorld` (line-art terrain, paths, collision and the Friend's on-chain
sprites), `ExperiencePanel`, `RewardReveal`, `GameHud`, `GameMenu`. All balances,
keys, pulls and redemptions are **simulated preview** values that belong to the
selected Friend for the runtime session only. An eligible hardwired Generations
NFT (generation ≥ 1) on Robinhood mainnet is still required to play.

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

| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | `WASD` / arrow keys | Tap a destination |
| Use a station | `E` when the chip is green | Tap the station chip |

The station chips light up green when your Friend is close enough. Walk to the
**Key shop** to buy keys, then to a **machine** to crank, the **vault** to inspect
epic+ friends, or the **album** to redeem.

## Rules

- **Keys**: bought at the Key shop for **1 RF** each. One key reserves **10 RF**
  of backing (the highest prize) until it is spent; sales pause when free backing
  runs out. This is the SDK's supplied chance-game accounting.
- **Machines**: each machine spends its own number of keys per crank and draws
  that many Capsule Friends in one pull.

  | Machine | Keys per crank | Draws | Unlock |
  | --- | --: | --: | --- |
  | Machine ×1 | 1 | 1 | always |
  | Machine ×2 | 2 | 2 | always |
  | Machine ×4 | 4 | 4 | always |
  | Machine ×8 | 8 | 8 | vault level 1 |

  Every draw is independent: no pity timer, no reroll. The rarest draw of the
  pull leads the reveal; **every** draw is kept in the album. Higher machines
  give more chances at a rare friend in a single crank at the same expected
  value per key.
- **Vault**: epic and legendary friends are listed in the vault with a short
  **incubation** countdown. The timer is cosmetic and session-only; owned friends
  are always safe and redeemable from the album. Each **vault level** (one per
  rare-or-better friend discovered) unlocks a luckier machine — level 1 unlocks
  **Machine ×8**.
- **Album**: keep friends for their fixed RF value, or redeem any time. No
  expiry. Tracks unique friends (of 20) and total album value.
- Expected return is **0.901 RF per key** (≈ **90.1%**). The remaining ≈ 9.9% is
  the community pool edge. Maximum prize is **10 RF**.

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

## Capability notes

FriendSDK v0.1.2's supplied chance game has **one** consumable and **one** weighted
outcome table, and no persistence, upgrade or extra-currency APIs. This game
therefore expresses "luck" through the number of **draws per crank** rather than
separate odds tables, and the vault incubation is a session-only presentation.
Separate key types, per-machine odds tables, persistent timers and on-chain vault
upgrades are future integration work, not part of this preview.

## Token activity

The **Capsule vault** holds a session **Token activity ledger** that makes RF
spending visible: keys bought, **RF spent**, RF redeemed, **net RF
(spent − redeemed)**, pulls and best pull. **Spend badges** (Spender I–IV at
5 / 10 / 15 / 20 RF) reward heavier spending, and the HUD shows the running
RF spent. RF spent leaves the Friend wallet for the community pool; only
redeemed rewards return. This is the game's Token Activity surface.

## Artwork

- The player's Rare Friend uses its **canonical on-chain pixels**, rendered by
  the SDK world renderer (`GameWorld`) with the SDK's white-halo treatment.
- Capsule Friends are **procedurally generated** deterministic 16 × 16 pixel
  masks in `creatures.tsx`, padded to the SDK's 24 × 16 item-art frame and drawn
  monochrome by `ItemArt`/`RewardReveal`.
- The capsule machine is hand-drawn line art, matching the Rare Friends
  paper-and-ink look. Rarity reads from the SDK rarity chip and reveal particles,
  with signal green reserved for rare and above.

## Files

| File | Purpose |
| --- | --- |
| `index.tsx` | World, stations, key shop, machines, vault, album, odds, settings |
| `game.json` | Key price and the 20-outcome weighted table |
| `creatures.tsx` | Pixel-mask art, line-art capsule machine, icons |
| `style.css` | Sandboxed game UI (paper/ink theme) |
| `host.css` | Trusted runtime layout (portrait frame on phones) |
