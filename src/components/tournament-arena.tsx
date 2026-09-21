"use client";

import { Check, CircleDot, LoaderCircle, Play, Trophy, Users, ChevronUp, ChevronDown } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { FootballFormation, RoomView, TournamentFormat, TournamentFixture } from "@/lib/auction/types";

type Props = {
  room: RoomView;
  pending: string | null;
  error: string | null;
  onCommand: (path: string, body?: unknown) => Promise<void>;
  onLeave: () => void;
};

const FORMATIONS: Record<FootballFormation, string[]> = {
  "4-3-3": ["GK","LB","CB1","CB2","RB","CM1","CM2","CM3","LW","ST","RW"],
  "4-4-2": ["GK","LB","CB1","CB2","RB","LM","CM1","CM2","RM","ST1","ST2"],
  "4-2-3-1": ["GK","LB","CB1","CB2","RB","CDM1","CDM2","LW","CAM","RW","ST"],
  "3-5-2": ["GK","CB1","CB2","CB3","LWB","CM1","CAM","CM2","RWB","ST1","ST2"],
  "3-4-3": ["GK","CB1","CB2","CB3","LM","CM1","CM2","RM","LW","ST","RW"],
  "5-3-2": ["GK","LWB","CB1","CB2","CB3","RWB","CM1","CM2","CAM","ST1","ST2"],
  "4-1-4-1": ["GK","LB","CB1","CB2","RB","CDM","LM","CM1","CM2","RM","ST"],
};

function teamName(room: RoomView, id: string) {
  return room.participants.find((participant) => participant.id === id)?.teamName ?? "Team";
}

function playerName(room: RoomView, athleteId?: string) {
  if (!athleteId) return "Player";
  for (const participant of room.participants) {
    const player = participant.squad.find((entry) => entry.athleteId === athleteId);
    if (player) return player.athlete.shortName;
  }
  return "Player";
}

function formatFixture(room: RoomView, fixture: TournamentFixture) {
  return `${teamName(room, fixture.homeParticipantId)} vs ${teamName(room, fixture.awayParticipantId)}`;
}

function secondsLeft(endsAt: string | undefined, serverTime: string) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.parse(serverTime)) / 1000));
}

