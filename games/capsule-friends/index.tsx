"use client";

import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import { ExperiencePanel, GameHud, ItemArt, formatGameAmount } from "@rarefriends/friendsdk/ui";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { GameWorld, type GameWorldInteraction } from "@rarefriends/friendsdk/world-view";
import { getWorldPreset, validateWorld } from "@rarefriends/friendsdk/world";
import type { GameItem } from "@rarefriends/friendsdk/items";
import { CAPSULE_ART, CAPSULE_BLURB, CAPSULE_ICON_ROWS, CapsuleMachine, SoundIcon, SettingsIcon, type Rarity } from "./creatures.js";
import "@rarefriends/friendsdk/ui.css";
import "@rarefriends/friendsdk/reveal.css";
import "@rarefriends/friendsdk/frame.css";
import "@rarefriends/friendsdk/world-view.css";
import "./style.css";

const RF = 10n ** 18n;
const rf = (amount: bigint) => `${formatGameAmount(amount, 18)} RF`;
const currency = { symbol: "RF", decimals: 18 };

/** Machine tiers: keys per pull = draws per pull. Higher tiers concentrate luck into one result. */
const MACHINES = [
  { id: "m1", label: "Machine ×1", tier: 1, unlock: 0 },
  { id: "m2", label: "Machine ×2", tier: 2, unlock: 0 },
  { id: "m3", label: "Machine ×4", tier: 4, unlock: 0 },
  { id: "m4", label: "Machine ×8", tier: 8, unlock: 1 },
] as const;

const isRarePlus = (rarity: Rarity) => rarity === "rare" || rarity === "epic" || rarity === "legendary";
const isEpicPlus = (rarity: Rarity) => rarity === "epic" || rarity === "legendary";
const cueForRarity = (rarity: Rarity): FriendSoundCue => (rarity === "legendary" ? "reveal-legendary" : rarity === "rare" || rarity === "epic" ? "reveal-rare" : "reveal-common");

type Screen = "world" | "shop" | "machine" | "vault" | "album" | "odds" | "settings";

/** Walkable paper yard. The SDK world renderer draws the terrain, props and the canonical Friend. */
const baseYard = getWorldPreset("01-garden-oval-complete");
const yard = validateWorld({
  ...baseYard,
  props: [
    ...baseYard.props,
    { type: "terminal", x: 200, y: 110 },
    { type: "crate", x: 95, y: 190 },
    { type: "crate", x: 120, y: 268 },
    { type: "terminal", x: 235, y: 316 },
    { type: "crate", x: 356, y: 300 },
    { type: "terminal", x: 452, y: 224 },
    { type: "crate", x: 452, y: 120 },
  ],
  actors: [],
});
const spawn = [288, 192] as const;
const worldInteractions: readonly GameWorldInteraction[] = [
  { id: "shop", label: "Key shop", position: [200, 110], reach: 72, labelOffset: -110 },
  { id: "vault", label: "Capsule vault", position: [95, 190], reach: 72, labelOffset: -60 },
  { id: "m1", label: "Machine ×1", position: [120, 268], reach: 72, labelOffset: 70 },
  { id: "m2", label: "Machine ×2", position: [235, 316], reach: 72, labelOffset: 120 },
  { id: "m3", label: "Machine ×4", position: [356, 300], reach: 72, labelOffset: 70 },
  { id: "m4", label: "Machine ×8", position: [452, 224], reach: 72, labelOffset: 40 },
  { id: "album", label: "Capsule album", position: [452, 120], reach: 72, labelOffset: -40 },
];

