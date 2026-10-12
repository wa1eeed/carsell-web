# Realtime service

Subscribes to Redis, broadcasts over WebSocket. **Never touches the database.**

Truth lives in Postgres. This is a notification carrier: if it goes down, updates
are delayed — no data is lost and no bid is prevented.

## No accumulated state

The client fetches a **snapshot from REST** on connect and on any gap in `seq`.
Building state from messages means one lost message corrupts everything after it,
invisibly.

## Channels

`auction:*` is public and needs no ticket. `user:*` requires a short-lived,
single-use ticket.

The client calls `POST /api/v1/realtime/ticket` with its session, receives an
opaque 256-bit id (60s TTL) and the channel name, then sends
`{action: "auth", ticket}` as its **first frame** — never in the URL, which ends
up in proxy logs, history and referrers.

This service resolves the ticket with `GETDEL` on the same Redis it already
subscribes to: **atomic, so two connections cannot use one ticket**, and there is
no shared signing secret to distribute or leak. It then applies `canSubscribe()`
— imported from the app, not copied — to every subscribe frame.

A connection that never authenticates stays a visitor: public channels only.

## Run

```bash
cd services/realtime && npm install && npm start
```

`PORT` (default 4000) · `REDIS_URL`.
