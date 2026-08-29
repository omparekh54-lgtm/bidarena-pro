# Security policy

## Secrets

Provider and Redis keys are server-only environment variables. Never commit, log, expose through an API response, or prefix them with `NEXT_PUBLIC_`. Rotate a credential immediately if it appears in chat, an issue, a screenshot, or Git history.

## Auction integrity

The server owns room state, category-aware randomized lot order, administrator purse configuration, pause/resume timing, stop state, deadlines, legal bid amounts, purse checks, winning bids, and squad assignment. Browsers send authenticated commands and render sanitized room views; they never submit a price or choose the winner.

Each room mutation is serialized with a per-room distributed lock when Upstash Redis is configured. Production must use the durable store; the in-memory implementation is only a local development fallback.

Player sessions use random 256-bit tokens. Only SHA-256 token hashes are stored in room state, and authentication compares hashes using a timing-safe operation.

## Data integrity

Auction ratings and prices are explicitly game mechanics. Performance statistics are displayed only after provider synchronization and carry provider, scope, and retrieval provenance. Automatic fuzzy player matching is intentionally excluded from the trusted import path.

## Reporting

Please open a private GitHub security advisory rather than a public issue for vulnerabilities.
