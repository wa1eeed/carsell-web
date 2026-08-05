# Runbook

What to check and what to do when something is wrong. One section per system.
Grows with each task that adds a moving part.

## Realtime (WebSocket)

Full design: [`docs/architecture/realtime.md`](../architecture/realtime.md).

### Is it working?

```bash
redis-cli -u "$REDIS_URL" PUBSUB CHANNELS 'auction:*'   # live auction channels
redis-cli -u "$REDIS_URL" GET seq:auction:<id>          # last sequence
curl -sI "$WS_URL/health"                                # service health
```

Healthy looks like: a channel per live auction, `seq` advancing while bidding is
happening, and a 200 from `/health`.

- `PUBSUB CHANNELS` empty during a live auction → the service is not subscribed.
  Restart it.
- `seq` advancing but clients see nothing → the break is between the service and
  the clients, not in Next. Check the service logs and connection count.
- `seq` not advancing while bids are being placed → Next cannot reach Redis.
  Check `REDIS_URL` in the Next application's environment.

### It is down

**Not urgent, and no money is at risk.** Bids are written by REST, not by the
socket. Clients fall back to polling every 10 seconds on their own and show a
«التحديث اللحظي متوقّف» strip.

1. Restart the `realtime` application in Coolify. Connections re-establish with
   backoff and jitter.
2. Do **not** redeploy Next — it is not involved, and redeploying it drops
   nothing useful while adding risk.
3. If an auction closed during the outage: closing is decided by the server from
   `Auction.endsAt` in Postgres, so the result is correct regardless. But bidders
   may not have seen the final minute. Check `auction_events` for extensions and
   consider extending manually if the outage overlapped the closing window.

### It is slow

Delivery latency climbing usually means one connection is subscribed to too many
channels, or a client is reconnecting in a loop. Check the reconnect rate first —
a missing jitter is the classic cause of a synchronised stampede after a restart.

## Payments — no gateway, no sale

### The symptom

Every checkout returns `502 GATEWAY_FAILED`, and `Payment.failureCode` reads
`GATEWAY_NOT_CONFIGURED`. Orders pile up in the `PAYMENT` stage. Nothing after
payment ever runs: no escrow, no stage progress, no settlement, no documents.

### The cause

The seed routes `VEHICLE_ESCROW`, `AUCTION_DEPOSIT` and `TRANSFER_FEE` to
`bank_escrow`, which has **no adapter**. That is deliberate — the real provider
keys have not arrived — but it means a freshly seeded environment cannot take a
single payment.

```bash
npm run trial:on
```

This points all six payment purposes at the sandbox gateway, which holds,
settles, cancels and partially refunds honestly, and keeps its own independent
`SandboxTransaction` ledger so daily reconciliation runs against a source rather
than against our own mirror.

**Staging should run with trial mode on** until provider keys are configured.
Without it the platform is on display and cannot sell.

`createSandboxAdapter` throws in production, so this cannot leak into a live
environment: a fake gateway open on real money tells a buyer their card was
charged when nothing was, which is worse than having no gateway at all — the
absence at least announces itself.

### Test payment methods

| method | outcome |
|---|---|
| `mada`, `visa`, … | hold succeeds |
| `test_declined` | card declined |
| `test_3ds` | requires a verification challenge |

Failure is exercised as deliberately as success. A happy path alone leaves
"what does the buyer see when their card is refused" unanswered, and that is the
state real people end up in.

### Turning it off

`npm run trial:off` restores the seeded routing. Payments already in flight keep
their own gateway — a hold is released from where it was created — so switching
only changes the destination of new payments.

`npm run trial:reset` removes the orders, payments, listings, bids and ledger
rows a manual walk created. Clicking through the product writes real rows; a
manual session is a test run with no `afterAll`.

## Sale journeys — what "it works" means

Three journeys reach money, and each has to be walked to its end rather than to
its first success:

- **Direct** — order → payment → escrow held → transfer → buyer confirms →
  released → sale agreement → settlement statement → balanced ledger entries.
- **Negotiation** — offer → counter → accept → order (`source: OFFER`) → as above.
- **Auction** — deposit → bid → close → (reserve met, or the seller accepts the
  highest bid below it) → order (`source: AUCTION`) → as above.

After any change to ordering, payment or settlement, walk all three. The test
suite passes over defects these walks catch, because a test never opens a screen
and never clicks a button that was never wired.

## Database

Migrations run as `prisma migrate deploy` in the pre-start command. **Never**
`db push` in production, and never the seed script — it truncates every table and
refuses to run when `APP_ENV=production`.

Restore is tested before launch. An untested backup is not a backup.
