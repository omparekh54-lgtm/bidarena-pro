"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Crown,
  Gavel,
  LoaderCircle,
  LogIn,
  Play,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { athleteCatalog } from "@/data/catalog";
import { canBid, formatMoney, nextBidAmount } from "@/lib/auction/engine";
import type { PlayerSession, RoomView, Sport } from "@/lib/auction/types";

const SESSION_KEY = "bidarena-player-session-v1";
const POLL_INTERVAL_MS = 1_000;

class ApiClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}, session?: PlayerSession): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { "x-bidarena-player": session.playerId, "x-bidarena-token": session.token } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new ApiClientError(payload.error ?? "The server rejected that request.", response.status);
  return payload;
}

function persistSession(session: PlayerSession | null) {
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

function readSession(): PlayerSession | null {
  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) as PlayerSession : null;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function formatRoomCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function AuctionArena() {
  const [entryMode, setEntryMode] = useState<"choose" | "create" | "join">("choose");
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sound, setSound] = useState(true);
  const [clock, setClock] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const previousBidRef = useRef<string | null>(null);
  const previousPhaseRef = useRef<string | null>(null);

  const tone = useCallback((frequency: number, duration = 0.08) => {
    if (!sound || typeof window === "undefined") return;
    audioRef.current ??= new AudioContext();
    const context = audioRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.04, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }, [sound]);

  useEffect(() => {
    const stored = readSession();
    const restore = window.setTimeout(() => {
      if (stored) setSession(stored);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setClock(Date.now()), 200);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let pollTimer: number | undefined;

    async function poll() {
      try {
        const payload = await apiRequest<{ room: RoomView }>(`/api/rooms/${session?.roomCode}`, {}, session ?? undefined);
        if (cancelled) return;
        setRoom(payload.room);
        setServerOffset(Date.parse(payload.room.serverTime) - Date.now());
        setError(null);
      } catch (pollError) {
        if (cancelled) return;
        if (pollError instanceof ApiClientError && (pollError.status === 401 || pollError.status === 404)) {
          persistSession(null);
          setSession(null);
          setRoom(null);
          setEntryMode("join");
        }
        setError(pollError instanceof Error ? pollError.message : "The live room could not be synchronized.");
      } finally {
        if (!cancelled) pollTimer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [session]);

  useEffect(() => {
    const latestBid = room?.bids[0]?.id ?? null;
    if (latestBid && previousBidRef.current && latestBid !== previousBidRef.current) tone(520, 0.1);
    previousBidRef.current = latestBid;
  }, [room?.bids, tone]);

  useEffect(() => {
    if (!room) return;
    if (previousPhaseRef.current === "bidding" && room.phase === "sold") {
      tone(115, 0.2);
      window.setTimeout(() => tone(230, 0.25), 120);
    }
    previousPhaseRef.current = room.phase;
  }, [room, tone]);

  const runCommand = useCallback(async <T,>(label: string, operation: () => Promise<T>) => {
    setPending(label);
    setError(null);
    try {
      return await operation();
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "That action could not be completed.");
      return null;
    } finally {
      setPending(null);
    }
  }, []);

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entryMode === "create") {
      const payload = await runCommand("create", () => apiRequest<{ session: PlayerSession; room: RoomView }>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ teamName }),
      }));
      if (payload) {
        persistSession(payload.session);
        setSession(payload.session);
        setRoom(payload.room);
      }
      return;
    }

    const payload = await runCommand("join", () => apiRequest<{ session: PlayerSession; room: RoomView }>(`/api/rooms/${joinCode}/join`, {
      method: "POST",
      body: JSON.stringify({ teamName }),
    }));
    if (payload) {
      persistSession(payload.session);
      setSession(payload.session);
      setRoom(payload.room);
    }
  }

  async function command(path: string, body?: unknown) {
    if (!session) return;
    const payload = await runCommand(path, () => apiRequest<{ room: RoomView }>(`/api/rooms/${session.roomCode}/${path}`, {
      method: "POST",
      ...(body ? { body: JSON.stringify(body) } : {}),
    }, session));
    if (payload) setRoom(payload.room);
  }

  async function bid() {
    if (!session) return;
    const payload = await runCommand("bid", () => apiRequest<{ room: RoomView; acceptedAmount: number }>(`/api/rooms/${session.roomCode}/bid`, { method: "POST" }, session));
    if (payload) {
      setRoom(payload.room);
      tone(620, 0.08);
    }
  }

  function leaveLocalRoom() {
    persistSession(null);
    setSession(null);
    setRoom(null);
    setTeamName("");
    setJoinCode("");
    setEntryMode("choose");
  }

  async function copyCode() {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  if (!session) {
    return (
      <main className="entry-shell">
        <div className="entry-grid" aria-hidden="true" />
        <motion.section className="entry-card" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}>
          <div className="entry-brand"><div className="brand-mark"><Gavel size={24} /></div><div><strong>BIDARENA</strong><span>MULTIPLAYER AUCTION OS</span></div></div>
          <div className="entry-copy"><span><Wifi size={13} /> LIVE MULTIPLAYER</span><h1>Build your war room.</h1><p>Create a private auction or join your friends with a four-digit room code.</p></div>

          {entryMode === "choose" ? (
            <div className="entry-options">
              <button onClick={() => setEntryMode("create")}><span><Plus size={22} /></span><strong>Create a game</strong><small>Become administrator, choose the sport, invite up to 9 more teams.</small><ChevronRight size={18} /></button>
              <button onClick={() => setEntryMode("join")}><span><LogIn size={22} /></span><strong>Join a game</strong><small>Enter a four-digit code and register your team in the live room.</small><ChevronRight size={18} /></button>
            </div>
          ) : (
            <form className="entry-form" onSubmit={submitEntry}>
              <button type="button" className="back-button" onClick={() => { setEntryMode("choose"); setError(null); }}><ArrowLeft size={15} /> Back</button>
              <div><span>{entryMode === "create" ? "CREATE PRIVATE ROOM" : "JOIN PRIVATE ROOM"}</span><h2>{entryMode === "create" ? "Name your franchise" : "Enter the invitation"}</h2></div>
              {entryMode === "join" ? <label><span>ROOM CODE</span><input className="room-code-input" inputMode="numeric" autoComplete="one-time-code" value={joinCode} onChange={(event) => setJoinCode(formatRoomCode(event.target.value))} placeholder="0000" required pattern="[0-9]{4}" /></label> : null}
              <label><span>TEAM NAME</span><input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="e.g. Mumbai Mavericks" minLength={2} maxLength={32} required autoFocus /></label>
              <button className="primary-button entry-submit" disabled={Boolean(pending) || teamName.trim().length < 2 || (entryMode === "join" && joinCode.length !== 4)}>{pending ? <LoaderCircle className="spin" size={17} /> : entryMode === "create" ? <Plus size={17} /> : <UserPlus size={17} />}{pending ? "Connecting..." : entryMode === "create" ? "Create room" : "Join room"}</button>
            </form>
          )}
          <div className="entry-security"><ShieldCheck size={15} /><span><strong>Server-authoritative</strong> Room identity, budgets, timers and bid increments are verified on the server.</span></div>
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
        </motion.section>
      </main>
    );
  }

  if (!room) {
    return <main className="loading-shell"><LoaderCircle className="spin" size={34} /><strong>Reconnecting to room {session.roomCode}</strong><span>Restoring the latest auction ledger…</span>{error ? <button onClick={leaveLocalRoom}>Leave room</button> : null}</main>;
  }

  if (room.phase === "lobby") {
    return <Lobby room={room} copied={copied} pending={pending} error={error} onCopy={copyCode} onLeave={leaveLocalRoom} onConfigure={(sport) => void command("configure", { sport })} onStart={() => void command("start")} />;
  }

  const self = room.participants.find((participant) => participant.id === room.selfPlayerId);
  const leader = room.participants.find((participant) => participant.id === room.leaderId);
  const current = room.currentAthlete;
  const proposedBid = current ? (room.leaderId ? nextBidAmount(room.currentBid, current.basePrice) : current.basePrice) : 0;
  const canSelfBid = Boolean(self && room.phase === "bidding" && room.leaderId !== self.id && canBid(self, proposedBid));
  const deadline = room.deadlineAt ? Date.parse(room.deadlineAt) : 0;
  const timer = room.phase === "bidding" ? Math.max(0, Math.ceil((deadline - (clock + serverOffset)) / 1_000)) : 0;
  const progress = room.queueLength ? Math.round(((room.lotIndex + (room.phase === "complete" ? 1 : 0)) / room.queueLength) * 100) : 0;
  const committed = room.sales.reduce((sum, sale) => sum + sale.amount, 0);
  const available = room.participants.reduce((sum, participant) => sum + participant.budget, 0);
  const roleCounts = Object.entries(athleteCatalog.filter((athlete) => athlete.sport === room.sport).reduce<Record<string, number>>((result, athlete) => ({ ...result, [athlete.role]: (result[athlete.role] ?? 0) + 1 }), {})).slice(0, 4);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><Gavel size={22} /></div><div><strong>BIDARENA</strong><span>LIVE MULTIPLAYER</span></div></div>
        <div className="sport-switch locked" aria-label="Selected sport"><button className="active">{room.sport}</button></div>
        <div className="room-status"><span><Radio size={14} /> LIVE ROOM</span><strong>{room.code}</strong><button className="icon-button" onClick={() => setSound((value) => !value)} aria-label="Toggle sound">{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button></div>
      </header>

      <section className="command-strip"><div><Activity size={15} /><span>AUCTION {room.phase.toUpperCase()}</span></div><div className="progress-track"><motion.span animate={{ width: `${progress}%` }} /></div><div className="command-meta"><span>LOT {String(room.lotIndex + 1).padStart(3, "0")}</span><span>{room.participants.length} LIVE TEAMS</span></div></section>

      <div className="workspace">
        <aside className="panel teams-panel">
          <div className="panel-heading"><div><span>FRANCHISES</span><strong>War room</strong></div><Users size={18} /></div>
          <div className="team-list">{room.participants.map((participant) => <div key={participant.id} className={`team-card readonly ${room.leaderId === participant.id ? "leading" : ""} ${participant.id === room.selfPlayerId ? "self-team" : ""}`} style={{ "--team": participant.color } as React.CSSProperties}><span className="team-avatar">{participant.code}</span><span className="team-copy"><strong>{participant.teamName}</strong><small>{participant.squad.length} players · {formatMoney(participant.budget, room.sport)} left</small></span><span className="bid-action">{participant.id === room.selfPlayerId ? "YOU" : room.leaderId === participant.id ? "LEADS" : "LIVE"}</span></div>)}</div>
          <div className="my-squad"><div className="section-label">MY CURRENT SQUAD</div>{self?.squad.length ? self.squad.map((entry) => <div key={entry.athleteId}><span><strong>{entry.athlete.shortName}</strong><small>{entry.athlete.role}</small></span><b>{formatMoney(entry.amount, room.sport)}</b></div>) : <p>Your successful purchases will appear here.</p>}</div>
          <div className="integrity-note"><ShieldCheck size={17} /><span><strong>Budget guard active</strong>Every bid is serialized and validated on the server.</span></div>
        </aside>

        <section className="auction-stage"><div className="stage-lights" aria-hidden="true"><i /><i /><i /><i /><i /></div><div className="stage-grid" aria-hidden="true" />
          <AnimatePresence mode="wait">{room.phase === "complete" ? (
            <motion.div key="complete" className="complete-state" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}><Trophy size={60} /><span>AUCTION COMPLETE</span><h1>Final squads are locked</h1><p>{room.sales.length} players sold · {room.unsoldAthleteIds.length} unsold.</p><button className="primary-button" onClick={leaveLocalRoom}><RefreshCw size={17} /> Return to dashboard</button></motion.div>
          ) : current ? (
            <motion.div key={current.id} className="player-presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <motion.div className="reveal-kicker" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}><Sparkles size={14} /> {current.role} · {current.country}</motion.div>
              <motion.div className={`player-card ${room.phase}`} initial={{ rotateY: 90, scale: 0.72 }} animate={{ rotateY: 0, scale: 1 }} transition={{ type: "spring", stiffness: 90, damping: 14 }}>
                <div className="card-shine" /><div className="card-top"><div><strong>{current.gameRating}</strong><span>GAME RATING</span></div><BadgeCheck size={22} /></div><div className="player-silhouette" aria-hidden="true"><span>{current.shortName.split(" ").map((part) => part[0]).join("")}</span></div>
                <div className="card-identity"><span>{current.country.toUpperCase()} · {current.team.toUpperCase()}</span><h1>{current.name}</h1><p>{current.secondaryRole ?? current.role}</p></div><div className="stat-grid">{current.identity.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div><div className="data-stamp"><BadgeCheck size={12} /> Profile source · {current.source.provider}</div>
              </motion.div>
              <div className="bid-console"><div><span>{leader ? "CURRENT BID" : "BASE PRICE"}</span><motion.strong key={room.currentBid} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{formatMoney(room.currentBid, room.sport)}</motion.strong><small>{leader ? `Leading: ${leader.teamName}` : "Waiting for opening bid"}</small></div><div className={`timer-ring ${timer <= 3 && room.phase === "bidding" ? "urgent" : ""}`} style={{ "--timer": `${(timer / 10) * 360}deg` } as React.CSSProperties}><span>{room.phase === "bidding" ? timer : room.phase === "reveal" ? "··" : room.phase === "sold" ? "✓" : "—"}</span></div><div className="auctioneer-actions"><button disabled={!canSelfBid || Boolean(pending)} onClick={() => void bid()}>{pending === "bid" ? <LoaderCircle className="spin" size={18} /> : <Gavel size={18} />}{room.leaderId === room.selfPlayerId ? "HIGHEST BID" : room.phase === "reveal" ? "GET READY" : room.phase === "bidding" ? `BID ${formatMoney(proposedBid, room.sport)}` : "NEXT LOT LOADING"}</button></div></div>
              <AnimatePresence>{room.phase === "sold" || room.phase === "unsold" ? <motion.div className={`result-slam ${room.phase}`} initial={{ scale: 2.2, opacity: 0, rotate: -4 }} animate={{ scale: 1, opacity: 1, rotate: -2 }}><strong>{room.phase.toUpperCase()}</strong><span>{room.phase === "sold" ? `${leader?.teamName} · ${formatMoney(room.currentBid, room.sport)}` : "No bids received"}</span></motion.div> : null}</AnimatePresence>
            </motion.div>
          ) : null}</AnimatePresence>
        </section>

        <aside className="panel intelligence-panel"><div className="panel-heading"><div><span>LIVE INTELLIGENCE</span><strong>Auction ledger</strong></div><Clock3 size={18} /></div><div className="metric-row"><div><CircleDollarSign size={17} /><span><small>Committed</small><strong>{formatMoney(committed, room.sport)}</strong></span></div><div><Banknote size={17} /><span><small>Available</small><strong>{formatMoney(available, room.sport)}</strong></span></div></div><div className="section-label">RECENT BIDS</div>
          <div className="bid-ledger">{room.bids.length ? room.bids.slice(0, 6).map((event) => { const participant = room.participants.find((item) => item.id === event.participantId); return <div key={event.id}><span className="ledger-dot" style={{ background: participant?.color }} /><span><strong>{participant?.code}</strong><small>{new Date(event.at).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}</small></span><b>{formatMoney(event.amount, room.sport)}</b></div>; }) : <div className="empty-ledger">Bids from every device will appear here.</div>}</div>
          <div className="section-label">POOL COMPOSITION</div><div className="role-list">{roleCounts.map(([role, count]) => <div key={role}><span>{role}</span><strong>{count}</strong></div>)}</div>
          <div className="section-label">REAL PERFORMANCE STATS</div>{current?.realStats.length ? <div className="role-list">{current.realStats.slice(0, 4).map((stat) => <div key={`${stat.label}-${stat.scope}`}><span>{stat.label}</span><strong>{stat.value}</strong></div>)}</div> : <div className="stats-pending"><Clock3 size={15} /><span><strong>Provider sync pending</strong>No performance number is shown until it is returned by the configured sports API with provenance.</span></div>}
          <div className="source-note"><BadgeCheck size={16} /><span><strong>Transparent data policy</strong>The card rating and base price are game mechanics. Real statistics are displayed separately with their provider and scope.</span></div>
        </aside>
      </div>
      <footer><span><ShieldCheck size={14} /> SERVER-AUTHORITY ACTIVE</span><span>10-SECOND RESET · ATOMIC BIDS · RANDOMIZED LOT ORDER</span><button onClick={leaveLocalRoom}>LEAVE ROOM</button></footer>
      {error ? <div className="floating-error" role="alert">{error}</div> : null}
    </main>
  );
}

