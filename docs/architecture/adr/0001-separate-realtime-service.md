# ADR 0001 — Realtime lives in its own service

**Status:** accepted · 2026-08-02
**Applies from:** task 10 onward; the service itself is built in task 19.

## Context

Auctions need live updates: a bid must appear on every watcher's screen within
a second, and the final minute of an auction is when it matters most.

The platform runs on Coolify. A deploy replaces the application container.

## Decision

Realtime runs as `services/realtime`, a second Coolify application on
`ws.carsell.one`. It shares Prisma, Zod schemas and types with Next through the
repository, and shares nothing else — least of all a deploy cycle.

Next and the realtime service communicate in **one direction only**, through
Redis Pub/Sub. Next writes to Postgres, then publishes. The service subscribes
and broadcasts. Neither ever calls the other directly.

## Alternatives considered

**WebSocket inside the Next application.** Rejected. Every deploy drops every
open connection. During a live auction that means every bidder loses the feed at
the moment it counts, and the reconnect storm lands on a container that is still
starting. A deploy must never be able to disturb an auction in progress.

**Direct HTTP call from Next to the realtime service.** Rejected. It couples the
two deploy cycles back together, requires service discovery, and means a slow or
down realtime service can make a bid request hang — turning a broadcast problem
into a write problem.

**Server-Sent Events.** Rejected. One-way only, and the app needs to send
subscribe/unsubscribe frames over the same connection.

## Consequences

- Either side scales horizontally without a code change, because the only link
  between them is a Redis channel. The same property is what makes the eventual
  move to Google Cloud a deployment change rather than a rewrite.
- Redis becomes a dependency of *broadcast*, never of *correctness*: if it is
  down, writes still succeed and clients fall back to polling.
- There are two applications to deploy, monitor and roll back. Accepted.
