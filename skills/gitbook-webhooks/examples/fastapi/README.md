# GitBook Webhooks with FastAPI

A standalone receiver for signed `POST /webhooks/gitbook` deliveries. It verifies the raw request body and logs event labels; add your own durable processing before acknowledging.

## Setup

Requires Python 3.10+ and the signing secret from [provider setup](../../references/setup.md).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `GITBOOK_WEBHOOK_SECRET` in the copied environment file.

Set `GITBOOK_WEBHOOK_TOLERANCE_SECONDS` to a positive number to enforce an application age limit in seconds. Unset or `0` disables it. Old timestamps remain valid by default so Hookdeck retries and replays can retain the original headers.

## Run and Test

```bash
uvicorn main:app --reload --port 8000
```

The endpoint listens at `http://localhost:8000/webhooks/gitbook`.

```bash
pytest -q
```

Tests cover a fixed signing vector, tampering, malformed signatures, raw byte preservation and wrong-typed JSON. `vector.json` contains an illustrative payload and a fixed digest checked against core; it is not a live vendor capture.

## Receive Real Deliveries

```bash
npx hookdeck-cli listen 8000 gitbook --path /webhooks/gitbook
```

Register the public URL with GitBook. Return a successful HTTP response promptly. Keep processing idempotent using eventId, and accommodate retries.

## Responses

- 200: accepted delivery, including unrecognised events.
- 400: signed invalid JSON or a body that is not an object.
- 401: missing or invalid signature.
- 500: missing secret or invalid tolerance configuration.

See [verification](../../references/verification.md) for the exact header format and [event routing](../../references/overview.md) for payload handling.