type LobbyProps = {
  room: RoomView;
  copied: boolean;
  pending: string | null;
  error: string | null;
  onCopy: () => void;
  onLeave: () => void;
  onConfigure: (sport: Sport) => void;
  onStart: () => void;
};

function Lobby({ room, copied, pending, error, onCopy, onLeave, onConfigure, onStart }: LobbyProps) {
  const self = room.participants.find((participant) => participant.id === room.selfPlayerId);
  return (
    <main className="lobby-shell">
      <div className="entry-grid" aria-hidden="true" />
      <header className="lobby-topbar"><div className="entry-brand"><div className="brand-mark"><Gavel size={22} /></div><div><strong>BIDARENA</strong><span>ROOM CONTROL</span></div></div><button onClick={onLeave}><ArrowLeft size={15} /> Leave room</button></header>
      <div className="lobby-layout">
        <motion.section className="lobby-main" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <div className="lobby-eyebrow"><Wifi size={13} /> PRIVATE ROOM ACTIVE</div><h1>{room.isAdmin ? "Your auction room is ready." : "You joined the war room."}</h1><p>{room.isAdmin ? "Share the code, choose the sport and start when every team is ready." : "The administrator will choose the sport and start the auction."}</p>
          <div className="invite-code"><span>INVITATION CODE</span><strong>{room.code}</strong><button onClick={onCopy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy code"}</button></div>
          <div className="lobby-section-heading"><span>CONNECTED TEAMS</span><strong>{room.participants.length}/10</strong></div>
          <div className="lobby-team-grid">{room.participants.map((participant) => <div key={participant.id} style={{ "--team": participant.color } as React.CSSProperties}><span className="team-avatar">{participant.code}</span><span><strong>{participant.teamName}</strong><small>{participant.isAdmin ? "Administrator" : "Bidder"}{participant.id === self?.id ? " · You" : ""}</small></span>{participant.isAdmin ? <Crown size={17} /> : <Radio size={15} />}</div>)}</div>
        </motion.section>
        <motion.aside className="lobby-control" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}>
          <span>AUCTION SETUP</span><h2>{room.isAdmin ? "Administrator controls" : "Waiting for administrator"}</h2>
          <div className="sport-choice"><button disabled={!room.isAdmin || Boolean(pending)} className={room.sport === "cricket" ? "active" : ""} onClick={() => onConfigure("cricket")}><strong>CRICKET</strong><small>Batters · bowlers · all-rounders</small></button><button disabled={!room.isAdmin || Boolean(pending)} className={room.sport === "football" ? "active" : ""} onClick={() => onConfigure("football")}><strong>FOOTBALL</strong><small>GK · defence · midfield · attack</small></button></div>
          {room.isAdmin ? <button className="primary-button lobby-start" disabled={!room.sport || Boolean(pending)} onClick={onStart}>{pending === "start" ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}{pending === "start" ? "Starting…" : "Start auction"}</button> : <div className="waiting-state"><LoaderCircle className="spin" size={18} /><span><strong>{room.sport ? `${room.sport} selected` : "Sport not selected"}</strong>The auction will launch automatically when the administrator starts.</span></div>}
          <div className="lobby-rulebook"><div><strong>10 sec</strong><span>Opening bid window</span></div><div><strong>+10 sec</strong><span>After every accepted bid</span></div><div><strong>Auto</strong><span>Sold or unsold settlement</span></div></div>
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
        </motion.aside>
      </div>
    </main>
  );
}
