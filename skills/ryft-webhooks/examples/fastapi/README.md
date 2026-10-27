# Ryft Webhooks with FastAPI

A standalone receiver for signed `POST /webhooks/ryft` deliveries. It verifies the raw request body and logs event labels; add your own durable processing before acknowledging.

## Setup

Requires Python 3.10+ and the signing secret from [provider setup](../../references/setup.md).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `RYFT_WEBHOOK_SECRET` in the copied environment file.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Run and Test

```bash
uvicorn main:app --reload --port 8000
```

The endpoint listens at `http://localhost:8000/webhooks/ryft`.

```bash
pytest -q
```

Tests cover a fixed signing vector, tampering, malformed signatures, raw byte preservation and wrong-typed JSON. `vector.json` contains an illustrative payload and a fixed digest checked against core; it is not a live vendor capture.

## Receive Real Deliveries

```bash
npx hookdeck-cli listen 8000 ryft --path /webhooks/ryft
```

Register the public URL with Ryft. Return 200 within 1.5 seconds. Ryft documents six attempts, separated by delays of 0, 1, 5, 10, 10 and 10 minutes. Queue durable work before acknowledging.

## Responses

- 200: accepted delivery, including unrecognised events.
- 400: signed invalid JSON or a body that is not an object.
- 401: missing or invalid signature.
- 500: missing secret.

See [verification](../../references/verification.md) for the exact header format and [event routing](../../references/overview.md) for payload handling.
