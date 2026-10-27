# UpPromote Webhooks with Express

A standalone receiver for signed `POST /webhooks/uppromote` deliveries. It verifies the raw request body and logs event labels; add your own durable processing before acknowledging.

## Setup

Requires Node.js 24+ and the signing secret from [provider setup](../../references/setup.md).

```bash
npm install
cp .env.example .env
```

Set `UPPROMOTE_WEBHOOK_SECRET` in the copied environment file.

Set UPPROMOTE_WEBHOOK_TOPIC to the topic subscribed to this URL, for example referral.new. Run a separate configured receiver for each topic.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Run and Test

```bash
npm start
```

The endpoint listens at `http://localhost:3000/webhooks/uppromote`.

```bash
npm test
```

Tests cover a fixed signing vector, tampering, malformed signatures, raw byte preservation and wrong-typed JSON. `vector.json` contains an illustrative payload and a fixed digest checked against core; it is not a live vendor capture.

## Receive Real Deliveries

```bash
npx hookdeck-cli listen 3000 uppromote --path /webhooks/uppromote
```

Register the public URL with UpPromote. Return success for accepted deliveries. Keep business changes idempotent and retain the subscription topic with queued work.

## Responses

- 200: accepted delivery, including unrecognised events.
- 400: signed invalid JSON or a body that is not an object.
- 401: missing or invalid signature.
- 500: missing secret.

See [verification](../../references/verification.md) for the exact header format and [event routing](../../references/overview.md) for payload handling.
