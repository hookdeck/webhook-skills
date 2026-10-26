# Bitdefender Webhooks - Next.js Example

Minimal example of receiving Bitdefender GravityZone Event Push (`jsonRPC`) webhooks and
authenticating them with the `Authorization` header.

GravityZone does not sign payloads. The credential is the `Authorization` header, sent
verbatim from `serviceSettings.authorization` (the docs' example is `Bearer sfasdfw34243`).
The handler compares the **whole header value**, including any `Bearer ` / `Basic ` prefix,
in constant time. A static credential authenticates the sender, not the body, and gives no
replay protection.

## Prerequisites

- Node.js 18+
- A GravityZone Control Center with API access (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BITDEFENDER_AUTHORIZATION` to the exact value you pass as `serviceSettings.authorization`
   in GravityZone, including any `Bearer ` or `Basic ` prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/bitdefender`.

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/bitdefender \
  -H "Content-Type: application/json" \
  -H "Authorization: $BITDEFENDER_AUTHORIZATION" \
  -d '{"jsonrpc":"2.0","method":"addEvents","params":{"events":[{"module":"av","computer_name":"PC-1","malware_name":"EICAR-Test-File (not a virus)","final_status":"quarantined"}]},"id":1}'
```

## Receive Bitdefender Webhooks Locally

```bash
npx hookdeck-cli listen 3000 bitdefender --path /webhooks/bitdefender
```

Use the printed URL as `serviceSettings.url` in `setPushEventSettings`.

## How It Works

- `app/webhooks/bitdefender/route.ts`: the `POST /webhooks/bitdefender` route
- `lib/verify-bitdefender.ts`: `verifyBitdefenderRequest()`

1. The body is read with `request.text()`, so any content type works.
2. `Authorization` is compared with `BITDEFENDER_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON-RPC `addEvents` call with `params.events` (`400` otherwise).
4. Each event is dispatched on its `module` (`av`, `aph`, `avc`, `fw`, ...).
5. It returns `200 {"received": true}`.
