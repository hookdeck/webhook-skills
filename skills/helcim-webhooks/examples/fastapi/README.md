# Helcim Webhooks - FastAPI Example

Minimal example of receiving Helcim webhooks with signature verification using the
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library (Helcim follows the
Standard Webhooks specification).

## Prerequisites

- Python 3.9+
- Helcim account with webhooks enabled and its `verifierToken`

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Helcim `verifierToken` to `.env` as `HELCIM_WEBHOOK_SECRET`, exactly as shown at
   **All Tools > Integrations > Webhooks** (bare base64, no `whsec_` prefix).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/helcim
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256 with the base64-decoded token, base64 output), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 helcim --path /webhooks/helcim
```

1. In Helcim go to **All Tools > Integrations > Webhooks**, toggle Webhooks ON, enter the tunnel URL as the Deliver URL (it must be `https` and must not contain "Helcim"), pick the events and save.
2. Copy the `verifierToken` shown there into `.env`.
3. Process a test transaction and watch the delivery arrive.

If you receive through Hookdeck, paste the token into the Hookdeck source as `whsec_` followed by the token. Hookdeck's configuration alert reads: "Paste your verifierToken as whsec_ followed by the token, or verification fails."

## Event Handling

The event name is the top-level `type`. The handler routes these events and logs anything else:

- `cardTransaction`: `{ id, type }`, a thin notification; fetch the amount and card details with Get Card Transaction by ID
- `terminalCancel`: `{ data, type }`, a payment cancelled on a device in API mode

There is no event id in the body: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
