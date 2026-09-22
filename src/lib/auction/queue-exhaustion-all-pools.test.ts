import { describe, expect, it } from "vitest";
import { addParticipant, bidForParticipant, configureRoom, createRoomState, settleRoom, startRoom } from "@/lib/auction/room-engine";
import type { PlayerPoolMode, RoomParticipant, Sport } from "@/lib/auction/types";

function participant(id: string): RoomParticipant {
  return {
    id,
    teamName: `Team ${id}`,
    code: id.slice(0,2).toUpperCase(),
    color: "#888",
    budget: 1_000_000,
    initialBudget: 1_000_000,
    squad: [],
    joinedAt: new Date(0).toISOString(),
    tokenHash: id.repeat(16).slice(0,64),
  };
}

describe("queue exhaustion never auto-ends the auction", () => {
  for (const sport of ["football","cricket"] as Sport[]) {
    for (const mode of ["current","legends","mixed"] as PlayerPoolMode[]) {
      it(`${sport} ${mode} reaches between-lots, never complete, after entire pool sells`, () => {
        const admin=participant("p0");
        const room=createRoomState("9999",admin,0);
        for(let i=1;i<10;i+=1) addParticipant(room,participant(`p${i}`),i);
        configureRoom(room,admin.id,sport, sport==="cricket" ? 100000 : 10000, mode,20);
        startRoom(room,admin.id,100);
        room.participants.forEach(p=>{p.budget=1_000_000;p.initialBudget=1_000_000;});
        let now=100, sold=0;
        const pool=room.queue.length;
        while(room.phase!=="between-lots"){
          expect(room.phase).not.toBe("complete");
          if(room.phase==="reveal"){
            now=Date.parse(room.transitionAt!);
            settleRoom(room,now);
          }else if(room.phase==="bidding"){
            const buyer=room.participants[sold%room.participants.length];
            bidForParticipant(room,buyer.id,now+1);
            now=Date.parse(room.deadlineAt!);
            settleRoom(room,now);
            sold+=1;
          }else if(room.phase==="sold"||room.phase==="unsold"){
            now=Date.parse(room.transitionAt!);
            settleRoom(room,now);
          }else throw new Error("unexpected phase "+room.phase);
          expect(sold).toBeLessThanOrEqual(pool);
        }
        expect(sold).toBe(pool);
        expect(room.sales).toHaveLength(pool);
        expect(room.phase).toBe("between-lots");
        expect(room.phase).not.toBe("complete");
        expect(room.stoppedAt).toBeNull();
      });
    }
  }
});
