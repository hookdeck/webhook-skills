---
name: livekit-webhooks
description: >
  Receive and verify LiveKit webhooks (LiveKit Cloud and self-hosted livekit-server).
  Use when setting up LiveKit webhook handlers, debugging the Authorization-header JWT
  and sha256 body-hash verification, fixing the application/webhook+json content-type
  trap, or handling room_started, room_finished, participant_joined, participant_left,
  track_published, egress_ended and ingress_started events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# LiveKit Webhooks

LiveKit (livekit.io) is the open-source WebRTC platform: an SFU for realtime audio, video
and data, plus Agents, SIP telephony and Egress/Ingress. LiveKit Cloud and self-hosted
`livekit-server` send the **same** webhook request, signed the same way.

## When to Use This Skill

- How do I receive LiveKit webhooks?
- How do I verify a LiveKit webhook (`Authorization` JWT + `sha256` claim)?
- Why does every LiveKit webhook delivery fail with 401 / an empty body?
- How do I handle `participant_joined`, `room_finished` or `egress_ended`?
- How do I configure webhooks in LiveKit Cloud or in a self-hosted `config.yaml`?

> **Webhooks vs SDK events:** webhook event names are snake_case (`participant_joined`).
> PascalCase names (`ParticipantConnected`, `TrackSubscribed`) are in-process client SDK
> callbacks (`RoomEvent` / `ParticipantEvent`), **not** webhooks. LiveKit's docs cover both
> on one page; only the snake_case list is delivered over HTTP.

## Verification (core)

This is **not** an HMAC-in-a-custom-header scheme. LiveKit sends
`Authorization: <JWT>` (bare token, no `Bearer ` prefix) and
`Content-Type: application/webhook+json`. Verify in **two mandatory steps**: the JWT
signature only covers its claims, and the body is bound only through the `sha256` claim.

1. JWT: **HS256** keyed with the project **API secret**, `iss` must equal the **API key**,
   `exp` must be present and unexpired (10 s clock tolerance). Pin the algorithm.
2. Body: `sha256` claim == **base64**(SHA-256(**raw body**)), standard base64 with padding.

```javascript
import crypto from 'node:crypto';
import { jwtVerify } from 'jose';

async function verifyLiveKitWebhook(rawBody, authHeader, apiKey, apiSecret) {
  if (!authHeader) throw new Error('authorization header is empty');
  const token = authHeader.replace(/^Bearer\s+/i, '').trim(); // proxies may add it
  const { payload } = await jwtVerify(token, new TextEncoder().encode(apiSecret), {
    algorithms: ['HS256'], issuer: apiKey, requiredClaims: ['exp'], clockTolerance: 10,
  });
  if (typeof payload.sha256 !== 'string' || !payload.sha256) throw new Error('sha256 was not found in the token');
  const expected = Buffer.from(crypto.createHash('sha256').update(rawBody).digest('base64'));
  const received = Buffer.from(payload.sha256);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error('sha256 checksum of body does not match');
  }
  return payload;
}
```

Python is the same with PyJWT: `jwt.decode(token, key=api_secret, algorithms=["HS256"],
issuer=api_key, leeway=10, options={"require": ["exp", "iss"]})`, then
`hmac.compare_digest(base64.b64encode(hashlib.sha256(raw_body).digest()), claim.encode())`.
Official one-liners: Node `new WebhookReceiver(apiKey, apiSecret).receive(body, authHeader)`
(`livekit-server-sdk`); Python `WebhookReceiver(TokenVerifier(api_key, api_secret)).receive(body, auth)`
(`livekit-api`). Fail closed (401) if `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` are unset.

> **Raw body + content type:** Express needs `express.raw({ type: 'application/webhook+json' })`;
> `express.json()`/default `express.raw()` match only `application/json`, leave the body empty,
> and every delivery 401s. Next.js: `await request.text()`. FastAPI: `await request.body()`.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

The webhooks docs list 12 events, all in the top-level `event` field:

| Event | Triggered When |
|-------|----------------|
| `room_started` | First participant joins an empty room |
| `room_finished` | Room closes (`room.close()`, or empty timeout expired after the last participant left) |
| `participant_joined` | Media connection established, state becomes `ACTIVE` |
| `participant_left` | Participant left and all cleanup completed |
| `participant_connection_aborted` | Connection aborted unexpectedly (e.g. media connection failed) |
| `track_published` / `track_unpublished` | Participant (un)published a track; `room`/`participant` carry only SID, name, identity |
| `egress_started` / `egress_updated` / `egress_ended` | Recording/streaming started, updated (e.g. file size), ended |
| `ingress_started` / `ingress_ended` | External stream ingest started / ended |

`agent_job_pending`, `agent_job_started` and `agent_job_ended` exist in LiveKit's protocol
definition (`livekit_webhook.proto`, `webhook/consts.go`) but not in the docs table or the
Cloud test-event picker. Handle unknown names with a 200, never a throwing default.

Body is protojson: `{ event, id, createdAt, room?, participant?, track?, egressInfo?,
ingressInfo?, numDropped? }`. **Zero/default fields are omitted**, int64s
(`createdAt`, `joinedAt`…) arrive as JSON **strings**, enums as names (`"VIDEO"`). Dedupe on
`id`. A non-zero `numDropped` means events were lost. See
[references/overview.md](references/overview.md).

## Environment Variables

```bash
# The project API key/secret pair whose key is the webhook's Signing API key
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=your_api_secret
```

There is no separate per-webhook secret. With several API keys, look the secret up by the
token's `iss`.

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 livekit --path /webhooks/livekit
```

No account required — the CLI creates a guest account on first run and provides a public
HTTPS URL + web UI for inspecting requests. Use port `8000` for the FastAPI example.

## Resources

- [Overview](references/overview.md) - Events, payload shape, protojson rules, delivery semantics
- [Setup](references/setup.md) - LiveKit Cloud, self-hosted `config.yaml`, Hookdeck `LIVEKIT` source
- [Verification](references/verification.md) - JWT + body-hash details, SDK receivers, troubleshooting
- [Express Example](examples/express/) - Express.js implementation
- [Next.js Example](examples/nextjs/) - Next.js App Router implementation
- [FastAPI Example](examples/fastapi/) - Python FastAPI implementation

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Dedupe LiveKit deliveries on the top-level `id`
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [agora-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/agora-webhooks) - Agora realtime voice/video webhooks
- [100ms-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/100ms-webhooks) - 100ms live video webhooks
- [zoom-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/zoom-webhooks) - Zoom meeting webhooks
- [twilio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/twilio-webhooks) - Twilio voice and messaging webhooks
- [mux-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mux-webhooks) - Mux video streaming webhooks
- [vapi-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/vapi-webhooks) - Vapi voice agent webhooks
- [retell-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/retell-webhooks) - Retell AI voice agent webhooks
- [fusionauth-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/fusionauth-webhooks) - FusionAuth webhooks (also a JWT carrying a body SHA-256)
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