export function TournamentArena({ room, pending, error, onCommand, onLeave }: Props) {
  const self = room.participants.find((participant) => participant.id === room.selfPlayerId)!;
  const [format, setFormat] = useState<TournamentFormat>(() => room.participants.length >= 4 ? "league-knockout" : "league");
  const [overs, setOvers] = useState<10 | 20 | 50>(20);
  const [now, setNow] = useState(() => Date.parse(room.serverTime));
  const roundFixtures = room.tournament.fixtures.filter((fixture) => fixture.round === room.tournament.currentRound);
  const resultsRound = room.tournament.lastCompletedRound ?? (room.tournament.roundPhase === "results" ? room.tournament.currentRound : undefined);
  const completedRoundFixtures = resultsRound ? room.tournament.fixtures.filter((fixture) => fixture.round === resultsRound && fixture.status === "complete") : [];
  const selfFixture = roundFixtures.find((fixture) => fixture.homeParticipantId === self.id || fixture.awayParticipantId === self.id);
  const allReady = roundFixtures.length > 0 && roundFixtures.every((fixture) => fixture.status === "ready");
  const formatNeedsFourTeams = format === "league-knockout" || format === "groups-knockout";
  const formatAllowed = !formatNeedsFourTeams || room.participants.length >= 4;
  const countdown = secondsLeft(room.tournament.roundCountdownEndsAt, new Date(now).toISOString());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!room.isAdmin || room.tournament.roundPhase !== "countdown" || !room.tournament.roundCountdownEndsAt) return;
    const remaining = Math.max(0, Date.parse(room.tournament.roundCountdownEndsAt) - Date.now());
    const timer = window.setTimeout(() => { void onCommand("tournament/start-round", { expectedRound: room.tournament.currentRound }); }, remaining + 150);
    return () => window.clearTimeout(timer);
  }, [room.isAdmin, room.tournament.roundPhase, room.tournament.roundCountdownEndsAt, room.tournament.currentRound, onCommand]);

  if (room.tournament.status === "complete") {
    const champion = room.participants.find((participant) => participant.id === room.tournament.championParticipantId);
    return <main className="tournament-shell"><header className="tournament-topbar"><div><Trophy size={22}/><span><strong>BIDARENA TOURNAMENT</strong><small>ROOM {room.code} · COMPLETE · TEAMS LOCKED</small></span></div><button onClick={onLeave}>Dashboard</button></header><section className="tournament-champion"><Trophy size={58}/><span>BID ARENA PRO CHAMPIONS</span><h1>{champion?.teamName ?? "Champion"}</h1><h2>{room.sport === "football" ? "Football Champion" : "Cricket Champion"}</h2><p>Every team stayed locked from registration through the final. The full auction squads, fixtures and results remain attached to this saved game.</p><button className="primary-button" onClick={onLeave}>Return to dashboard</button></section></main>;
  }

  if (room.phase === "tournament-setup") {
    return <main className="tournament-shell"><header className="tournament-topbar"><div><Trophy size={22}/><span><strong>BIDARENA TOURNAMENT</strong><small>ROOM {room.code} · {room.sport?.toUpperCase()}</small></span></div><div className="tournament-header-actions"><span>🔒 TEAMS LOCK AFTER START</span><button onClick={onLeave}>Leave room</button></div></header><section className="tournament-setup-card"><span className="tournament-kicker">AUCTION COMPLETE</span><h1>Choose your tournament.</h1><p>Your auction teams are carried into the tournament once and stay locked for the entire competition.</p><div className="format-grid">{([['league','League only'],['league-knockout','League + knockouts'],['knockout','Straight knockout'],['groups-knockout','Groups + knockouts']] as Array<[TournamentFormat,string]>).map(([value,label]) => <button key={value} className={format === value ? "active" : ""} onClick={() => setFormat(value)} disabled={!room.isAdmin || ((value === "league-knockout" || value === "groups-knockout") && room.participants.length < 4)}><strong>{label}</strong><small>{(value === "league-knockout" || value === "groups-knockout") && room.participants.length < 4 ? "Requires at least 4 teams." : value === "league" ? "Every team plays every team." : value === "league-knockout" ? "League table, top 4, semifinals and final." : value === "knockout" ? "One loss and you are out." : "Groups followed by knockouts."}</small></button>)}</div>{room.sport === "cricket" ? <div className="overs-control"><span>MATCH FORMAT</span>{([10,20,50] as const).map((value) => <button key={value} className={overs === value ? "active" : ""} onClick={() => setOvers(value)} disabled={!room.isAdmin}>{value === 10 ? "T10" : value === 20 ? "T20" : "ODI"}</button>)}</div> : null}{room.isAdmin ? <button className="primary-button tournament-start" disabled={Boolean(pending) || !formatAllowed} onClick={() => void onCommand("tournament/setup", { format, cricketOvers: overs })}>{pending === "tournament/setup" ? <LoaderCircle className="spin" size={17}/> : <Play size={17}/>} Generate fixtures & lock tournament</button> : <div className="waiting-state"><LoaderCircle className="spin" size={18}/><span><strong>Waiting for administrator</strong>The host is choosing the tournament format.</span></div>}{error ? <div className="error-banner">{error}</div> : null}</section></main>;
  }

  return <main className="tournament-shell"><header className="tournament-topbar"><div><Trophy size={22}/><span><strong>BIDARENA TOURNAMENT</strong><small>{room.tournament.format?.replaceAll("-"," ").toUpperCase()} · ROUND {room.tournament.currentRound} · 🔒 LOCKED</small></span></div><div className="tournament-header-actions"><div className="tournament-round-status"><CircleDot size={14}/>{roundFixtures.filter((fixture) => fixture.status === "ready").length}/{roundFixtures.length} MATCHES READY</div>{room.isAdmin ? <button onClick={() => void onCommand("session/end")}>Save & End</button> : null}</div></header>
    {room.tournament.roundPhase === "countdown" ? <div style={countdownOverlay}><div style={countdownBadge}>ROUND {room.tournament.currentRound}</div><div style={countdownNumber}>{countdown || 1}</div><div style={countdownLabel}>GET READY · ALL MATCHES START TOGETHER</div></div> : null}
    <section className="tournament-dashboard"><aside className="tournament-side"><div className="tournament-section-title"><span>STANDINGS</span><Users size={14}/></div><div className="standings-table">{[...room.tournament.standings].sort((a,b) => b.points-a.points || (room.sport === "cricket" ? b.nrr-a.nrr : b.difference-a.difference)).map((row,index) => <div key={row.participantId}><b>{index+1}</b><strong>{teamName(room,row.participantId)}</strong><span>{room.sport === "cricket" ? `NRR ${row.nrr.toFixed(2)}` : `${row.played}P`}</span><span>{row.points} pts</span></div>)}</div><div className="tournament-section-title fixtures-title"><span>ROUND {room.tournament.currentRound} FIXTURES</span></div><div className="fixture-list">{roundFixtures.map((fixture) => <article key={fixture.id} className={fixture.status}><div><strong>{teamName(room,fixture.homeParticipantId)}</strong><span>vs</span><strong>{teamName(room,fixture.awayParticipantId)}</strong></div><small>{fixture.result ? fixture.result.summary : fixture.status === "ready" ? "READY" : "TEAM SETUP"}</small></article>)}</div>{room.isAdmin && room.tournament.roundPhase !== "countdown" ? <button className="primary-button round-start" disabled={Boolean(pending) || room.tournament.roundPhase === "live"} onClick={() => void onCommand("tournament/start-round", { expectedRound: room.tournament.currentRound })}>{pending === "tournament/start-round" ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>} {room.tournament.roundPhase === "results" ? "Start next round" : allReady ? "Start round" : "Auto-fill missing teams & start"}</button> : null}</aside>
      <section className="match-control">{room.tournament.roundPhase === "results" && completedRoundFixtures.length > 0 ? <RoundResults room={room} fixtures={completedRoundFixtures} round={resultsRound!}/> : selfFixture ? <><div className="match-heading"><span>YOUR MATCH</span><h1>{formatFixture(room,selfFixture)}</h1><p>{selfFixture.stage.toUpperCase()} · {selfFixture.status === "ready" ? "Starting lineup ready." : "Complete your team setup or let the host auto-fill."}</p></div>{selfFixture.result ? <ResultCard room={room} fixture={selfFixture}/> : room.sport === "football" ? <FootballSetup room={room} fixture={selfFixture} onCommand={onCommand} pending={pending}/> : <CricketSetup room={room} fixture={selfFixture} onCommand={onCommand} pending={pending}/>}</> : <div className="no-fixture"><Trophy size={42}/><h2>No match this round</h2><p>Your team has a bye. Follow every other game in the round from the results centre.</p></div>}{error ? <div className="error-banner floating-match-error">{error}</div> : null}</section></section></main>;
}

