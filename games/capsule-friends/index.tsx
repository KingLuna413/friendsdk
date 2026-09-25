"use client";

import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import { createFriendReader, spriteFrame, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { Creature, FriendPortrait, RARITY, RARITY_ORDER, CREATURE_BLURB, type Rarity } from "./creatures.js";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
const ONE = 10n ** 18n;
/** Rarity tier per game.json outcome index (1-based outcome IDs). */
const TIER_BY_INDEX: readonly Rarity[] = [
  ...Array<Rarity>(6).fill("common"),
  ...Array<Rarity>(5).fill("uncommon"),
  ...Array<Rarity>(4).fill("rare"),
  ...Array<Rarity>(3).fill("epic"),
  ...Array<Rarity>(2).fill("legendary"),
];
const tierOf = (outcomeId: number): Rarity => TIER_BY_INDEX[outcomeId - 1] ?? "common";
const cueFor = (rarity: Rarity): FriendSoundCue =>
  rarity === "legendary" ? "reveal-legendary" : rarity === "epic" || rarity === "rare" ? "reveal-rare" : "reveal-common";

/** Capsules resting inside the machine's glass dome. */
const DOME_CAPSULES = [
  { left: "26%", top: "30%", size: 26, tint: "#3fa9f5" },
  { left: "48%", top: "20%", size: 24, tint: "#37c98b" },
  { left: "68%", top: "33%", size: 27, tint: "#b06cf0" },
  { left: "35%", top: "52%", size: 26, tint: "#f5b942" },
  { left: "59%", top: "55%", size: 24, tint: "#9aa4b2" },
  { left: "18%", top: "56%", size: 23, tint: "#37c98b" },
  { left: "76%", top: "58%", size: 23, tint: "#3fa9f5" },
  { left: "47%", top: "68%", size: 25, tint: "#f5b942" },
] as const;

type Menu = "collection" | "odds" | "settings";

/** The gacha arcade. The runtime provides the verified Friend and the fixed preview client. */
export default function CapsuleFriends({ friendId, client, paused }: GameComponentProps) {
  const definition = client.definition;
  const maxPrize = maximumPrize(definition);

  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reveal, setReveal] = useState<readonly GamePlay[] | null>(null);
  const [revealStage, setRevealStage] = useState<"shake" | "open">("open");
  const [muted, setMuted] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [spriteState, setSpriteState] = useState<"loading" | "ready" | "error">("loading");
  const [spriteRevision, setSpriteRevision] = useState(0);
  const [frame, setFrame] = useState(0);
  const [cranking, setCranking] = useState(false);
  const [bubble, setBubble] = useState("Pick a capsule. I'll hold the ladder.");

  const sound = useRef<FriendSoundKit | null>(null);
  const locked = useRef(false);
  const epoch = useRef(0);
  const reduced = useRef(false);
  const bubbleTimer = useRef(0);
  const crankTimer = useRef(0);
  const revealTimer = useRef(0);
  reduced.current = reduceMotion;

  // Session reset + initial snapshot + sound kit + reduced-motion preference.
  useEffect(() => {
    const version = ++epoch.current;
    sound.current = createFriendSoundKit({ muted: true });
    setSnapshot(null);
    setMenu(null);
    setReveal(null);
    setBusy(false);
    setError("");
    setMessage("");
    setMuted(true);
    setCranking(false);
    locked.current = false;
    void client
      .read()
      .then(value => {
        if (version === epoch.current) setSnapshot(value);
      })
      .catch(cause => {
        if (version === epoch.current) setError(cause instanceof Error ? cause.message : "Could not load the game preview.");
      });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => {
      epoch.current++;
      window.clearTimeout(revealTimer.current);
      window.clearTimeout(crankTimer.current);
      window.clearTimeout(bubbleTimer.current);
      sound.current?.dispose();
      sound.current = null;
      preference.removeEventListener("change", update);
    };
  }, [client, friendId]);

  // Canonical on-chain artwork for the player's Rare Friend.
  useEffect(() => {
    let live = true;
    setSpriteState("loading");
    setSprites(null);
    createFriendReader()
      .read(friendId)
      .then(value => {
        if (live) {
          setSprites(value);
          setSpriteState("ready");
        }
      })
      .catch(() => {
        if (live) setSpriteState("error");
      });
    return () => {
      live = false;
    };
  }, [friendId, spriteRevision]);

  // Idle animation; frozen under reduced motion, while paused, or before art loads.
  useEffect(() => {
    if (!sprites || reduceMotion || paused) {
      setFrame(0);
      return;
    }
    let raf = 0;
    let last = -1;
    const start = performance.now();
    const loop = (now: number) => {
      const value = Math.floor((now - start) / 220) % 8;
      if (value !== last) {
        last = value;
        setFrame(value);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sprites, reduceMotion, paused]);

  function say(line: string, duration = 3200) {
    setBubble(line);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble("Pick a capsule. I'll hold the ladder."), duration);
  }

  function crank() {
    setCranking(true);
    window.clearTimeout(crankTimer.current);
    crankTimer.current = window.setTimeout(() => setCranking(false), reduceMotion ? 0 : 620);
  }

  async function run(work: () => Promise<void>, cue?: FriendSoundCue) {
    if (locked.current || paused) return;
    const version = epoch.current;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    void sound.current?.unlock();
    try {
      await work();
      const value = await client.read();
      if (version === epoch.current) {
        setSnapshot(value);
        if (cue) sound.current?.play(cue);
      }
    } catch (cause) {
      if (version === epoch.current) setError(cause instanceof Error ? cause.message : "The preview action failed.");
    } finally {
      if (version === epoch.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  function load(quantity: bigint) {
    return run(async () => {
      await client.buy(quantity);
      say(quantity === 1n ? "One capsule loaded. Give the crank a turn." : `${quantity} capsules loaded. Big session!`);
      setMessage(`${quantity} simulated capsule${quantity === 1n ? "" : "s"} added.`);
    }, "purchase");
  }

  function pull(quantity: bigint) {
    return run(async () => {
      const plays = await client.play(quantity);
      const settled: GamePlay[] = [];
      for (const play of plays) {
        try {
          settled.push(await client.settle(play.id));
        } catch {
          /* leave it pending; it is recovered on the next read */
        }
      }
      if (!settled.length) return;
      crank();
      setReveal(settled);
      setRevealStage(reduced.current ? "open" : "shake");
      sound.current?.play("anticipation");
      window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(
        () => {
          setRevealStage("open");
          let best = 0;
          for (const play of settled) if (play.outcomeId) best = Math.max(best, RARITY_ORDER.indexOf(tierOf(play.outcomeId)));
          const topRarity = RARITY_ORDER[best];
          sound.current?.play(cueFor(topRarity));
          say(
            topRarity === "legendary"
              ? "No way... a Legendary! Look at that shine!"
              : topRarity === "epic"
                ? "Epic pull! That one's got aura."
                : topRarity === "rare"
                  ? "A Rare! Nice crank technique."
                  : "Fresh friends, straight from the dome.",
          );
        },
        reduced.current ? 0 : 950,
      );
    });
  }

  function resumePending(ids: readonly bigint[]) {
    return run(async () => {
      const settled: GamePlay[] = [];
      for (const id of ids) {
        try {
          const value = await client.settle(id);
          if (value.outcomeId !== null) settled.push(value);
        } catch {
          /* already settled or unavailable */
        }
      }
      const value = await client.read();
      setSnapshot(value);
      const open = settled.length ? settled : value.plays.filter(play => play.outcomeId !== null).slice(-3);
      if (open.length) {
        setReveal(open);
        setRevealStage("open");
        const rarity = tierOf(open[open.length - 1].outcomeId ?? 1);
        sound.current?.play(cueFor(rarity));
      }
    });
  }

  function redeem(outcomeId: number, quantity = 1n) {
    return run(async () => {
      await client.redeem(outcomeId, quantity);
      setMessage(`Redeemed ${quantity.toString()} × ${definition.outcomes[outcomeId - 1].name}.`);
      say("Tokens in the tray. Thanks for the trade!");
    }, "reward");
  }

  function redeemAll(results: readonly GamePlay[]) {
    return run(async () => {
      const counts = new Map<number, bigint>();
      for (const play of results) {
        if (play.outcomeId === null) continue;
        counts.set(play.outcomeId, (counts.get(play.outcomeId) ?? 0n) + 1n);
      }
      let total = 0n;
      for (const [outcomeId, quantity] of counts) {
        const value = definition.outcomes[outcomeId - 1].reward;
        if (value === 0n) continue;
        await client.redeem(outcomeId, quantity);
        total += value * quantity;
      }
      setReveal(null);
      setMessage(total > 0n ? `Redeemed the whole pull for ${rf(total)}.` : "Kept every friend from this pull.");
      say(total > 0n ? "Coins in the tray. Come back soon!" : "They're all yours. Nice collection.");
    }, "reward");
  }

  function closeReveal() {
    setReveal(null);
    setError("");
  }

  if (!snapshot) {
    return (
      <div className="cf-root cf-loading" role={error ? "alert" : "status"}>
        <div className="cf-loading-dome" aria-hidden="true" />
        <p>{error || "Warming up the capsule machine…"}</p>
        {error && (
          <button type="button" disabled={busy || paused} onClick={() => void run(async () => undefined)}>
            Retry
          </button>
        )}
      </div>
    );
  }

  if (snapshot.friendId !== friendId) {
    return (
      <div className="cf-root cf-loading" role="alert">
        <p>This game session does not match the selected Friend.</p>
      </div>
    );
  }

  const pending = snapshot.plays.filter(play => play.outcomeId === null);
  const capsules = snapshot.consumables;
  const cost = definition.price;
  const freeStake = snapshot.freeStake;
  const canLoadOne = snapshot.rfBalance >= cost && freeStake >= maxPrize && freeStake + cost >= maxPrize;
  const canLoadTen = snapshot.rfBalance >= cost * 10n && freeStake >= maxPrize && freeStake + cost * 10n >= maxPrize * 10n;
  const unique = snapshot.inventory.reduce((total, amount) => total + (amount > 0n ? 1 : 0), 0);
  const total = snapshot.inventory.reduce((sum, amount) => sum + amount, 0n);
  const kept = definition.outcomes.reduce((sum, outcome, index) => sum + outcome.reward * snapshot.inventory[index], 0n);
  const disabled = busy || paused;
  const revealRarity = reveal && reveal.length
    ? RARITY_ORDER[Math.max(...reveal.map(play => (play.outcomeId ? RARITY_ORDER.indexOf(tierOf(play.outcomeId)) : 0)))]
    : "common";

  const spriteRows =
    spriteState === "ready" && sprites
      ? spriteFrame(sprites, "down", false, frame, "right").frame.rows
      : null;

  return (
    <section className={`cf-root${reveal ? " cf-revealing" : ""}`} aria-label={definition.name} aria-busy={busy}>
      <header className="cf-top">
        <div className="cf-brand">
          <span className="cf-logo" aria-hidden="true">◆</span>
          <span className="cf-title">{definition.name}</span>
          <span className={`cf-mode cf-mode-${snapshot.mode}`}>{snapshot.mode === "preview" ? "Simulated preview" : "Live"}</span>
        </div>
        <dl className="cf-stats">
          <div>
            <dt>RF</dt>
            <dd>{rf(snapshot.rfBalance)}</dd>
          </div>
          <div>
            <dt>Capsules</dt>
            <dd>{capsules.toString()}</dd>
          </div>
          <div>
            <dt>Album</dt>
            <dd>{unique}/20</dd>
          </div>
        </dl>
      </header>

      <div className="cf-stage" inert={Boolean(menu) || undefined}>
        <div className="cf-friend-col">
          <div className="cf-bubble" role="status" aria-live="polite">{bubble}</div>
          <div className="cf-friend-frame">
            <div className="cf-spotlight" aria-hidden="true" />
            {spriteRows ? (
              <FriendPortrait
                rows={spriteRows}
                size={176}
                label={`Your Rare Friend, token ${friendId.toString()}`}
              />
            ) : (
              <div className={`cf-art-status${spriteState === "error" ? " is-error" : ""}`}>
                {spriteState === "error" ? (
                  <>
                    <p>Friend artwork did not load.</p>
                    <button type="button" disabled={disabled} onClick={() => setSpriteRevision(value => value + 1)}>
                      Retry artwork
                    </button>
                  </>
                ) : (
                  <p>Loading Friend artwork…</p>
                )}
              </div>
            )}
            <div className="cf-friend-tag">
              <strong>#{friendId.toString()}</strong>
              <span>{sprites ? sprites.familyName : "Rare Friend"}</span>
            </div>
          </div>
        </div>

        <div className="cf-machine-col">
          <div className={`cf-machine${cranking ? " is-cranking" : ""}`}>
            <div className="cf-dome" aria-hidden="true">
              {DOME_CAPSULES.map((capsule, index) => (
                <span
                  key={index}
                  className="cf-dot"
                  style={{
                    left: capsule.left,
                    top: capsule.top,
                    width: capsule.size,
                    height: capsule.size,
                    background: `radial-gradient(circle at 34% 30%, #ffffff 0 14%, ${capsule.tint} 42% 100%)`,
                    animationDelay: `${index * 0.28}s`,
                  }}
                />
              ))}
              <span className="cf-dome-gloss" />
            </div>
            <div className="cf-body">
              <div className="cf-readout">
                <span>Capsules</span>
                <strong>{capsules.toString().padStart(2, "0")}</strong>
              </div>
              <div className="cf-crank" aria-hidden="true">
                <span className="cf-crank-disc" />
                <span className="cf-crank-arm" />
                <span className="cf-crank-grip" />
              </div>
              <div className="cf-chute" aria-hidden="true">
                <span className={`cf-chute-lip${cranking ? " is-open" : ""}`} />
              </div>
            </div>
          </div>

          <div className="cf-controls">
            {pending.length > 0 ? (
              <button type="button" className="cf-btn primary" disabled={disabled} onClick={() => void resumePending(pending.map(play => play.id))}>
                Finish pending pull · {pending.length}
              </button>
            ) : capsules > 0n ? (
              <>
                <button type="button" className="cf-btn primary" disabled={disabled} onClick={() => void pull(1n)}>
                  Crank · pull 1
                </button>
                <button type="button" className="cf-btn" disabled={disabled || capsules < 10n} onClick={() => void pull(10n)}>
                  Crank ×10
                </button>
              </>
            ) : (
              <>
                <button type="button" className="cf-btn primary" disabled={disabled || !canLoadOne} onClick={() => void load(1n)}>
                  Load 1 capsule · {rf(cost)}
                </button>
                <button type="button" className="cf-btn" disabled={disabled || !canLoadTen} onClick={() => void load(10n)}>
                  Load 10 · {rf(cost * 10n)}
                </button>
              </>
            )}
          </div>

          <nav className="cf-nav" aria-label="Game menus">
            <button type="button" disabled={disabled} onClick={() => setMenu("collection")}>
              Album · {unique}/20
            </button>
            <button type="button" disabled={disabled} onClick={() => setMenu("odds")}>
              Odds
            </button>
            <button type="button" disabled={disabled} onClick={() => setMenu("settings")}>
              Settings
            </button>
          </nav>
          <p className="cf-feedback" role={error ? "alert" : "status"}>
            {error || message || (busy ? "Working…" : `Simulated economy · ${total.toString()} kept · ${rf(kept)} album value`)}
          </p>
        </div>
      </div>

      {menu === "collection" && (
        <GameMenu title="Capsule album" onClose={disabled ? undefined : () => setMenu(null)}>
          <div className="cf-album-head">
            <p>
              <strong>{unique}/20</strong> friends discovered · {total.toString()} capsules opened · album value {rf(kept)}
            </p>
            <p className="cf-note">Kept friends hold their exact RF value with no expiry. Redeem any time from this album.</p>
          </div>
          <div className="cf-album">
            {definition.outcomes.map((outcome, index) => {
              const rarity = tierOf(index + 1);
              const style = RARITY[rarity];
              const owned = snapshot.inventory[index];
              return (
                <article key={outcome.name} className={`cf-slot${owned > 0n ? " is-owned" : ""}`} style={{ borderColor: style.body }}>
                  <Creature seed={index + 1} rarity={rarity} size={56} title={outcome.name} />
                  <div className="cf-slot-body">
                    <strong style={{ color: style.body }}>{outcome.name}</strong>
                    <small>
                      {style.label} · {outcome.chanceBps / 100}% · {rf(outcome.reward)}
                    </small>
                    <small className="cf-slot-blurb">{CREATURE_BLURB[index]}</small>
                    <small>
                      Owned: <strong>{owned.toString()}</strong>
                    </small>
                  </div>
                  <button
                    type="button"
                    disabled={disabled || owned === 0n || outcome.reward === 0n}
                    onClick={() => void redeem(index + 1, 1n)}
                  >
                    Redeem 1
                  </button>
                </article>
              );
            })}
          </div>
        </GameMenu>
      )}

      {menu === "odds" && (
        <GameMenu title="Capsule odds" onClose={disabled ? undefined : () => setMenu(null)}>
          <p>
            Each capsule costs <strong>{rf(cost)}</strong> and opens exactly one Capsule Friend. One capsule reserves{" "}
            <strong>{rf(maxPrize)}</strong> of backing until it is opened.
          </p>
          <table className="cf-table">
            <thead>
              <tr>
                <th scope="col">Rarity</th>
                <th scope="col">Chance</th>
                <th scope="col">Value</th>
                <th scope="col">Friends</th>
              </tr>
            </thead>
            <tbody>
              {RARITY_ORDER.map(rarity => {
                const style = RARITY[rarity];
                const pool = definition.outcomes.filter((_, index) => tierOf(index + 1) === rarity);
                const bps = pool.reduce((sum, outcome) => sum + outcome.chanceBps, 0);
                return (
                  <tr key={rarity}>
                    <th scope="row" style={{ color: style.body }}>{style.label}</th>
                    <td>{(bps / 100).toFixed(2)}%</td>
                    <td>{rf(pool[0].reward)}</td>
                    <td>{pool.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="cf-note">
            Every pull is independent with no pity timer and no reroll. Expected return is about 0.90 RF per 1 RF capsule. The
            community pool keeps the remaining ~10% as its edge.
          </p>
          <table className="cf-table">
            <thead>
              <tr>
                <th scope="col">Capsule Friend</th>
                <th scope="col">Rarity</th>
                <th scope="col">Chance</th>
                <th scope="col">Redeem</th>
              </tr>
            </thead>
            <tbody>
              {definition.outcomes.map((outcome, index) => {
                const style = RARITY[tierOf(index + 1)];
                return (
                  <tr key={outcome.name}>
                    <td>{outcome.name}</td>
                    <td style={{ color: style.body }}>{style.label}</td>
                    <td>{outcome.chanceBps / 100}%</td>
                    <td>{rf(outcome.reward)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </GameMenu>
      )}

      {menu === "settings" && (
        <GameMenu title="Settings" onClose={disabled ? undefined : () => setMenu(null)}>
          <button
            type="button"
            aria-pressed={!muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              sound.current?.setMuted(next);
              if (!next) void sound.current?.unlock();
            }}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
          <label className="cf-setting">
            <input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} />
            Reduce motion (skips the capsule animation)
          </label>
          <p className="cf-note">
            This is a simulated preview: balances, capsules, pulls and redemptions are session-local and reset on reload. An
            eligible hardwired Generations NFT on Robinhood mainnet is still required to play. Wallet connection and ownership
            checks are handled by the SDK runtime outside the game.
          </p>
        </GameMenu>
      )}

      {reveal && revealStage === "open" && (
        <div className="cf-reveal" role="dialog" aria-modal="true" aria-label="Capsule result">
          <div className={`cf-burst cf-burst-${revealRarity}`} aria-hidden="true" />
          {reveal.length === 1 ? (
            <SingleReveal
              play={reveal[0]}
              definition={definition}
              disabled={disabled}
              onKeep={closeReveal}
              onRedeem={outcomeId => void redeem(outcomeId, 1n).then(closeReveal)}
            />
          ) : (
            <div className="cf-reveal-multi">
              <h3>× {reveal.length} pull results</h3>
              <div className="cf-pull-grid">
                {reveal.map(play => {
                  const outcomeId = play.outcomeId ?? 1;
                  const outcome = definition.outcomes[outcomeId - 1];
                  const style = RARITY[tierOf(outcomeId)];
                  return (
                    <div key={play.id.toString()} className="cf-pull-card" style={{ borderColor: style.body }}>
                      <Creature seed={outcomeId} rarity={tierOf(outcomeId)} size={48} title={outcome.name} />
                      <strong style={{ color: style.body }}>{outcome.name}</strong>
                      <small>{rf(outcome.reward)}</small>
                    </div>
                  );
                })}
              </div>
              <div className="cf-reveal-actions">
                <button type="button" className="cf-btn primary" disabled={disabled} onClick={closeReveal}>
                  Keep all
                </button>
                <button type="button" className="cf-btn" disabled={disabled} onClick={() => void redeemAll(reveal)}>
                  Redeem all for RF
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SingleReveal({
  play,
  definition,
  disabled,
  onKeep,
  onRedeem,
}: {
  play: GamePlay;
  definition: GameComponentProps["client"]["definition"];
  disabled: boolean;
  onKeep: () => void;
  onRedeem: (outcomeId: number) => void;
}) {
  const outcomeId = play.outcomeId ?? 1;
  const outcome = definition.outcomes[outcomeId - 1];
  const rarity = tierOf(outcomeId);
  const style = RARITY[rarity];
  return (
    <div className="cf-reveal-single">
      <p className="cf-reveal-kicker" style={{ color: style.body }}>
        {style.label}
      </p>
      <div className="cf-reveal-art" style={{ boxShadow: `0 0 60px ${style.glow}55` }}>
        <Creature seed={outcomeId} rarity={rarity} size={132} title={outcome.name} />
      </div>
      <h3>{outcome.name}</h3>
      <p className="cf-reveal-blurb">{CREATURE_BLURB[outcomeId - 1]}</p>
      <p className="cf-reveal-value">
        {rf(outcome.reward)} · {outcome.chanceBps / 100}% chance
      </p>
      <div className="cf-reveal-actions">
        <button type="button" className="cf-btn primary" disabled={disabled} onClick={onKeep}>
          Keep friend
        </button>
        {outcome.reward > 0n && (
          <button type="button" className="cf-btn" disabled={disabled} onClick={() => onRedeem(outcomeId)}>
            Redeem · {rf(outcome.reward)}
          </button>
        )}
      </div>
    </div>
  );
}
