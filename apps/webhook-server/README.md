# Webhook Server (Scaffold)

This package is the scaffold for the standalone webhook ingress service.

Current behavior:

- `GET /health` health check
- `POST /i/:webhookId` accepts webhook payloads
- `GET /internal/deliveries` returns in-memory received payloads (dev only)

Planned next steps:

- SQLite-backed durable delivery queue
- Auth and signature verification
- Persistent WebSocket bridge to the main `t3` server
- Delivery ack / retry protocol

## Deployment (Fast Build Context)

For Dokploy, use this folder as build context so Docker does not receive the full monorepo:

- Build context: `apps/webhook-server`
- Dockerfile path: `apps/webhook-server/Dockerfile` (or `Dockerfile` if Dokploy resolves from context)