const countdownOverlay: CSSProperties = { position:"fixed", inset:0, zIndex:50, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"rgba(4,9,15,.94)", backdropFilter:"blur(12px)" };
const countdownBadge: CSSProperties = { fontSize:14, letterSpacing:".18em", textTransform:"uppercase", color:"#56e0c4", fontWeight:800 };
const countdownNumber: CSSProperties = { fontSize:"clamp(110px,25vw,220px)", lineHeight:.9, fontWeight:900, margin:"18px 0", color:"white" };
const countdownLabel: CSSProperties = { fontSize:13, letterSpacing:".12em", color:"#a7b1bf", textAlign:"center" };

function RoundResults({ room, fixtures, round }: { room: RoomView; fixtures: TournamentFixture[]; round: number }) {
  return <div style={{display:"grid",gap:16}}><div className="match-heading"><span>ROUND {round} COMPLETE</span><h1>🏟️ Round Results</h1><p>Every game from this round is now visible to every team.</p></div>{fixtures.map((fixture) => <ResultCard key={fixture.id} room={room} fixture={fixture}/>)}<div className="tournament-section-title"><span>ROUND {round} SUMMARY</span></div><div className="result-summary-grid"><div><strong>{fixtures.length}</strong><span>matches</span></div><div><strong>{fixtures.reduce((sum, f) => sum + (f.result?.homeScore ?? 0) + (f.result?.awayScore ?? 0), 0)}</strong><span>{room.sport === "football" ? "goals" : "runs"} scored</span></div><div><strong>{fixtures.filter((f) => f.result && f.result.homeScore !== f.result.awayScore).length}</strong><span>decided games</span></div></div></div>;
}

