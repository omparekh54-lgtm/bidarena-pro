# BidArena Pro

BidArena Pro is a server-authoritative multiplayer auction game for cricket and football. One administrator creates a room, shares a four-digit code, selects the sport, and starts a randomized auction for up to ten teams.

## Multiplayer rules

- Create Game makes the creator the room administrator.
- Join Game requires the four-digit room code and a unique team name.
- The administrator selects cricket or football, chooses Current Only, Icons Only, or Ultimate Mix, and controls the start.
- The administrator sets the per-team purse before the auction; every winning purchase is deducted only from that franchise.
- The administrator can pause/resume the authoritative clock or stop the game while preserving completed sales and squads.
- Each new room receives a new cryptographically shuffled player sequence.
- Cricket rooms use randomized category sets: 10 batters, 7 pace bowlers, 3 spin bowlers, all-rounders, then the remaining batters and players.
- Every lot has a cinematic reveal followed by a ten-second bidding window.
- Every accepted bid resets the shared server deadline to a full ten seconds.
- With no opening bid, the player is unsold. Otherwise the highest bidder wins.
- The server—not the browser—calculates bid increments, validates budget, closes lots, and assigns squads.
- Each participant sees their own current squad, purse, the other teams, and the live bid ledger.
- The personal squad appears directly below Recent Bids in the intelligence sidebar.
- Rooms expire after 18 hours and support 1–10 teams.

## Data integrity

Identity data, performance statistics, game ratings, and auction prices are deliberately separate:

- `gameRating` and `basePrice` are auction game mechanics, never presented as official statistics.
- Every displayed performance field has a named source, competition/format scope, and retrieval or verification time.
- The checked-in catalog contains 84 cricketers and 70 footballers: 34 current + 50 cricket icons and 20 current + 50 football icons.
- All 154 player records have sourced statistics, totaling 2,465 performance data points. Current-player records come from the configured sports-data providers; retired icons use clearly labelled stable career records with direct source links.
- Current Only excludes retired icons, Icons Only contains retired greats, and Ultimate Mix combines both pools before applying the auction sequence and per-room shuffle.
- Expanding to 500 per sport is an incremental licensed-data ingestion project; free API quotas make a verified 1,000-player sync a multi-day process.

Supported adapters:

- [API-Football v3](https://api-sports.io/documentation/football/v3)
- [CricketData.org](https://cricketdata.org/)

Provider-hosted player photography is shown when returned by the configured provider; the interface falls back to a generated identity mark when no licensed image is available.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

For multi-instance production deployment, configure Upstash Redis. The in-memory fallback is intended only for local development and tests.

```text
UPSTASH_REDIS_REST_URL      shared room store URL
UPSTASH_REDIS_REST_TOKEN    shared room store token
API_FOOTBALL_KEY            server-only API-Sports key
CRICKETDATA_API_KEY         server-only CricketData.org key
```

Never prefix provider or Redis credentials with `NEXT_PUBLIC_`.

## Verified statistics synchronization

1. Add rotated provider keys to `.env.local` or the shell environment.
2. Run one sport at a time in quota-safe batches. Football synchronization is intentionally rate-limited for the free API-Football plan:

```bash
BIDARENA_SYNC_SPORT=football BIDARENA_SYNC_OFFSET=0 BIDARENA_SYNC_LIMIT=10 npm run data:sync
BIDARENA_SYNC_SPORT=cricket BIDARENA_SYNC_OFFSET=0 BIDARENA_SYNC_LIMIT=20 npm run data:sync
```

The command updates `src/data/generated/player-stats.json`. It does not generate estimates or silently match similar names. The curated seed catalog stores reviewed provider search metadata and stable player identities. `npm run data:backfill` restores the checked-in, source-labelled retired-player career records after a provider refresh.

## Verification

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

The end-to-end test creates a room, sets the purse, joins a second team, starts football, pauses and resumes the timer, places competing bids, verifies the full ten-second reset, closes the lot, checks the winner's squad, and stops the game.

`GET /api/status` reports health, catalog coverage, provider configuration, and whether the room store is durable. It never returns credential values.

## Production architecture

- Next.js App Router and React
- Server-only room commands with private per-player session tokens
- Upstash Redis persistence with per-room distributed locks
- Atomic purse and squad updates inside the serialized room mutation
- Short-interval state synchronization using the server clock
- 18-hour room TTL and no-store API responses
- Motion-based reveal and reduced-motion accessibility

Polling is used in this release to keep deployment simple and deterministic. A later high-concurrency release can replace fan-out with WebSockets while retaining the same server-authoritative command model.

## Security

Provider keys previously pasted into chat should be treated as exposed: rotate them before configuring production. Secrets must remain server-only and must never be committed, logged, or returned by an API route.

## License

Application source code: MIT. Third-party sports data remains subject to provider terms, quotas, and attribution requirements.
