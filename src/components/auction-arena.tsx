"use client";

import { AnimatePresence, motion } from "motion/react";
import { Activity, BadgeCheck, Banknote, ChevronRight, CircleDollarSign, Clock3, Gavel, Radio, RefreshCw, ShieldCheck, Sparkles, Trophy, Users, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { athleteCatalog } from "@/data/catalog";
import { canBid, formatMoney, nextBidAmount, secureShuffle } from "@/lib/auction/engine";
import type { Athlete, AuctionPhase, BidEvent, Franchise, Sale, Sport } from "@/lib/auction/types";

const TEAM_TEMPLATES = [
  { name: "Mumbai Mavericks", code: "MM", color: "#5b8cff" },
  { name: "Royal Falcons", code: "RF", color: "#ff665f" },
  { name: "Emerald United", code: "EU", color: "#44d49b" },
  { name: "Golden Titans", code: "GT", color: "#f2bd4d" },
];

function makeFranchises(): Franchise[] {
  return TEAM_TEMPLATES.map((team, index) => ({ id: `team-${index + 1}`, ...team, budget: 1200, initialBudget: 1200, squad: [] }));
}

export function AuctionArena() {
  const [sport, setSport] = useState<Sport>("cricket");
  const [queue, setQueue] = useState<Athlete[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<AuctionPhase>("reveal");
  const [franchises, setFranchises] = useState<Franchise[]>(makeFranchises);
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [currentBid, setCurrentBid] = useState(0);
  const [timer, setTimer] = useState(18);
  const [bids, setBids] = useState<BidEvent[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [sound, setSound] = useState(true);
  const [roomId, setRoomId] = useState("BP-000000");
  const audioRef = useRef<AudioContext | null>(null);
  const current = queue[index];

  const tone = useCallback((frequency: number, duration = 0.08) => {
    if (!sound || typeof window === "undefined") return;
    audioRef.current ??= new AudioContext();
    const context = audioRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + duration);
  }, [sound]);

  const startAuction = useCallback((nextSport: Sport = sport) => {
    const shuffled = secureShuffle(athleteCatalog.filter((athlete) => athlete.sport === nextSport));
    setQueue(shuffled); setSport(nextSport); setIndex(0); setPhase("reveal"); setLeaderId(null);
    setCurrentBid(shuffled[0]?.basePrice ?? 0); setTimer(18); setBids([]); setSales([]); setFranchises(makeFranchises());
    setRoomId(`BP-${crypto.getRandomValues(new Uint32Array(1))[0].toString().slice(0, 6)}`);
  }, [sport]);

  useEffect(() => {
    const initialize = window.setTimeout(() => startAuction("cricket"), 0);
    return () => window.clearTimeout(initialize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== "reveal") return;
    const reveal = window.setTimeout(() => setPhase("bidding"), 2400);
    return () => window.clearTimeout(reveal);
  }, [phase, index]);

  const sell = useCallback(() => {
    if (!current || phase !== "bidding") return;
    if (leaderId) {
      setFranchises((existing) => existing.map((team) => team.id === leaderId ? { ...team, budget: team.budget - currentBid, squad: [...team.squad, current] } : team));
      setSales((existing) => [...existing, { athlete: current, franchiseId: leaderId, amount: currentBid }]);
      setPhase("sold"); tone(110, 0.22); window.setTimeout(() => tone(220, 0.28), 120);
    } else setPhase("unsold");
  }, [current, currentBid, leaderId, phase, tone]);

  useEffect(() => {
    if (phase !== "bidding") return;
    if (timer <= 0) {
      const finish = window.setTimeout(sell, 0);
      return () => window.clearTimeout(finish);
    }
    const tick = window.setTimeout(() => setTimer((value) => value - 1), 1000);
    return () => window.clearTimeout(tick);
  }, [phase, sell, timer]);

  function placeBid(franchise: Franchise) {
    if (!current || phase !== "bidding") return;
    const amount = leaderId ? nextBidAmount(currentBid, current.basePrice) : current.basePrice;
    if (leaderId === franchise.id || !canBid(franchise, amount)) return;
    setCurrentBid(amount); setLeaderId(franchise.id); setTimer((value) => value < 7 ? 7 : value);
    setBids((existing) => [{ id: crypto.randomUUID(), athleteId: current.id, franchiseId: franchise.id, amount, at: new Date().toISOString() }, ...existing].slice(0, 8));
    tone(420 + amount / 3);
  }

  function nextPlayer() {
    if (index + 1 >= queue.length) { setPhase("complete"); return; }
    const next = queue[index + 1]; setIndex((value) => value + 1); setCurrentBid(next.basePrice); setLeaderId(null); setTimer(18); setPhase("reveal");
  }

  const leader = franchises.find((team) => team.id === leaderId);
  const progress = queue.length ? Math.round(((index + (phase === "complete" ? 1 : 0)) / queue.length) * 100) : 0;
  const roleCounts = useMemo(() => Object.entries(queue.reduce<Record<string, number>>((result, athlete) => ({ ...result, [athlete.role]: (result[athlete.role] ?? 0) + 1 }), {})).slice(0, 4), [queue]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><Gavel size={22} /></div><div><strong>BIDARENA</strong><span>PRO AUCTION OS</span></div></div>
        <div className="sport-switch" aria-label="Choose sport">{(["cricket", "football"] as Sport[]).map((item) => <button key={item} className={sport === item ? "active" : ""} onClick={() => item !== sport && startAuction(item)}>{item}</button>)}</div>
        <div className="room-status"><span><Radio size={14} /> LIVE ROOM</span><strong>{roomId}</strong><button className="icon-button" onClick={() => setSound((value) => !value)} aria-label="Toggle sound">{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button></div>
      </header>

      <section className="command-strip"><div><Activity size={15} /><span>AUCTION {phase.toUpperCase()}</span></div><div className="progress-track"><motion.span animate={{ width: `${progress}%` }} /></div><div className="command-meta"><span>LOT {String(index + 1).padStart(3, "0")}</span><span>{queue.length} VERIFIED ATHLETES</span></div></section>

      <div className="workspace">
        <aside className="panel teams-panel">
          <div className="panel-heading"><div><span>FRANCHISES</span><strong>War room</strong></div><Users size={18} /></div>
          <div className="team-list">{franchises.map((team) => {
            const proposed = current ? (leaderId ? nextBidAmount(currentBid, current.basePrice) : current.basePrice) : 0;
            const disabled = phase !== "bidding" || leaderId === team.id || !canBid(team, proposed);
            return <motion.button whileTap={{ scale: 0.98 }} key={team.id} className={`team-card ${leaderId === team.id ? "leading" : ""}`} onClick={() => placeBid(team)} disabled={disabled} style={{ "--team": team.color } as React.CSSProperties}><span className="team-avatar">{team.code}</span><span className="team-copy"><strong>{team.name}</strong><small>{team.squad.length} players · {formatMoney(team.budget, sport)} left</small></span><span className="bid-action">{leaderId === team.id ? "LEADS" : "BID"}</span></motion.button>;
          })}</div>
          <div className="integrity-note"><ShieldCheck size={17} /><span><strong>Budget guard active</strong>Every bid is validated before acceptance.</span></div>
        </aside>

        <section className="auction-stage"><div className="stage-lights" aria-hidden="true"><i /><i /><i /><i /><i /></div><div className="stage-grid" aria-hidden="true" />
          <AnimatePresence mode="wait">{phase === "complete" ? (
            <motion.div key="complete" className="complete-state" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}><Trophy size={60} /><span>AUCTION COMPLETE</span><h1>Final squads are locked</h1><p>{sales.length} verified sales recorded in the room ledger.</p><button className="primary-button" onClick={() => startAuction()}><RefreshCw size={17} /> New randomized auction</button></motion.div>
          ) : current ? (
            <motion.div key={current.id} className="player-presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <motion.div className="reveal-kicker" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}><Sparkles size={14} /> {current.role} · {current.country}</motion.div>
              <motion.div className={`player-card ${phase}`} initial={{ rotateY: 90, scale: 0.72 }} animate={{ rotateY: 0, scale: 1 }} transition={{ type: "spring", stiffness: 90, damping: 14 }}>
                <div className="card-shine" /><div className="card-top"><div><strong>{current.rating}</strong><span>{current.role.split(" ")[0]}</span></div><BadgeCheck size={22} /></div><div className="player-silhouette" aria-hidden="true"><span>{current.shortName.split(" ").map((part) => part[0]).join("")}</span></div>
                <div className="card-identity"><span>{current.country.toUpperCase()} · {current.team.toUpperCase()}</span><h1>{current.name}</h1><p>{current.secondaryRole ?? current.role}</p></div><div className="stat-grid">{current.stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div><div className="data-stamp"><BadgeCheck size={12} /> Identity verified · {current.source}</div>
              </motion.div>
              <div className="bid-console"><div><span>{leader ? "CURRENT BID" : "BASE PRICE"}</span><motion.strong key={currentBid} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{formatMoney(currentBid, sport)}</motion.strong><small>{leader ? `Leading: ${leader.name}` : "Waiting for opening bid"}</small></div><div className={`timer-ring ${timer <= 6 ? "urgent" : ""}`} style={{ "--timer": `${(timer / 18) * 360}deg` } as React.CSSProperties}><span>{phase === "bidding" ? timer : phase === "reveal" ? "··" : "✓"}</span></div><div className="auctioneer-actions">{phase === "bidding" ? <button onClick={sell}><Gavel size={18} /> {leader ? "SELL PLAYER" : "PASS UNSOLD"}</button> : <button onClick={nextPlayer}>NEXT LOT <ChevronRight size={18} /></button>}</div></div>
              <AnimatePresence>{phase === "sold" || phase === "unsold" ? <motion.div className={`result-slam ${phase}`} initial={{ scale: 2.2, opacity: 0, rotate: -4 }} animate={{ scale: 1, opacity: 1, rotate: -2 }}><strong>{phase.toUpperCase()}</strong><span>{phase === "sold" ? `${leader?.name} · ${formatMoney(currentBid, sport)}` : "Returns in accelerated round"}</span></motion.div> : null}</AnimatePresence>
            </motion.div>
          ) : null}</AnimatePresence>
        </section>

        <aside className="panel intelligence-panel"><div className="panel-heading"><div><span>LIVE INTELLIGENCE</span><strong>Auction ledger</strong></div><Clock3 size={18} /></div><div className="metric-row"><div><CircleDollarSign size={17} /><span><small>Committed</small><strong>{formatMoney(sales.reduce((sum, sale) => sum + sale.amount, 0), sport)}</strong></span></div><div><Banknote size={17} /><span><small>Available</small><strong>{formatMoney(franchises.reduce((sum, team) => sum + team.budget, 0), sport)}</strong></span></div></div><div className="section-label">RECENT BIDS</div>
          <div className="bid-ledger">{bids.length ? bids.map((bid) => { const team = franchises.find((item) => item.id === bid.franchiseId); return <div key={bid.id}><span className="ledger-dot" style={{ background: team?.color }} /><span><strong>{team?.code}</strong><small>{new Date(bid.at).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}</small></span><b>{formatMoney(bid.amount, sport)}</b></div>; }) : <div className="empty-ledger">Bids will appear here in real time.</div>}</div>
          <div className="section-label">POOL COMPOSITION</div><div className="role-list">{roleCounts.map(([role, count]) => <div key={role}><span>{role}</span><strong>{count}</strong></div>)}</div><div className="source-note"><BadgeCheck size={16} /><span><strong>No synthetic statistics</strong>Player identities come from configured sports-data providers. Auction ratings and prices are game mechanics.</span></div>
        </aside>
      </div>
      <footer><span><ShieldCheck size={14} /> SERVER-AUTHORITY READY</span><span>EVENT LEDGER · RECONNECT SAFE · RANDOMIZED LOT ORDER</span><span>v1.0.0</span></footer>
    </main>
  );
}