function ResultCard({ room, fixture }: { room: RoomView; fixture: TournamentFixture }) {
  const result = fixture.result;
  if (!result) return null;
  const playerOfMatch = result.playerOfMatchAthleteId ? playerName(room, result.playerOfMatchAthleteId) : null;
  return <article style={{padding:18,border:"1px solid rgba(86,224,196,.22)",borderRadius:16,background:"rgba(11,18,27,.82)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><span style={{fontSize:12,letterSpacing:".1em",color:"#56e0c4"}}>{fixture.stage.toUpperCase()}</span><strong style={{fontSize:24}}>{result.summary}</strong></div><div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"center",margin:"16px 0"}}><strong>{teamName(room,fixture.homeParticipantId)}</strong><span style={{color:"#778396"}}>VS</span><strong style={{textAlign:"right"}}>{teamName(room,fixture.awayParticipantId)}</strong></div><div style={{color:"#9aa6b6",fontSize:13}}>{result.homeDetail ?? ""}<span style={{float:"right"}}>{result.awayDetail ?? ""}</span></div><div style={{display:"grid",gap:8,marginTop:12}}>{result.events?.map((event) => <div key={event.id} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:13}}><span>{event.minute ? `${event.minute}' ` : ""}{event.type === "goal" ? "⚽" : event.type === "top-scorer" ? "🏏" : "🎯"}</span><strong>{playerName(room,event.athleteId)}</strong><span style={{color:"#9aa6b6",textAlign:"right"}}>{event.label}</span></div>)}</div>{playerOfMatch ? <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.08)",fontSize:13}}>⭐ <strong>Player of the Match:</strong> {playerOfMatch}</div> : null}</article>;
}

function FootballSetup({ room, fixture, onCommand, pending }: { room: RoomView; fixture: TournamentFixture; onCommand: Props["onCommand"]; pending: string | null }) {
  const self = room.participants.find((participant) => participant.id === room.selfPlayerId)!;
  const existing = fixture.footballLineups?.[self.id];
  const [formation,setFormation] = useState<FootballFormation>(existing?.formation ?? "4-3-3");
  const [assignments,setAssignments] = useState<Record<string,string>>(() => existing?.slotAssignments ?? Object.fromEntries(FORMATIONS[existing?.formation ?? "4-3-3"].map((slot,index) => [slot,self.squad[index]?.athleteId ?? ""])));
  const slots = FORMATIONS[formation];
  const selected = Object.values(assignments).filter(Boolean);
  const valid = selected.length === 11 && new Set(selected).size === 11;
  const changeFormation = (next: FootballFormation) => { setFormation(next); setAssignments(Object.fromEntries(FORMATIONS[next].map((slot,index) => [slot, assignments[slot] ?? self.squad[index]?.athleteId ?? ""]))); };
  return <div className="sport-setup"><div className="setup-toolbar"><label><span>FORMATION</span><select value={formation} onChange={(e) => changeFormation(e.target.value as FootballFormation)}>{Object.keys(FORMATIONS).map((value) => <option key={value}>{value}</option>)}</select></label><div><strong>{new Set(selected).size}/11</strong><small>unique starters</small></div></div><div className="football-pitch">{slots.map((slot) => <label key={slot}><span>{slot}</span><select value={assignments[slot] ?? ""} onChange={(e) => setAssignments((current) => ({...current,[slot]:e.target.value}))}><option value="">Select player</option>{self.squad.map((entry) => <option key={entry.athleteId} value={entry.athleteId}>{entry.athlete.shortName} · {entry.athlete.role}</option>)}</select></label>)}</div><button className="primary-button submit-lineup" disabled={!valid || Boolean(pending)} onClick={() => void onCommand("tournament/lineup",{sport:"football",fixtureId:fixture.id,lineup:{formation,starterIds:selected,slotAssignments:assignments,substituteIds:self.squad.map((entry) => entry.athleteId).filter((id) => !selected.includes(id)).slice(0,7)}})}>{existing ? <Check size={16}/> : <Play size={16}/>} {existing ? "Update starting XI" : "Submit starting XI"}</button></div>;
}

function CricketSetup({ room, fixture, onCommand, pending }: { room: RoomView; fixture: TournamentFixture; onCommand: Props["onCommand"]; pending: string | null }) {
  const self = room.participants.find((participant) => participant.id === room.selfPlayerId)!;
  const existing = fixture.cricketLineups?.[self.id];
  const [xi,setXi] = useState<string[]>(existing?.playingXi ?? self.squad.slice(0,11).map((entry) => entry.athleteId));
  const [batting,setBatting] = useState<string[]>(existing?.battingOrder ?? xi);
  const [bowling,setBowling] = useState<string[]>(existing?.bowlingPlan ?? Array.from({length:room.tournament.cricketOvers},(_,index) => xi[index % Math.max(1,Math.min(5,xi.length))] ?? ""));
  const myCall = fixture.toss?.calls[self.id];
  const toggleXi = (id:string) => { const next = xi.includes(id) ? xi.filter((x) => x !== id) : xi.length < 11 ? [...xi,id] : xi; setXi(next); setBatting((current) => [...current.filter((x) => next.includes(x)),...next.filter((x) => !current.includes(x))].slice(0,11)); setBowling((current) => Array.from({length:room.tournament.cricketOvers},(_,i) => current[i] && next.includes(current[i]) ? current[i] : next[i % Math.max(1,Math.min(5,next.length))] ?? "")); };
  const move = (index:number,delta:number) => setBatting((current) => { const next=[...current]; const target=index+delta; if(target<0||target>=next.length)return current; [next[index],next[target]]=[next[target],next[index]]; return next; });
  const valid = xi.length === 11 && batting.length === 11 && bowling.length === room.tournament.cricketOvers && bowling.every(Boolean);
  return <div className="sport-setup cricket-setup"><section className="toss-panel"><span>1 · TOSS</span>{!myCall ? <div><button onClick={() => void onCommand("tournament/toss",{action:"call",fixtureId:fixture.id,call:"heads"})}>Heads</button><button onClick={() => void onCommand("tournament/toss",{action:"call",fixtureId:fixture.id,call:"tails"})}>Tails</button></div> : <p>You called <strong>{myCall}</strong>. {fixture.toss?.coin ? <>Coin: <strong>{fixture.toss.coin}</strong>.</> : "Waiting for opponent."}</p>}{fixture.toss?.winnerParticipantId === self.id && !fixture.toss.decision ? <div className="decision-buttons"><button onClick={() => void onCommand("tournament/toss",{action:"decision",fixtureId:fixture.id,decision:"bat"})}>Bat</button><button onClick={() => void onCommand("tournament/toss",{action:"decision",fixtureId:fixture.id,decision:"bowl"})}>Bowl</button></div> : null}</section><section className="cricket-xi"><div className="setup-toolbar"><div><strong>{xi.length}/11</strong><small>playing XI</small></div></div><div className="xi-grid">{self.squad.map((entry) => <button key={entry.athleteId} className={xi.includes(entry.athleteId) ? "selected" : ""} onClick={() => toggleXi(entry.athleteId)}>{entry.athlete.shortName}<small>{entry.athlete.role}</small></button>)}</div></section><section className="batting-order"><strong>Batting order</strong>{batting.map((id,index) => <div key={id}><span>{index+1}</span><strong>{playerName(room,id)}</strong><button onClick={() => move(index,-1)}><ChevronUp size={14}/></button><button onClick={() => move(index,1)}><ChevronDown size={14}/></button></div>)}</section><section><strong>Bowling plan</strong><div className="bowling-grid">{bowling.map((id,index) => <label key={index}><span>O{index+1}</span><select value={id} onChange={(e) => setBowling((current) => current.map((value,i) => i===index ? e.target.value : value))}>{xi.map((playerId) => <option key={playerId} value={playerId}>{playerName(room,playerId)}</option>)}</select></label>)}</div></section><button className="primary-button submit-lineup" disabled={!valid || Boolean(pending) || !fixture.toss?.decision} onClick={() => void onCommand("tournament/lineup",{sport:"cricket",fixtureId:fixture.id,lineup:{playingXi:xi,battingOrder:batting,bowlingPlan:bowling}})}>{existing ? <Check size={16}/> : <Play size={16}/>} {existing ? "Update match plan" : "Submit match plan"}</button></div>;
}
