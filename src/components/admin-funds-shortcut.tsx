"use client";

import Link from "next/link";
import { Banknote } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlayerSession, RoomView } from "@/lib/auction/types";

const SESSION_KEY = "bidarena-player-session-v1";

export function AdminFundsShortcut() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    let session: PlayerSession;
    try {
      session = JSON.parse(raw) as PlayerSession;
    } catch {
      return;
    }

    void fetch(`/api/rooms/${session.roomCode}`, {
      cache: "no-store",
      headers: {
        "x-bidarena-player": session.playerId,
        "x-bidarena-token": session.token,
      },
    })
      .then(async (response) => response.ok ? response.json() as Promise<{ room: RoomView }> : null)
      .then((payload) => {
        if (!cancelled && payload?.room.isAdmin && payload.room.phase !== "lobby" && payload.room.phase !== "complete") setVisible(true);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;
  return (
    <Link
      href="/funds"
      style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1000, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#56e0c4", color: "#07100e", fontWeight: 800, textDecoration: "none", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}
    >
      <Banknote size={17} /> ADD FUNDS
    </Link>
  );
}
