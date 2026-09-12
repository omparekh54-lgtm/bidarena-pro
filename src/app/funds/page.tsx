"use client";

import Link from "next/link";
import { ArrowLeft, Banknote, LoaderCircle, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { formatMoney } from "@/lib/auction/engine";
import type { PlayerSession, RoomView } from "@/lib/auction/types";

const SESSION_KEY = "bidarena-player-session-v1";

export default function FundsPage() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [displayAmount, setDisplayAmount] = useState(10);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    let cancelled = false;
    let parsed: PlayerSession;
    try {
      parsed = JSON.parse(raw) as PlayerSession;
    } catch {
      const timer = window.setTimeout(() => {
        if (!cancelled) setError("Your saved room session is invalid. Return to the game and rejoin.");
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const timer = window.setTimeout(() => {
      if (!cancelled) setSession(parsed);
    }, 0);

    void fetch(`/api/rooms/${parsed.roomCode}`, {
      cache: "no-store",
      headers: { "x-bidarena-player": parsed.playerId, "x-bidarena-token": parsed.token },
    }).then(async (response) => {
      const payload = await response.json() as { room?: RoomView; error?: string };
      if (!response.ok || !payload.room) throw new Error(payload.error ?? "Unable to load the live game.");
      if (!cancelled) setRoom(payload.room);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load the live game.");
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !room?.sport) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const amount = room.sport === "cricket" ? Math.round(displayAmount * 100) : Math.round(displayAmount);
      const response = await fetch(`/api/rooms/${session.roomCode}/funds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bidarena-player": session.playerId,
          "x-bidarena-token": session.token,
        },
        body: JSON.stringify({ amount }),
      });
      const payload = await response.json() as { room?: RoomView; error?: string };
      if (!response.ok || !payload.room) throw new Error(payload.error ?? "The top-up could not be applied.");
      setRoom(payload.room);
      setMessage(`${formatMoney(amount, payload.room.sport)} added to every team.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The top-up could not be applied.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% -20%, #263750 0, #0b1019 35%, #07090e 75%)", color: "#f5f7fb", padding: 24, fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#aab3c3", textDecoration: "none", marginBottom: 28 }}><ArrowLeft size={16} /> Back to auction</Link>
        <section style={{ border: "1px solid rgba(255,255,255,.10)", background: "rgba(15,19,28,.90)", borderRadius: 18, padding: 28, boxShadow: "0 18px 60px rgba(0,0,0,.35)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}><Banknote size={26} color="#56e0c4" /><div><div style={{ color: "#56e0c4", fontWeight: 800, letterSpacing: ".08em", fontSize: 12 }}>ADMIN CONTROL</div><h1 style={{ margin: "4px 0 0", fontSize: 30 }}>Add money during the game</h1></div></div>
          <p style={{ color: "#8d96a8", lineHeight: 1.6 }}>Choose an amount and it will be added equally to every team’s current purse. This is synchronized through the server, so all connected players receive the same updated balances.</p>

          {!session ? <div style={{ padding: 16, borderRadius: 10, background: "rgba(255,185,65,.08)", color: "#f4b941" }}>No active BidArena session found. Open the game first, then return here.</div> : null}
          {room && !room.isAdmin ? <div style={{ padding: 16, borderRadius: 10, background: "rgba(255,91,89,.08)", color: "#ff8582" }}>Only the room administrator can add funds.</div> : null}
          {room?.phase === "lobby" || room?.phase === "complete" ? <div style={{ padding: 16, borderRadius: 10, background: "rgba(255,185,65,.08)", color: "#f4b941" }}>Fund top-ups are available only while an auction is running.</div> : null}

          {room?.isAdmin && room.phase !== "lobby" && room.phase !== "complete" ? (
            <form onSubmit={submit} style={{ marginTop: 24, display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".06em" }}>AMOUNT TO ADD TO EACH TEAM</span><div style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="number" min={room.sport === "cricket" ? 0.5 : 1} max={room.sport === "cricket" ? 1000 : 100000} step={room.sport === "cricket" ? 0.5 : 1} value={displayAmount} onChange={(event) => setDisplayAmount(Number(event.target.value))} style={{ flex: 1, minWidth: 0, padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "#090c12", color: "white", fontSize: 18 }} /><strong>{room.sport === "cricket" ? "Cr" : "€m"}</strong></div></label>
              <button disabled={pending || !displayAmount || displayAmount <= 0} style={{ border: 0, borderRadius: 10, padding: "14px 18px", background: "#56e0c4", color: "#07100e", fontWeight: 900, cursor: pending ? "wait" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>{pending ? <LoaderCircle className="spin" size={18} /> : <Banknote size={18} />}{pending ? "Applying…" : "Add to every team"}</button>
            </form>
          ) : null}

          {room ? <div style={{ marginTop: 26, display: "grid", gap: 10 }}><div style={{ display: "flex", alignItems: "center", gap: 8, color: "#56e0c4", fontWeight: 800 }}><ShieldCheck size={16} /> Live team balances</div>{room.participants.map((participant) => <div key={participant.id} style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,.07)" }}><span>{participant.teamName}</span><strong>{formatMoney(participant.budget, room.sport)}</strong></div>)}</div> : null}
          {message ? <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: "rgba(86,224,196,.10)", color: "#70efd4" }}>{message}</div> : null}
          {error ? <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: "rgba(255,91,89,.08)", color: "#ff8582" }}>{error}</div> : null}
        </section>
      </div>
    </main>
  );
}
