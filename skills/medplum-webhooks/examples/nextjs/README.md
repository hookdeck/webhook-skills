# Medplum Webhooks with Next.js

A standalone receiver for signed `POST /webhooks/medplum` deliveries. It verifies the raw request body and logs event labels; add your own durable processing before acknowledging.

## Setup

Requires Node.js 24+ and the signing secret from [provider setup](../../references/setup.md).

```bash
npm install
cp .env.example .env.local
```

Set `MEDPLUM_WEBHOOK_SECRET` in the copied environment file.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Run and Test

```bash
npm run dev
```

The endpoint listens at `http://localhost:3000/webhooks/medplum`.

```bash
npm test
```

Tests cover a fixed signing vector, tampering, malformed signatures, raw byte preservation and wrong-typed JSON. `vector.json` contains an illustrative payload and a fixed digest checked against core; it is not a live vendor capture.

## Receive Real Deliveries

```bash
npx hookdeck-cli listen 3000 medplum --path /webhooks/medplum
```

Register the public URL with Medplum. Use the Subscription extensions to configure retry behaviour. Queue accepted work durably and keep clinical data out of logs. Signatures are optional at the sender, but these examples require signing to be enabled.

## Responses

- 200: accepted delivery, including unrecognised events.
- 400: signed invalid JSON or a body that is not an object.
- 401: missing or invalid signature.
- 500: missing secret.

See [verification](../../references/verification.md) for the exact header format and [event routing](../../references/overview.md) for payload handling.
