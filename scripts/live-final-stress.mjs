const BASE = "https://bidarena-pro-live.vercel.app";

function headers(session, hasBody = false) {
  return {
    ...(hasBody ? { "content-type": "application/json" } : {}),
    ...(session ? {
      "x-bidarena-player": session.playerId,
      "x-bidarena-token": session.token,
    } : {}),
  };
}

async function request(path, { method = "GET", body, session, expected = [200] } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: headers(session, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { status: response.status, payload };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBidding(code, session) {
  for (let i = 0; i < 30; i += 1) {
    const { payload } = await request(`/api/rooms/${code}`, { session });
    if (payload.room.phase === "bidding") return payload.room;
    if (payload.room.phase === "complete" || payload.room.phase === "tournament-setup" || payload.room.phase === "tournament") {
      throw new Error(`Auction left live phases unexpectedly: ${payload.room.phase}`);
    }
    await sleep(250);
  }
  throw new Error("Auction did not reach bidding in time");
}

async function main() {
  const created = await request("/api/rooms", {
    method: "POST",
    body: { teamName: "Final Stress Host" },
    expected: [201],
  });
  const host = created.payload.session;
  const code = host.roomCode;

  const joinResults = await Promise.all(
    Array.from({ length: 9 }, (_, i) => request(`/api/rooms/${code}/join`, {
      method: "POST",
      body: { teamName: `Stress Team ${i + 1}` },
      expected: [201],
    }))
  );
  const guests = joinResults.map((result) => result.payload.session);

  const overflow = await Promise.all(
    Array.from({ length: 3 }, (_, i) => request(`/api/rooms/${code}/join`, {
      method: "POST",
      body: { teamName: `Overflow ${i + 1}` },
      expected: [409],
    }))
  );
  if (overflow.some((result) => result.payload.code !== "ROOM_FULL")) {
    throw new Error("Overflow joins were not rejected as ROOM_FULL");
  }

  await request(`/api/rooms/${code}/configure`, {
    method: "POST",
    session: host,
    body: { sport: "football", purse: 10000, playerPoolMode: "current" },
  });
  await request(`/api/rooms/${code}/start`, { method: "POST", session: host });

  let room = await waitForBidding(code, host);
  if (room.phase !== "bidding" || room.participants.length !== 10) {
    throw new Error("Auction did not start with exactly ten teams");
  }

  const bidResults = await Promise.all(
    [host, ...guests].map((session) =>
      request(`/api/rooms/${code}/bid`, { method: "POST", session, expected: [200] })
    )
  );
  if (bidResults.length !== 10) throw new Error("Concurrent bid batch did not complete");
  room = bidResults[bidResults.length - 1].payload.room;
  if (room.phase === "complete" || room.phase === "tournament" || room.phase === "tournament-setup") {
    throw new Error(`Game ended unexpectedly during bidding: ${room.phase}`);
  }

  await request(`/api/rooms/${code}/transfer-window/open`, {
    method: "POST",
    session: host,
    body: { durationSeconds: 30 },
  });
  const blockedBid = await request(`/api/rooms/${code}/bid`, {
    method: "POST",
    session: guests[0],
    expected: [409],
  });
  if (!["TRANSFER_WINDOW_OPEN", "AUCTION_PAUSED"].includes(blockedBid.payload.code)) {
    throw new Error("Bidding was not correctly blocked during transfer window");
  }

  const closed = await request(`/api/rooms/${code}/transfer-window/close`, {
    method: "POST",
    session: host,
  });
  if (closed.payload.room.transferWindow.status !== "closed" || closed.payload.room.pausedAt !== null) {
    throw new Error("Closing transfer window did not cleanly resume auction");
  }

  await request(`/api/rooms/${code}/bid`, {
    method: "POST",
    session: guests[1],
    expected: [200],
  });

  const unauthorizedStop = await request(`/api/rooms/${code}/stop`, {
    method: "POST",
    session: guests[0],
    expected: [403],
  });
  if (unauthorizedStop.payload.code !== "ADMIN_ONLY") {
    throw new Error("Non-admin stop was not rejected");
  }

  const chatBytes = Buffer.from("final-live-stress");
  const chat = await request(`/api/rooms/${code}/chat`, {
    method: "POST",
    session: host,
    body: {
      text: "Final live stress check",
      attachments: [{
        name: "stress.txt",
        mimeType: "text/plain",
        size: chatBytes.length,
        base64: chatBytes.toString("base64"),
      }],
    },
  });
  const attachmentId = chat.payload.message.attachments[0].id;
  const guestChat = await request(`/api/rooms/${code}/chat`, { session: guests[0] });
  if (!guestChat.payload.messages.some((message) => message.id === chat.payload.message.id)) {
    throw new Error("Chat message did not propagate to another team");
  }
  const attachment = await request(`/api/rooms/${code}/chat/files/${attachmentId}`, { session: guests[0] });
  if (!Buffer.isBuffer(attachment.payload) || attachment.payload.toString("utf8") !== "final-live-stress") {
    throw new Error("Chat attachment round-trip failed");
  }

  const stopped = await request(`/api/rooms/${code}/stop`, { method: "POST", session: host });
  if (stopped.payload.room.phase !== "tournament-setup") {
    throw new Error("Admin stop did not move game to tournament setup");
  }

  const tournamentTransfer = await request(`/api/rooms/${code}/transfer-window/open`, {
    method: "POST",
    session: host,
    body: { durationSeconds: 30 },
    expected: [409],
  });
  if (tournamentTransfer.payload.code !== "TRANSFER_WINDOW_UNAVAILABLE") {
    throw new Error("Transfer window was incorrectly allowed after auction handoff");
  }
  const tournamentPause = await request(`/api/rooms/${code}/pause`, {
    method: "POST",
    session: host,
    expected: [409],
  });
  if (tournamentPause.payload.code !== "PAUSE_UNAVAILABLE") {
    throw new Error("Auction pause was incorrectly allowed during tournament setup");
  }
  await request(`/api/rooms/${code}/stop`, {
    method: "POST",
    session: host,
    expected: [409],
  });

  const smallCreated = await request("/api/rooms", {
    method: "POST",
    body: { teamName: "Small Stress Host" },
    expected: [201],
  });
  const smallHost = smallCreated.payload.session;
  const smallCode = smallHost.roomCode;
  await request(`/api/rooms/${smallCode}/join`, { method: "POST", body: { teamName: "Small Team 2" }, expected: [201] });
  await request(`/api/rooms/${smallCode}/join`, { method: "POST", body: { teamName: "Small Team 3" }, expected: [201] });
  await request(`/api/rooms/${smallCode}/configure`, {
    method: "POST",
    session: smallHost,
    body: { sport: "football", purse: 10000, playerPoolMode: "current" },
  });
  await request(`/api/rooms/${smallCode}/start`, { method: "POST", session: smallHost });
  await request(`/api/rooms/${smallCode}/stop`, { method: "POST", session: smallHost });

  const invalidHybrid = await request(`/api/rooms/${smallCode}/tournament/setup`, {
    method: "POST",
    session: smallHost,
    body: { format: "league-knockout", cricketOvers: 20 },
    expected: [422],
  });
  if (invalidHybrid.payload.code !== "TOURNAMENT_FORMAT_TEAMS_REQUIRED") {
    throw new Error("Small-team hybrid tournament was not rejected cleanly");
  }
  const validLeague = await request(`/api/rooms/${smallCode}/tournament/setup`, {
    method: "POST",
    session: smallHost,
    body: { format: "league", cricketOvers: 20 },
  });
  if (validLeague.payload.room.phase !== "tournament") {
    throw new Error("Small-team league setup failed");
  }

  console.log(JSON.stringify({
    ok: true,
    primaryRoom: code,
    teams: 10,
    concurrentBids: 10,
    overflowRejected: 3,
    transferFreeze: true,
    earlyTransferClose: true,
    unauthorizedStopBlocked: true,
    chatAttachment: true,
    tournamentPhaseGuards: true,
    smallTeamFormatGuard: true,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
