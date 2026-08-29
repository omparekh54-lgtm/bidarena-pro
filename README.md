# BidArena Pro

Institutional-grade auction experience for cricket and football franchises. The current release is a production-deployable, single-device auction console with a cinematic reveal, cryptographically shuffled lot sequence, bid increments, purse enforcement, countdown extension, sold/unsold processing, squad capture, audit timeline, responsive UI, and server-only sports-data adapters.

## What is real and what is a game mechanic

- Athlete identities, nationalities, teams, and playing roles are real-world records.
- Live provider adapters support API-Football and CricketData.org.
- Auction ratings and base prices are explicitly game mechanics; they are not represented as official statistics.
- Credentials are never shipped to the browser.
- The catalog in this release is a curated validation set. The provider ingestion job is the intended route to the planned 500 athletes per sport; API free-tier quotas require incremental synchronization.

## Core behaviors

- A fresh, secure Fisher–Yates shuffle is generated for every new auction.
- Refreshing the same in-progress distributed room will eventually restore its stored sequence; a new room gets a new sequence.
- Bid increments scale with price.
- The reserve guard prevents a team from spending money required for minimum squad slots.
- Last-second bids extend the timer.
- Sold players update the franchise purse and squad atomically in the domain model.
- Reduced-motion accessibility and responsive bidding controls are included.

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Provider keys are optional for the playable catalog mode.

## Environment variables

```text
API_FOOTBALL_KEY       server-only API-Sports key
CRICKETDATA_API_KEY    server-only CricketData.org key
DATABASE_URL           reserved for distributed room persistence
REDIS_URL              reserved for real-time locks and fan-out
```

Never use a `NEXT_PUBLIC_` prefix for provider keys.

## Verification

```bash
npm run lint
npm run build
```

`GET /api/status` reports service health, catalog counts, and whether each provider is configured. It never returns credential values.

## Architecture path to distributed multiplayer

The browser release uses the same event vocabulary intended for the distributed version: room created, sequence committed, athlete revealed, bid accepted, timer extended, player sold/unsold, and auction closed. The next infrastructure milestone persists these events to Postgres and uses Redis/WebSockets for fan-out and command serialization.

## Data provenance

- [API-Football](https://www.api-football.com/)
- [CricketData.org](https://cricketdata.org/)
- Open-data fallback design: [StatsBomb Open Data](https://github.com/hudl/open-data), [Cricsheet](https://cricsheet.org/), and Wikidata CC0.

Player photography is intentionally excluded until a licensed image source is configured.

## License

Application source code: MIT. Third-party sports data remains subject to its provider's terms and attribution requirements.
