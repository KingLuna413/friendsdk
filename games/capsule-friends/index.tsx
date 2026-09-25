"use client";

import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import { createFriendReader, spriteFrame, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { ActivityPrompt, ExperiencePanel, GameHud, ItemArt, formatGameAmount } from "@rarefriends/friendsdk/ui";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import type { GameItem } from "@rarefriends/friendsdk/items";
import { CAPSULE_ART, CAPSULE_BLURB, CAPSULE_ICON_ROWS, CapsuleMachine, FriendPortrait, SoundIcon, SettingsIcon } from "./creatures.js";
import "@rarefriends/friendsdk/ui.css";
import "@rarefriends/friendsdk/reveal.css";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

const RF = 10n ** 18n;
const rf = (amount: bigint) => `${formatGameAmount(amount, 18)} RF`;
const currency = { symbol: "RF", decimals: 18 };

type Screen = "scene" | "machine" | "shop" | "reveal" | "album" | "odds" | "settings" | "burst";

const cueFor = (value: bigint): FriendSoundCue => (value >= 5n * RF ? "reveal-legendary" : value >= RF ? "reveal-rare" : "reveal-common");

/** The gacha arcade. The runtime supplies the verified Friend and the fixed preview client. */
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
  const [screen, setScreen] = useState<Screen>("scene");
  const [quantity, setQuantity] = useState("1");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<GamePlay | null>(null);
  const [burst, setBurst] = useState<readonly GamePlay[] | null>(null);
  const [cranking, setCranking] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [spriteState, setSpriteState] = useState<"loading" | "ready" | "error">("loading");
  const [spriteRevision, setSpriteRevision] = useState(0);
  const [frame, setFrame] = useState(0);

  const sound = useRef<FriendSoundKit | null>(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const hot = useRef({ screen: "scene" as Screen, busy: false, paused: false, capsules: 0n });
  const tenRef = useRef<() => void>(() => {});

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
    let live = true;
    setSpriteState("loading");
    setSprites(null);
    createFriendReader().read(friendId).then(value => { if (live) { setSprites(value); setSpriteState("ready"); } }).catch(() => { if (live) setSpriteState("error"); });
    return () => { live = false; };
  }, [friendId, spriteRevision]);

  useEffect(() => {
    if (!sprites || reduceMotion || paused || screen !== "scene") { setFrame(0); return; }
    let raf = 0;
    let last = -1;
    const start = performance.now();
    const loop = (now: number) => {
      const value = Math.floor((now - start) / 220) % 8;
      if (value !== last) { last = value; setFrame(value); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sprites, reduceMotion, paused, screen]);

  useEffect(() => {
    if (!cranking || !result) return;
    const timer = setTimeout(() => { setReady(true); sound.current?.play("action-ready"); }, reduceMotion ? 0 : 800);
    return () => clearTimeout(timer);
  }, [cranking, result, reduceMotion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = hot.current;
      if (state.paused || state.busy || state.screen !== "scene") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "e" || key === "m") { event.preventDefault(); setScreen("machine"); }
      else if (key === "x" && state.capsules >= 10n) { event.preventDefault(); tenRef.current(); }
      else if (key === "c") { event.preventDefault(); setScreen("album"); }
      else if (key === "o") { event.preventDefault(); setScreen("odds"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        {error || "Loading the capsule machine…"}
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
  const selectedItem = capsuleItems[selectedIndex];
  const selectedValue = definition.outcomes[selectedIndex].reward;
  const selectedCount = snapshot.inventory[selectedIndex];
  const isPreview = client.mode === "preview";

  const navigate = (next: Screen) => { if (!cranking && !busy && !paused) { setScreen(next); setError(""); setMessage(""); sound.current?.play("select"); } };
  const openShop = () => { navigate("shop"); };
  const toggleSound = () => { const next = !muted; setMuted(next); sound.current?.setMuted(next); if (!next) void sound.current?.unlock(); };

  async function settlePull(playId: bigint) {
    const settled = await client.settle(playId);
    if (!alive.current) return;
    setReady(false);
    if (settled.outcomeId === null) {
      setResult(null); setCranking(false);
      setMessage(`Pull #${playId} is waiting for its result. Finish that pull; no extra capsule is used.`);
      return;
    }
    setResult(settled);
    setCranking(true);
    setMessage("");
  }

  const crank = () => action(async () => {
    if (pendingPlay) throw new Error(`Pull #${pendingPlay.id} is pending. Finish that pull first.`);
    setResult(null); setReady(false); setCranking(false);
    const [play] = await client.play(1n);
    if (!play) throw new Error("The pull was not returned. Refresh and try again.");
    await settlePull(play.id);
  }, "action-start");
  const resumePull = () => pendingPlay && action(() => settlePull(pendingPlay.id), "action-start");

  const pullTen = () => action(async () => {
    setBurst(null);
    const plays = await client.play(10n);
    const results: GamePlay[] = [];
    for (const play of plays) {
      const settled = await client.settle(play.id);
      if (settled.outcomeId !== null) results.push(settled);
    }
    if (!alive.current) return;
    if (!results.length) { setMessage("No pull results were returned."); return; }
    let best = 0n;
    for (const play of results) if (play.outcomeId) best = definition.outcomes[play.outcomeId - 1].reward > best ? definition.outcomes[play.outcomeId - 1].reward : best;
    setBurst(results);
    setScreen("burst");
    sound.current?.play(cueFor(best));
  }, "purchase");
  tenRef.current = pullTen;
  hot.current = { screen, busy, paused, capsules: snapshot?.consumables ?? 0n };  // keep hotkeys current

  const redeemOne = (outcomeId: number) => action(async () => {
    await client.redeem(outcomeId, 1n);
    setMessage(`Redeemed 1 ${definition.outcomes[outcomeId - 1].name} for ${rf(definition.outcomes[outcomeId - 1].reward)}.`);
  }, "reward");

  const redeemAll = (results: readonly GamePlay[], from: Screen) => action(async () => {
    const counts = new Map<number, bigint>();
    for (const play of results) if (play.outcomeId !== null) counts.set(play.outcomeId, (counts.get(play.outcomeId) ?? 0n) + 1n);
    let total = 0n;
    for (const [outcomeId, amount] of counts) {
      const value = definition.outcomes[outcomeId - 1].reward;
      if (value === 0n) continue;
      await client.redeem(outcomeId, amount);
      total += value * amount;
    }
    if (alive.current) { setScreen(from === "burst" ? "scene" : from); setBurst(null); setMessage(`Redeemed the whole pull for ${rf(total)}.`); }
  }, "reward");

  const soundButton = <button className="cf-icon" type="button" aria-label={muted ? "Turn sound on" : "Mute sound"} aria-pressed={!muted} onClick={toggleSound}><SoundIcon muted={muted} /></button>;
  const feedback = <p className="cf-feedback" role={error ? "alert" : "status"}>{error || message}</p>;
  const panelTitle = screen === "machine" ? "Capsule machine" : screen === "shop" ? "Capsule dispenser" : screen === "reveal" ? "Your pull" : screen === "album" ? "Capsule album" : screen === "odds" ? "Odds" : screen === "burst" ? "×10 pull" : "Settings";

  const spriteRows = spriteState === "ready" && sprites ? spriteFrame(sprites, "down", false, frame, "right").frame.rows : null;

  const album = (
    <div className="cf-collection-panel">
      <div className="cf-collection-scroll">
        <div className="cf-collection-best">
          <span>{unique}/20 discovered</span>
          <span className="cf-scroll-hint">Scroll for all friends ↓</span>
          <span>{totalCount.toString()} kept</span>
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
      <div className="cf-scene" inert={screen !== "scene" || paused || undefined}>
        <div className="cf-scene-inner">
          <div className="cf-friend">
            {spriteRows ? (
              <FriendPortrait rows={spriteRows} size={150} label={`Your Rare Friend, token ${friendId.toString()}`} />
            ) : (
              <div className={`cf-art-status${spriteState === "error" ? " is-error" : ""}`}>
                {spriteState === "error" ? (
                  <>
                    <p>Friend artwork did not load.</p>
                    <button type="button" disabled={busy || paused} onClick={() => setSpriteRevision(value => value + 1)}>Retry artwork</button>
                  </>
                ) : <p>Loading Friend artwork…</p>}
              </div>
            )}
            <span className="cf-friend-tag">#{friendId.toString()} · {sprites ? sprites.familyName : "Rare Friend"}</span>
          </div>
          <div className="cf-machine">
            <CapsuleMachine ready={cranking} />
            <span className="cf-machine-caption">{definition.consumable} machine</span>
          </div>
        </div>

        <GameHud
          balance={snapshot.rfBalance}
          currency={currency}
          itemCount={snapshot.consumables}
          itemCountLabel="capsules"
          inventoryCount={totalCount}
          quest={pendingPlay ? `Pull #${pendingPlay.id} is pending · Finish it at the machine` : undefined}
          onInventory={() => navigate("album")}
          labels={{ balance: isPreview ? "Preview RF" : "Friend wallet RF", inventory: "Capsule album" }}
        />
        <button className="cf-settings cf-icon" type="button" aria-label="Settings" onClick={() => navigate("settings")}><SettingsIcon /></button>
        <div className="cf-sound">{soundButton}</div>

        <ActivityPrompt className="cf-machine-prompt" label="Capsule machine" detail={pendingPlay ? `Finish pull #${pendingPlay.id}` : observation(snapshot.consumables)} active={screen === "scene"} onClick={paused || busy ? undefined : () => navigate("machine")} />
        {snapshot.consumables >= 10n && <ActivityPrompt className="cf-ten-prompt" label="Crank ×10" detail="Ten capsules at once" onClick={paused || busy ? undefined : () => void pullTen()} keyLabel="X" />}
        <nav className="cf-quickbar" aria-label="Quick actions">
          <button type="button" disabled={paused || busy} onClick={() => navigate("machine")}>Capsule machine</button>
          <button type="button" disabled={paused || busy || snapshot.consumables < 10n} onClick={() => void pullTen()}>Crank ×10</button>
        </nav>
        {screen === "scene" && (error || message) && <div className="cf-world-feedback">{feedback}</div>}
        <span className="cf-accessible" data-testid="capsules">{snapshot.consumables.toString()}</span>
        <span className="cf-accessible" data-testid="balance">{rf(snapshot.rfBalance)}</span>
      </div>

      {screen === "machine" || screen === "reveal" ? (
        <GameMenu title={panelTitle} onClose={cranking || busy || screen === "reveal" ? undefined : () => navigate("scene")}>
          <ExperiencePanel
            stage={screen === "reveal" ? "reward" : cranking ? "working" : "activity"}
            itemCatalog={[capsuleItem, ...capsuleItems]}
            itemCounts={{ capsule: snapshot.consumables }}
            selectableItemIds={pendingPlay ? [] : ["capsule"]}
            selectedItemId="capsule"
            activeItemId="capsule"
            itemCost={pendingPlay ? 0n : 1n}
            balance={snapshot.rfBalance}
            currency={currency}
            onSelectItem={() => {}}
            workingReady={ready}
            reward={pulledItem && result ? { id: result.id.toString(), itemId: pulledItem.id, quantity: 1n } : null}
            rewardValue={pulledValue}
            revealKey={result?.id.toString()}
            reducedMotion={reduceMotion}
            onRevealComplete={() => sound.current?.play(cueFor(pulledValue))}
            onAction={!busy && !paused ? () => { void (pendingPlay ? resumePull() : crank()); } : undefined}
            onShop={openShop}
            onResolve={!busy && !paused ? () => { setCranking(false); setScreen("reveal"); sound.current?.play("impact"); } : undefined}
            onKeep={!busy && !paused ? () => { setSelectedIndex((pulledId ?? 1) - 1); setScreen("album"); setMessage(`Kept ${pulledItem?.name}.`); } : undefined}
            onSellReward={pulledValue > 0n && !busy && !paused ? () => void action(async () => { await client.redeem(pulledId!, 1n); setScreen("scene"); setMessage(`Redeemed ${pulledItem?.name} for ${rf(pulledValue)}.`); }, "reward") : undefined}
            onClose={cranking || busy || screen === "reveal" ? undefined : () => navigate("scene")}
            status={message}
            error={error}
            labels={{
              activityLocation: "Capsule machine",
              rewardLocation: "Your pull",
              activityTitle: pendingPlay ? `Pull #${pendingPlay.id} pending` : "Choose a capsule",
              activityDescription: pendingPlay ? "Finish this pull to see its result. Your capsule is already used." : "One capsule. One Capsule Friend.",
              action: pendingPlay ? `Finish pull #${pendingPlay.id}` : "Crank · 1 capsule",
              activityCost: pendingPlay ? "No extra capsule" : "One capsule per pull",
              openShop: "Visit capsule dispenser",
              missingItems: "Load capsules from the dispenser to start.",
              workingTitle: "Cranking…",
              workingDescription: "The dome is rattling.",
              readyTitle: "Capsule ready!",
              readyDescription: "Something dropped into the tray.",
              resolve: "Open capsule",
              waiting: "Cranking…",
              rewardTitle: "You pulled",
              keep: "Keep friend",
              sell: `Redeem · ${rf(pulledValue)}`,
              reveal: "Skip reveal",
              close: "Close Capsule machine",
            }}
            slots={{
              activityArt: <CapsuleMachine />,
              workingArt: <CapsuleMachine ready={ready} />,
              headerActions: soundButton,
              footer: <span>Capsule · {rf(definition.price)} at the dispenser</span>,
              rewardDetails: screen === "reveal" && pulledId ? <span>{definition.outcomes[pulledId - 1].chanceBps / 100}% chance · Fixed value. No expiry.</span> : undefined,
            }}
          />
        </GameMenu>
      ) : screen === "shop" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("scene")}>
          <div className="cf-shop-panel">
            <div className="cf-shop-stock">
              <div className="cf-capsule-card">
                <ItemArt item={capsuleItem} />
                <strong>{definition.consumable}</strong>
                <span>{rf(definition.price)} each</span>
                <small>{snapshot.consumables.toString()} owned</small>
              </div>
              <div className="cf-shop-copy">
                <h3>One capsule.<br />One friend.</h3>
                <p>Each capsule opens one Capsule Friend. Every capsule reserves {rf(maxPrize)} of backing.</p>
                <label className="cf-quantity">Quantity <input inputMode="numeric" type="number" min="1" max="99" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
                <button className="cf-link" type="button" onClick={() => navigate("odds")}>View odds</button>
              </div>
            </div>
            <div className="cf-summary"><span>{count.toString()} capsule{count === 1n ? "" : "s"}</span><strong>{rf(cost)}</strong></div>
            <div className="cf-actions">
              <button className="cf-primary" type="button" disabled={busy || paused || !canBuy} onClick={() => void action(async () => { await client.buy(count); setMessage(`Loaded ${count} capsule${count === 1n ? "" : "s"}.`); }, "purchase")}>Load capsules <span aria-hidden="true">↗</span></button>
              <button type="button" disabled={busy} onClick={() => navigate("machine")}>To the machine <span aria-hidden="true">→</span></button>
            </div>
            <p className="cf-feedback" role={error ? "alert" : "status"}>{error || message || (!hasBacking ? "Loads paused: not enough free backing. Loaded capsules stay playable." : snapshot.rfBalance < cost ? "Not enough simulated RF." : count === 0n ? "Choose 1 to 99 capsules." : `${rf(snapshot.rfBalance)} available · simulated RF`)}</p>
          </div>
        </GameMenu>
      ) : screen === "album" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("scene")}>{album}</GameMenu>
      ) : screen === "odds" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("scene")}>
          <div className="cf-text-panel">
            <p>{rf(definition.price)} per capsule · Expected return {rf(definition.outcomes.reduce((sum, outcome) => sum + outcome.reward * BigInt(outcome.chanceBps), 0n) / 10_000n)} · ~10% pool edge</p>
            <table>
              <thead><tr><th>Capsule Friend</th><th>Rarity</th><th>Chance</th><th>Redeem</th></tr></thead>
              <tbody>{definition.outcomes.map((outcome, index) => <tr key={outcome.name}><th scope="row">{outcome.name}</th><td>{CAPSULE_ART[index].rarity}</td><td>{outcome.chanceBps / 100}%</td><td>{rf(outcome.reward)}</td></tr>)}</tbody>
            </table>
            <p>Every capsule reserves {rf(maxPrize)}. Kept friends remain backed until redeemed, with no expiry.</p>
            <p>Free stake: <span data-testid="free-stake">{rf(snapshot.freeStake)}</span></p>
          </div>
        </GameMenu>
      ) : screen === "burst" && burst ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => { setBurst(null); navigate("scene"); }}>
          <div className="cf-burst-panel">
            <div className="cf-burst-grid">
              {burst.map(play => {
                const id = play.outcomeId ?? 1;
                const item = capsuleItems[id - 1];
                return <div className="cf-burst-card" key={play.id.toString()} data-rarity={item.rarity}><ItemArt item={item} /><span>{item.name}</span><small>{rf(definition.outcomes[id - 1].reward)}</small></div>;
              })}
            </div>
            <div className="cf-actions">
              <button className="cf-primary" type="button" disabled={busy || paused} onClick={() => { setBurst(null); navigate("album"); }}>Keep all</button>
              <button type="button" disabled={busy || paused} onClick={() => void redeemAll(burst, "burst")}>Redeem all for RF</button>
            </div>
            {feedback}
          </div>
        </GameMenu>
      ) : screen === "settings" ? (
        <GameMenu title={panelTitle} onClose={busy || paused ? undefined : () => navigate("scene")}>
          <div className="cf-text-panel">
            <p>{isPreview ? "Local preview. Simulated RF and outcomes; no live transactions. Progress resets on reload." : "Robinhood mainnet. Purchases and rewards use this Friend's canonical RF wallet."}</p>
            <button type="button" aria-pressed={!muted} onClick={toggleSound}>{muted ? "Sound off" : "Sound on"}</button>
            <label className="cf-motion"><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} /> Reduce motion</label>
            <button type="button" onClick={() => navigate("odds")}>Odds</button>
            <p>An eligible hardwired Generations NFT on Robinhood mainnet is required to play. Wallet and ownership checks stay in the SDK runtime.</p>
            {feedback}
          </div>
        </GameMenu>
      ) : null}
    </section>
  );
}

function observation(capsules: bigint): string {
  if (capsules >= 10n) return `${capsules.toString()} capsules ready`;
  if (capsules > 0n) return `${capsules.toString()} capsule${capsules === 1n ? "" : "s"} ready`;
  return "1 capsule · 1 RF";
}
