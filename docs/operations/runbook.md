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

## Database

Migrations run as `prisma migrate deploy` in the pre-start command. **Never**
`db push` in production, and never the seed script — it truncates every table and
refuses to run when `APP_ENV=production`.

Restore is tested before launch. An untested backup is not a backup.