export default function CapsuleFriends({ friendId, client, paused }: GameComponentProps) {
  const definition = client.definition;
  const maxPrize = maximumPrize(definition);
  const capsuleItems: readonly GameItem[] = definition.outcomes.map((outcome, index) => ({
    id: CAPSULE_ART[index].id,
    name: outcome.name,
    rarity: CAPSULE_ART[index].rarity,
    art: { rows: CAPSULE_ART[index].rows },
  }));
  const capsuleItem: GameItem = { id: "capsule", name: definition.consumable, rarity: "Basic", art: { rows: [...CAPSULE_ICON_ROWS] } };

  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>("world");
  const [machineTier, setMachineTier] = useState<number>(1);
  const [quantity, setQuantity] = useState("5");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<GamePlay | null>(null);
  const [drewCount, setDrewCount] = useState(1);
  const [cranking, setCranking] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [seals, setSeals] = useState<Record<number, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [worldRevision, setWorldRevision] = useState(0);

  const sound = useRef<FriendSoundKit | null>(null);
  const locked = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    sound.current = createFriendSoundKit({ muted: true });
    void client.read().then(value => { if (alive.current) setSnapshot(value); }).catch(cause => { if (alive.current) setError(cause instanceof Error ? cause.message : "The game could not load."); });
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => { alive.current = false; sound.current?.dispose(); sound.current = null; query.removeEventListener("change", update); };
  }, [client]);

  useEffect(() => {
    if (screen !== "vault") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (!cranking || !result) return;
    const timer = setTimeout(() => { setReady(true); sound.current?.play("action-ready"); }, reduceMotion ? 0 : 800);
    return () => clearTimeout(timer);
  }, [cranking, result, reduceMotion]);

  async function action(work: () => Promise<void>, cue?: FriendSoundCue) {
    if (locked.current || paused) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    void sound.current?.unlock();
    try {
      await work();
      const value = await client.read();
      if (alive.current) { setSnapshot(value); if (cue) sound.current?.play(cue); }
    } catch (cause) {
      const failure = cause instanceof Error ? cause.message : "Game action failed.";
      try {
        const value = await client.read();
        if (alive.current) { setSnapshot(value); setError(failure); }
      } catch {
        if (alive.current) setError(`${failure} Could not refresh the game state. Retry before continuing.`);
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <div className="cf cf-empty" role={error ? "alert" : "status"}>
        {error || "Opening the yard…"}
        {error && <button type="button" disabled={busy || paused} onClick={() => void action(async () => undefined)}>Retry</button>}
      </div>
    );
  }
  if (snapshot.friendId !== friendId) return <div className="cf cf-empty" role="alert">The selected Friend does not match this game session.</div>;

  const count = /^[1-9]\d?$/.test(quantity) ? BigInt(quantity) : 0n;
  const cost = count * definition.price;
  const hasBacking = snapshot.freeStake >= maxPrize && snapshot.freeStake + cost >= count * maxPrize;
  const canBuy = count > 0n && hasBacking && snapshot.rfBalance >= cost;
  const pendingPlays = snapshot.plays.filter(play => play.outcomeId === null);
  const pendingPlay = pendingPlays[0];
  const pulledId = result?.outcomeId ?? null;
  const pulledItem = pulledId ? capsuleItems[pulledId - 1] : null;
  const pulledValue = pulledId ? definition.outcomes[pulledId - 1].reward : 0n;
  const totalCount = snapshot.inventory.reduce((sum, amount) => sum + amount, 0n);
  const totalValue = snapshot.inventory.reduce((sum, amount, index) => sum + amount * definition.outcomes[index].reward, 0n);
  const unique = snapshot.inventory.reduce((sum, amount) => sum + (amount > 0n ? 1 : 0), 0);
  const rarePlus = capsuleItems.reduce((sum, item, index) => sum + (snapshot.inventory[index] > 0n && isRarePlus(item.rarity as Rarity) ? 1 : 0), 0);
  const vaultLevel = Math.min(3, rarePlus);
  const epicIndexes = capsuleItems.map((item, index) => (isEpicPlus(item.rarity as Rarity) ? index : -1)).filter(index => index >= 0);
  const selectedItem = capsuleItems[selectedIndex];
  const selectedValue = definition.outcomes[selectedIndex].reward;
  const selectedCount = snapshot.inventory[selectedIndex];
  const isPreview = client.mode === "preview";
  const tierUnlocked = (unlock: number) => vaultLevel >= unlock;

  const navigate = (next: Screen) => { if (!cranking && !busy && !paused) { setScreen(next); setError(""); setMessage(""); sound.current?.play("select"); } };
  const openShop = () => { setQuantity("5"); navigate("shop"); };
  const toggleSound = () => { const next = !muted; setMuted(next); sound.current?.setMuted(next); if (!next) void sound.current?.unlock(); };

  function interact(id: string) {
    if (id === "shop") return openShop();
    if (id === "vault") return navigate("vault");
    if (id === "album") return navigate("album");
    const machine = MACHINES.find(value => value.id === id);
    if (machine) {
      if (!tierUnlocked(machine.unlock)) { setMessage(`${machine.label} needs vault level ${machine.unlock}.`); return; }
      setMachineTier(machine.tier);
      setResult(null);
      setDrewCount(1);
      setCranking(false);
      return navigate("machine");
    }
  }

  function presentResult(settled: GamePlay) {
    if (!alive.current) return;
    setReady(false);
    if (settled.outcomeId && isEpicPlus(CAPSULE_ART[settled.outcomeId - 1].rarity as Rarity)) {
      const id = settled.outcomeId;
      setSeals(previous => (id in previous ? previous : { ...previous, [id]: Date.now() + 8000 }));
    }
    setResult(settled);
    setCranking(true);
    setMessage("");
  }

  async function settlePull(playId: bigint) {
    const settled = await client.settle(playId);
    if (!alive.current) return;
    if (settled.outcomeId === null) {
      setResult(null); setCranking(false);
      setMessage(`Pull #${playId} is waiting for its result. Finish it at the machine.`);
      return;
    }
    presentResult(settled);
  }

  const pull = () => action(async () => {
    if (pendingPlay) throw new Error(`Pull #${pendingPlay.id} is pending. Finish it first.`);
    setResult(null); setReady(false); setCranking(false); setDrewCount(1);
    const plays = await client.play(BigInt(machineTier));
    const settled: GamePlay[] = [];
    for (const play of plays) {
      const value = await client.settle(play.id);
      if (value.outcomeId !== null) settled.push(value);
    }
    if (!settled.length) throw new Error("The pull returned no result. Refresh and try again.");
    settled.sort((a, b) => definition.outcomes[b.outcomeId! - 1].reward > definition.outcomes[a.outcomeId! - 1].reward ? 1 : -1);
    if (!alive.current) return;
    setDrewCount(settled.length);
    presentResult(settled[0]);
  }, "action-start");
  const resumePull = () => pendingPlay && action(() => settlePull(pendingPlay.id), "action-start");

  const redeemOne = (outcomeId: number) => action(async () => {
    await client.redeem(outcomeId, 1n);
    setMessage(`Redeemed 1 ${definition.outcomes[outcomeId - 1].name} for ${rf(definition.outcomes[outcomeId - 1].reward)}.`);
  }, "reward");

  const soundButton = <button className="cf-icon" type="button" aria-label={muted ? "Turn sound on" : "Mute sound"} aria-pressed={!muted} onClick={toggleSound}><SoundIcon muted={muted} /></button>;
  const feedback = <p className="cf-feedback" role={error ? "alert" : "status"}>{error || message}</p>;
  const panelTitle = screen === "shop" ? "Key shop" : screen === "machine" ? `Machine · Luck ×${machineTier}` : screen === "vault" ? "Capsule vault" : screen === "album" ? "Capsule album" : screen === "odds" ? "Odds" : "Settings";

  const album = (
    <div className="cf-collection-panel">
      <div className="cf-collection-scroll">
        <div className="cf-collection-best">
          <span>{unique}/20 discovered</span>
          <span className="cf-scroll-hint">Scroll for all friends ↓</span>
          <span>{totalCount.toString()} kept · {rf(totalValue)}</span>
        </div>
        <div className="cf-collection" aria-label="Capsule album">
          {capsuleItems.map((item, index) => (
            <button type="button" key={item.id} aria-label={`${item.name}, ${snapshot.inventory[index]} owned`} aria-pressed={selectedIndex === index} data-owned={snapshot.inventory[index] > 0n} onClick={() => setSelectedIndex(index)}>
              <ItemArt item={item} />
              <span>{item.name}</span>
              <small>×{snapshot.inventory[index].toString()}</small>
            </button>
          ))}
        </div>
        <div className="cf-catch-detail">
          <div><strong>{selectedItem.name}</strong><span>{rf(selectedValue)}</span></div>
          <p>{CAPSULE_BLURB[selectedIndex]}</p>
          <p>{selectedCount > 0n ? `${selectedCount} owned · ${selectedItem.rarity} · ${rf(selectedValue)} · No expiry` : "Not pulled yet."}</p>
        </div>
      </div>
      <div className="cf-actions">
        <button className="cf-primary" type="button" aria-label={`Redeem one ${selectedItem.name}`} disabled={busy || paused || selectedCount === 0n || selectedValue === 0n} onClick={() => void redeemOne(selectedIndex + 1)}>Redeem one · {rf(selectedValue)}</button>
        <button type="button" disabled={busy || paused || totalValue === 0n} onClick={() => void action(async () => { for (let index = 0; index < capsuleItems.length; index++) if (snapshot.inventory[index] > 0n && definition.outcomes[index].reward > 0n) await client.redeem(index + 1, snapshot.inventory[index]); setMessage("Redeemed every kept friend."); }, "reward")}>Redeem all · {rf(totalValue)}</button>
      </div>
      {feedback}
    </div>
  );

  return (
    <section className="cf" aria-label={definition.name} aria-busy={busy} data-screen={screen}>
      <div className="cf-world-ui" inert={screen !== "world" || paused || undefined}>
        <GameWorld key={worldRevision} world={yard} spawn={spawn} interactions={worldInteractions} friendId={snapshot.friendId} paused={paused || screen !== "world"} reducedMotion={reduceMotion} onInteract={id => interact(id)} />
        <GameHud
          balance={snapshot.rfBalance}
          currency={currency}
          itemCount={snapshot.consumables}
          itemCountLabel="keys"
          inventoryCount={totalCount}
          quest={pendingPlay ? `Pull #${pendingPlay.id} is pending · Finish it at a machine` : `Vault level ${vaultLevel} · ${vaultLevel >= 1 ? "Machine ×8 unlocked" : "Find a rare+ to unlock Machine ×8"}`}
          onInventory={() => navigate("album")}
          labels={{ balance: isPreview ? "Preview RF" : "Friend wallet RF", inventory: "Capsule album" }}
        />
        <button className="cf-settings cf-icon" type="button" aria-label="Settings" onClick={() => navigate("settings")}><SettingsIcon /></button>
        <div className="cf-sound">{soundButton}</div>
        <span className="cf-accessible" data-testid="capsules">{snapshot.consumables.toString()}</span>
        <span className="cf-accessible" data-testid="balance">{rf(snapshot.rfBalance)}</span>
        {screen === "world" && (error || message) && <div className="cf-world-feedback">{feedback}</div>}
      </div>

      {screen === "machine" ? (
        <GameMenu title={panelTitle} onClose={cranking || busy ? undefined : () => navigate("world")}>
          <ExperiencePanel
            stage={cranking || result ? "reward" : "activity"}
            itemCatalog={[capsuleItem, ...capsuleItems]}
            itemCounts={{ capsule: snapshot.consumables }}
            selectableItemIds={pendingPlay ? [] : ["capsule"]}
            selectedItemId="capsule"
            activeItemId="capsule"
            itemCost={pendingPlay ? 0n : BigInt(machineTier)}
            balance={snapshot.rfBalance}
            currency={currency}
            onSelectItem={() => {}}
            workingReady={ready}
            reward={pulledItem && result ? { id: result.id.toString(), itemId: pulledItem.id, quantity: 1n } : null}
            rewardValue={pulledValue}
            revealKey={result?.id.toString()}
            reducedMotion={reduceMotion}
            onRevealComplete={() => sound.current?.play(cueForRarity(pulledItem?.rarity as Rarity ?? "common"))}
            onAction={!busy && !paused ? () => { void (pendingPlay ? resumePull() : pull()); } : undefined}
            onShop={openShop}
            onKeep={!busy && !paused ? () => { setCranking(false); setSelectedIndex((pulledId ?? 1) - 1); setScreen("album"); setMessage(`Kept ${pulledItem?.name}.`); } : undefined}
            onSellReward={pulledValue > 0n && !busy && !paused ? () => void action(async () => { await client.redeem(pulledId!, 1n); setCranking(false); setResult(null); setScreen("world"); setMessage(`Redeemed ${pulledItem?.name} for ${rf(pulledValue)}.`); }, "reward") : undefined}
            onClose={busy ? undefined : () => { setCranking(false); setResult(null); navigate("world"); }}
            status={message}
            error={error}
            labels={{
              activityLocation: `Machine · Luck ×${machineTier}`,
              rewardLocation: "Your pull",
              activityTitle: pendingPlay ? `Pull #${pendingPlay.id} pending` : `Load ${machineTier} key${machineTier === 1 ? "" : "s"}`,
              activityDescription: pendingPlay ? "Finish this pull to see its result. Your keys are already used." : `${machineTier} draw${machineTier === 1 ? "" : "s"} per crank. Every friend is kept in your album; the rarest leads the reveal.`,
              action: pendingPlay ? `Finish pull #${pendingPlay.id}` : `Crank · ${machineTier} key${machineTier === 1 ? "" : "s"}`,
              activityCost: pendingPlay ? "No extra keys" : `${machineTier} key${machineTier === 1 ? "" : "s"} per pull`,
              openShop: "Visit the key shop",
              missingItems: `This machine needs ${machineTier} key${machineTier === 1 ? "" : "s"}. Buy them at the key shop.`,
              workingTitle: "Cranking…",
              workingDescription: "The machine is drawing.",
              readyTitle: "Capsule ready!",
              readyDescription: "Something dropped into the tray.",
              resolve: "Open capsule",
              waiting: "Cranking…",
              rewardTitle: "You pulled",
              keep: "Keep friend",
              sell: `Redeem · ${rf(pulledValue)}`,
              reveal: "Skip reveal",
              close: "Close machine",
            }}
            slots={{
              activityArt: <CapsuleMachine />,
              workingArt: <CapsuleMachine ready={ready} />,
              headerActions: soundButton,
              footer: <span>Machine ×{machineTier} · {machineTier} key{machineTier === 1 ? "" : "s"} per pull</span>,
              rewardDetails: drewCount > 1 ? <span>Best of {drewCount} · {drewCount - 1} more kept in your album</span> : <span>{definition.outcomes[(pulledId ?? 1) - 1].chanceBps / 100}% chance · Fixed value. No expiry.</span>,
            }}
          />
        </GameMenu>
      ) : screen === "shop" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("world")}>
          <div className="cf-shop-panel">
            <div className="cf-shop-stock">
              <div className="cf-capsule-card">
                <ItemArt item={capsuleItem} />
                <strong>{definition.consumable}</strong>
                <span>{rf(definition.price)} each</span>
                <small>{snapshot.consumables.toString()} owned</small>
              </div>
              <div className="cf-shop-copy">
                <h3>One key.<br />One crank.</h3>
                <p>Keys open any machine. Each machine spends its own number of keys and draws that many Capsule Friends, keeping the rarest.</p>
                <label className="cf-quantity">Quantity <input inputMode="numeric" type="number" min="1" max="99" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
                <button className="cf-link" type="button" onClick={() => navigate("odds")}>View odds</button>
              </div>
            </div>
            <div className="cf-summary"><span>{count.toString()} key{count === 1n ? "" : "s"}</span><strong>{rf(cost)}</strong></div>
            <div className="cf-actions">
              <button className="cf-primary" type="button" disabled={busy || paused || !canBuy} onClick={() => void action(async () => { await client.buy(count); setMessage(`Bought ${count} key${count === 1n ? "" : "s"}.`); }, "purchase")}>Buy keys <span aria-hidden="true">↗</span></button>
              <button type="button" disabled={busy} onClick={() => navigate("world")}>Back to the yard <span aria-hidden="true">→</span></button>
            </div>
            <p className="cf-feedback" role={error ? "alert" : "status"}>{error || message || (!hasBacking ? "Sales paused: not enough free backing. Owned keys stay usable." : snapshot.rfBalance < cost ? "Not enough simulated RF." : count === 0n ? "Choose 1 to 99 keys." : `${rf(snapshot.rfBalance)} available · simulated RF`)}</p>
          </div>
        </GameMenu>
      ) : screen === "vault" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("world")}>
          <div className="cf-text-panel">
            <p><strong>Vault level {vaultLevel}</strong> · {rarePlus} rare+ friend{rarePlus === 1 ? "" : "s"} discovered. Each vault level unlocks a luckier machine: level 1 unlocks <strong>Machine ×8</strong>.</p>
            <p className="cf-note">Epic and legendary friends are sealed in the vault for a short incubation before they hatch. The timer is cosmetic and session-only — owned friends are always safe and redeemable from the album.</p>
            <div className="cf-vault-list">
              {epicIndexes.map(index => {
                const item = capsuleItems[index];
                const readyAt = seals[index + 1];
                const left = readyAt ? Math.max(0, Math.ceil((readyAt - now) / 1000)) : 0;
                const owned = snapshot.inventory[index] > 0n;
                const sealed = owned && left > 0;
                return (
                  <div className="cf-vault-row" key={item.id} data-owned={owned}>
                    <ItemArt item={item} />
                    <div><strong>{item.name}</strong><small>{item.rarity} · {rf(definition.outcomes[index].reward)}</small></div>
                    <span className={`cf-vault-state${sealed ? " is-sealed" : ""}`}>{owned ? (sealed ? `Incubating ${left}s` : "Hatched") : "Not found"}</span>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => navigate("album")}>Open the capsule album</button>
            {feedback}
          </div>
        </GameMenu>
      ) : screen === "album" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("world")}>{album}</GameMenu>
      ) : screen === "odds" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("world")}>
          <div className="cf-text-panel">
            <p>{rf(definition.price)} per key · Expected return {rf(definition.outcomes.reduce((sum, outcome) => sum + outcome.reward * BigInt(outcome.chanceBps), 0n) / 10_000n)} per key · ~10% pool edge</p>
            <p className="cf-note">Machine ×1 / ×2 / ×4 / ×8 spend that many keys and draw that many times into your album, with the rarest draw leading the reveal. Every key returns the same expected value; higher machines give more chances at a rare friend in one crank.</p>
            <table>
              <thead><tr><th>Capsule Friend</th><th>Rarity</th><th>Chance</th><th>Redeem</th></tr></thead>
              <tbody>{definition.outcomes.map((outcome, index) => <tr key={outcome.name}><th scope="row">{outcome.name}</th><td>{CAPSULE_ART[index].rarity}</td><td>{outcome.chanceBps / 100}%</td><td>{rf(outcome.reward)}</td></tr>)}</tbody>
            </table>
            <p>Every key reserves {rf(maxPrize)}. Kept friends remain backed until redeemed, with no expiry. Free stake: <span data-testid="free-stake">{rf(snapshot.freeStake)}</span></p>
          </div>
        </GameMenu>
      ) : screen === "settings" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("world")}>
          <div className="cf-text-panel">
            <p>{isPreview ? "Local preview. Simulated RF, keys and outcomes; no live transactions. Progress resets on reload." : "Robinhood mainnet. Purchases and rewards use this Friend's canonical RF wallet."}</p>
            <button type="button" aria-pressed={!muted} onClick={toggleSound}>{muted ? "Sound off" : "Sound on"}</button>
            <label className="cf-motion"><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} /> Reduce motion</label>
            <button type="button" onClick={() => navigate("odds")}>Odds</button>
            <button type="button" onClick={() => setWorldRevision(value => value + 1)}>Reset walking position</button>
            <p className="cf-note">Walk with WASD, arrow keys or tap a destination. Press E near a station. An eligible hardwired Generations NFT on Robinhood mainnet is required to play.</p>
            {feedback}
          </div>
        </GameMenu>
      ) : null}
    </section>
  );
}
