# Realtime service

Subscribes to Redis, broadcasts over WebSocket. **Never touches the database.**

Truth lives in Postgres. This is a notification carrier: if it goes down, updates
are delayed — no data is lost and no bid is prevented.

## No accumulated state

The client fetches a **snapshot from REST** on connect and on any gap in `seq`.
Building state from messages means one lost message corrupts everything after it,
invisibly.

## Channels

`auction:*` is public and needs no ticket. `user:*` requires short-lived ticket
authentication, and **the ticket endpoint does not exist yet** — so subscribing to
a user channel is refused outright. An open subscription to a private channel is
worse than a missing feature.

## Run

```bash
cd services/realtime && npm install && npm start
```

`PORT` (default 4000) · `REDIS_URL`.
