"use client";

import { Check, ChevronDown, ChevronUp, CircleDot, LoaderCircle, Play, Trophy, Users } from "lucide-react";
import { useState } from "react";
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

function fixtureLabel(room: RoomView, fixture: TournamentFixture) {
  return `${teamName(room, fixture.homeParticipantId)} vs ${teamName(room, fixture.awayParticipantId)}`;
}

export function TournamentArena({ room, pending, error, onCommand, onLeave }: Props) {
  const self = room.participants.find((participant) => participant.id === room.selfPlayerId)!;
  const [format, setFormat] = useState<TournamentFormat>("league-knockout");
  const [overs, setOvers] = useState<10 | 20 | 50>(20);
  const roundFixtures = room.tournament.fixtures.filter((fixture) => fixture.round === room.tournament.currentRound);
  const selfFixture = roundFixtures.find((fixture) => fixture.homeParticipantId === self.id || fixture.awayParticipantId === self.id);
  const allReady = roundFixtures.length > 0 && roundFixtures.every((fixture) => fixture.status === "ready");

  if (room.tournament.status === "complete") {
    const champion = room.participants.find((participant) => participant.id === room.tournament.championParticipantId);
    return (
      <main className="tournament-shell">
        <header className="tournament-topbar"><div><Trophy size={22}/><span><strong>BIDARENA TOURNAMENT</strong><small>ROOM {room.code} · COMPLETE</small></span></div><button onClick={onLeave}>Dashboard</button></header>
        <section className="tournament-champion"><Trophy size={58}/><span>BID ARENA PRO CHAMPIONS</span><h1>{champion?.teamName ?? "Champion"}</h1><h2>{room.sport === "football" ? "Football Champion" : "Cricket Champion"}</h2><p>The full tournament, auction squads, transfers, fixtures and results remain attached to this saved room.</p><button className="primary-button" onClick={onLeave}>Return to dashboard</button></section>
      </main>
    );
  }

  if (room.phase === "tournament-setup") {
    return (
      <main className="tournament-shell">
        <header className="tournament-topbar">
          <div><Trophy size={22}/><span><strong>BIDARENA TOURNAMENT</strong><small>ROOM {room.code} · {room.sport?.toUpperCase()}</small></span></div>
          <div className="tournament-header-actions">{room.isAdmin ? <button onClick={() => void onCommand("session/end")}>Save & End</button> : null}<button onClick={onLeave}>Leave room</button></div>
        </header>
        <section className="tournament-setup-card">
          <span className="tournament-kicker">AUCTION COMPLETE</span>
          <h1>Choose your tournament.</h1>
          <p>Your auction squads and transfer deals are locked into this same saved game.</p>
          <div className="format-grid">
            {([
              ["league","League only"],
              ["league-knockout","League + knockouts"],
              ["knockout","Straight knockout"],
              ["groups-knockout","Groups + knockouts"],
            ] as Array<[TournamentFormat,string]>).map(([value,label]) => (
              <button key={value} className={format === value ? "active" : ""} onClick={() => setFormat(value)} disabled={!room.isAdmin}>
                <strong>{label}</strong>
                <small>{value === "league" ? "Every team plays every team." : value === "league-knockout" ? "League table, top 4, semifinals and final." : value === "knockout" ? "One loss and you are out." : "Split groups followed by knockout rounds."}</small>
              </button>
            ))}
          </div>
          {room.sport === "cricket" ? (
            <div className="overs-control"><span>MATCH FORMAT</span>{([10,20,50] as const).map((value) => <button key={value} className={overs === value ? "active" : ""} onClick={() => setOvers(value)} disabled={!room.isAdmin}>{value === 10 ? "T10" : value === 20 ? "T20" : "ODI"}</button>)}</div>
          ) : null}
          {room.isAdmin ? (
            <button className="primary-button tournament-start" disabled={Boolean(pending)} onClick={() => void onCommand("tournament/setup", { format, cricketOvers: overs })}>
              {pending === "tournament/setup" ? <LoaderCircle className="spin" size={17}/> : <Play size={17}/>} Generate fixtures
            </button>
          ) : <div className="waiting-state"><LoaderCircle className="spin" size={18}/><span><strong>Waiting for administrator</strong>The host is choosing the tournament format.</span></div>}
          {error ? <div className="error-banner">{error}</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="tournament-shell">
      <header className="tournament-topbar">
        <div><Trophy size={22}/><span><strong>BIDARENA TOURNAMENT</strong><small>{room.tournament.format?.replaceAll("-"," ").toUpperCase()} · ROUND {room.tournament.currentRound}</small></span></div>
        <div className="tournament-header-actions"><div className="tournament-round-status"><CircleDot size={14}/>{roundFixtures.filter((fixture) => fixture.status === "ready").length}/{roundFixtures.length} MATCHES READY</div>{room.isAdmin ? <button onClick={() => void onCommand("session/end")}>Save & End</button> : null}</div>
      </header>

      <section className="tournament-dashboard">
        <aside className="tournament-side">
          <div className="tournament-section-title"><span>STANDINGS</span><Users size={14}/></div>
          <div className="standings-table">
            {[...room.tournament.standings].sort((a,b) => b.points-a.points || (room.sport === "cricket" ? b.nrr-a.nrr : b.difference-a.difference)).map((row,index) => (
              <div key={row.participantId}><b>{index+1}</b><strong>{teamName(room,row.participantId)}</strong><span>{room.sport === "cricket" ? `NRR ${row.nrr.toFixed(2)}` : `${row.played}P`}</span><span>{row.points} pts</span></div>
            ))}
          </div>
          <div className="tournament-section-title fixtures-title"><span>ROUND {room.tournament.currentRound} FIXTURES</span></div>
          <div className="fixture-list">{roundFixtures.map((fixture) => (
            <article key={fixture.id} className={fixture.status}>
              <div><strong>{teamName(room,fixture.homeParticipantId)}</strong><span>vs</span><strong>{teamName(room,fixture.awayParticipantId)}</strong></div>
              <small>{fixture.result ? fixture.result.summary : fixture.status === "ready" ? "READY" : "TEAM SETUP"}</small>
            </article>
          ))}</div>
          {room.isAdmin ? <button className="primary-button round-start" disabled={Boolean(pending)} onClick={() => void onCommand("tournament/start-round", { expectedRound: room.tournament.currentRound })}>{pending === "tournament/start-round" ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>} {allReady ? "Start round" : "Auto-fill missing teams & start"}</button> : null}
        </aside>

        <section className="match-control">
          {selfFixture ? (
            <>
              <div className="match-heading"><span>YOUR MATCH</span><h1>{fixtureLabel(room,selfFixture)}</h1><p>{selfFixture.stage.toUpperCase()} · {selfFixture.status === "ready" ? "Your match is ready for the host to start." : "Complete your team setup below."}</p></div>
              {selfFixture.result ? <ResultCard room={room} fixture={selfFixture}/> : room.sport === "football" ? <FootballSetup room={room} fixture={selfFixture} onCommand={onCommand} pending={pending}/> : <CricketSetup room={room} fixture={selfFixture} onCommand={onCommand} pending={pending}/>}
            </>
          ) : <div className="no-fixture"><Trophy size={42}/><h2>No match this round</h2><p>Your team has a bye. You can follow the other fixtures from the sidebar.</p></div>}
          {error ? <div className="error-banner floating-match-error">{error}</div> : null}
        </section>
      </section>
    </main>
  );
}

function FootballSetup({ room, fixture, onCommand, pending }: { room: RoomView; fixture: TournamentFixture; onCommand: Props["onCommand"]; pending: string | null }) {
  const self = room.participants.find((participant) => participant.id === room.selfPlayerId)!;
  const existing = fixture.footballLineups?.[self.id];
  const [formation,setFormation] = useState<FootballFormation>(existing?.formation ?? "4-3-3");
  const initialFormation = existing?.formation ?? "4-3-3";
  const [assignments,setAssignments] = useState<Record<string,string>>(() => {
    if (existing?.slotAssignments) return existing.slotAssignments;
    return Object.fromEntries(FORMATIONS[initialFormation].map((slot,index) => [slot, self.squad[index]?.athleteId ?? ""]));
  });
  const slots = FORMATIONS[formation];

  const changeFormation = (nextFormation: FootballFormation) => {
    setFormation(nextFormation);
    setAssignments((current) => Object.fromEntries(
      FORMATIONS[nextFormation].map((slot,index) => [slot, current[slot] ?? self.squad[index]?.athleteId ?? ""]),
    ));
  };

  const selected = Object.values(assignments).filter(Boolean);
  const valid = selected.length === 11 && new Set(selected).size === 11;

  return <div className="sport-setup">
    <div className="setup-toolbar"><label><span>FORMATION</span><select value={formation} onChange={(event) => changeFormation(event.target.value as FootballFormation)}>{Object.keys(FORMATIONS).map((value) => <option key={value}>{value}</option>)}</select></label><div><strong>{new Set(selected).size}/11</strong><small>unique starters</small></div></div>
    <div className="football-pitch">
      {slots.map((slot) => <label key={slot}><span>{slot}</span><select value={assignments[slot] ?? ""} onChange={(event) => setAssignments((current) => ({...current,[slot]:event.target.value}))}><option value="">Select player</option>{self.squad.map((entry) => <option key={entry.athleteId} value={entry.athleteId}>{entry.athlete.shortName} · {entry.athlete.role}</option>)}</select></label>)}
    </div>
    <button className="primary-button submit-lineup" disabled={!valid || Boolean(pending)} onClick={() => void onCommand("tournament/lineup", { sport:"football", fixtureId:fixture.id, lineup:{ formation, starterIds:selected, slotAssignments:assignments, substituteIds:self.squad.map((entry) => entry.athleteId).filter((id) => !selected.includes(id)).slice(0,7) } })}>{existing ? <Check size={16}/> : <Play size={16}/>} {existing ? "Update starting XI" : "Submit starting XI"}</button>
  </div>;
}

function CricketSetup({ room, fixture, onCommand, pending }: { room: RoomView; fixture: TournamentFixture; onCommand: Props["onCommand"]; pending: string | null }) {
  const self = room.participants.find((participant) => participant.id === room.selfPlayerId)!;
  const existing = fixture.cricketLineups?.[self.id];
  const [xi,setXi] = useState<string[]>(existing?.playingXi ?? self.squad.slice(0,11).map((entry) => entry.athleteId));
  const [batting,setBatting] = useState<string[]>(existing?.battingOrder ?? xi);
  const [bowling,setBowling] = useState<string[]>(existing?.bowlingPlan ?? Array.from({length:room.tournament.cricketOvers},(_,index) => xi[index % Math.max(1,Math.min(5,xi.length))] ?? ""));

  const myCall = fixture.toss?.calls[self.id];
  const tossWinner = fixture.toss?.winnerParticipantId;
  const move = (index:number,delta:number) => setBatting((current) => {
    const next=[...current]; const target=index+delta; if(target<0||target>=next.length) return current;
    [next[index],next[target]]=[next[target],next[index]]; return next;
  });

  const toggleXi = (id: string) => {
    const nextXi = xi.includes(id) ? xi.filter((candidate) => candidate !== id) : xi.length < 11 ? [...xi, id] : xi;
    setXi(nextXi);
    setBatting((current) => [...current.filter((playerId) => nextXi.includes(playerId)), ...nextXi.filter((playerId) => !current.includes(playerId))].slice(0, 11));
    setBowling((current) => Array.from(
      { length: room.tournament.cricketOvers },
      (_, index) => current[index] && nextXi.includes(current[index]) ? current[index] : nextXi[index % Math.max(1, Math.min(5, nextXi.length))] ?? "",
    ));
  };

  return <div className="sport-setup cricket-setup">
    <section className="toss-panel"><span>1 · TOSS</span>
      {!myCall ? <div><button onClick={() => void onCommand("tournament/toss",{action:"call",fixtureId:fixture.id,call:"heads"})}>Heads</button><button onClick={() => void onCommand("tournament/toss",{action:"call",fixtureId:fixture.id,call:"tails"})}>Tails</button></div> : <p>You called <strong>{myCall}</strong>. {fixture.toss?.coin ? <>Coin: <strong>{fixture.toss.coin}</strong>.</> : "Waiting for opponent."}</p>}
      {tossWinner === self.id && !fixture.toss?.decision ? <div className="decision-buttons"><button onClick={() => void onCommand("tournament/toss",{action:"decision",fixtureId:fixture.id,decision:"bat"})}>Bat first</button><button onClick={() => void onCommand("tournament/toss",{action:"decision",fixtureId:fixture.id,decision:"bowl"})}>Bowl first</button></div> : null}
      {fixture.toss?.decision ? <p><strong>{teamName(room,tossWinner!)}</strong> won the toss and chose to <strong>{fixture.toss.decision}</strong>.</p> : null}
    </section>

    <section><div className="tournament-section-title"><span>2 · PLAYING XI</span><b>{xi.length}/11</b></div><div className="cricket-player-grid">{self.squad.map((entry) => <button key={entry.athleteId} className={xi.includes(entry.athleteId) ? "selected" : ""} onClick={() => toggleXi(entry.athleteId)}><strong>{entry.athlete.shortName}</strong><small>{entry.athlete.role}</small></button>)}</div></section>

    <section><div className="tournament-section-title"><span>3 · BATTING ORDER</span></div><div className="batting-order">{batting.map((id,index) => {const athlete=self.squad.find((entry)=>entry.athleteId===id)?.athlete; return <div key={id}><b>{index+1}</b><strong>{athlete?.shortName}</strong><span><button onClick={()=>move(index,-1)}><ChevronUp size={13}/></button><button onClick={()=>move(index,1)}><ChevronDown size={13}/></button></span></div>})}</div></section>

    <section><div className="tournament-section-title"><span>4 · EXACT BOWLING PLAN</span><b>{room.tournament.cricketOvers} overs</b></div><div className="bowling-plan">{bowling.map((id,index)=><label key={index}><span>Over {index+1}</span><select value={id} onChange={(event)=>setBowling((current)=>current.map((value,i)=>i===index?event.target.value:value))}><option value="">Select bowler</option>{xi.map((playerId)=>{const athlete=self.squad.find((entry)=>entry.athleteId===playerId)?.athlete; return <option key={playerId} value={playerId}>{athlete?.shortName} · {athlete?.role}</option>})}</select></label>)}</div></section>

    <button className="primary-button submit-lineup" disabled={xi.length!==11 || batting.length!==11 || bowling.some((id)=>!id) || !fixture.toss?.decision || Boolean(pending)} onClick={()=>void onCommand("tournament/lineup",{sport:"cricket",fixtureId:fixture.id,lineup:{playingXi:xi,battingOrder:batting,bowlingPlan:bowling}})}>{existing?<Check size={16}/>:<Play size={16}/>} {existing?"Update cricket plan":"Submit XI & match plan"}</button>
  </div>;
}

function ResultCard({ room, fixture }: { room: RoomView; fixture: TournamentFixture }) {
  return <div className="match-result-card"><span>FULL TIME / MATCH RESULT</span><div><strong>{teamName(room,fixture.homeParticipantId)}</strong><b>{fixture.result?.homeDetail ?? fixture.result?.homeScore}</b></div><div><strong>{teamName(room,fixture.awayParticipantId)}</strong><b>{fixture.result?.awayDetail ?? fixture.result?.awayScore}</b></div><h2>{fixture.result?.summary}</h2></div>;
}
