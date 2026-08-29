# Security policy

## Secrets

Provider keys are server-only environment variables and must never be committed, logged, sent to the browser, or prefixed with `NEXT_PUBLIC_`. Rotate a credential immediately if it appears in chat, an issue, a screenshot, or Git history.

## Auction integrity

The demo runs an event-driven auction state machine in one browser. The production multiplayer contract requires an authoritative server, authenticated commands, monotonic event sequence numbers, idempotency keys, Redis locks, and an append-only database ledger. A client must never decide bid validity, timestamps, budgets, or the winner.

## Reporting

Please open a private security advisory rather than a public issue for vulnerabilities.
