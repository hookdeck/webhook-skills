# Bringg Webhooks - FastAPI Example

Minimal example of receiving [Bringg](https://developers.bringg.com/docs/bringg-webhooks)
webhooks, authenticated with a **Static Header** (Key-Value pair added to the webhook).

Bringg does not sign webhooks, so there is no HMAC signature to verify. The handler reads the
header you chose, compares its whole value against your configured secret in constant time, and
only then parses the body. Bringg also offers JWT and OAuth 2.0 authentication; those are not
covered here and need custom code.

## Prerequisites

- Python 3.9+
- A Bringg Admin user, to register the webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BRINGG_WEBHOOK_HEADER` to the header **Key** and `BRINGG_WEBHOOK_SECRET` to the exact
   **Value** you add under *Headers* when registering the webhook in Bringg, including any
   `Bearer ` prefix you typed (`openssl rand -hex 32` makes a good token).

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/bringg`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send requests with a correct, wrong and missing header value, a custom header name, and
each handled `webhook_type`. No Bringg account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/bringg \
  -H "Content-Type: application/json" \
  -H "Authorization: $BRINGG_WEBHOOK_SECRET" \
  -d '{"webhook_type":"task_created","id":8503585,"title":"50 cases of Best Brand Soda"}'
```

## Receive Bringg Webhooks Locally

Bringg can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 bringg --path /webhooks/bringg
```

Use the printed URL when adding the webhook in Bringg, and add your static header there.

## How It Works

- `main.py`: `verify_bringg_request()`, the `require_bringg_auth` dependency and the `POST /webhooks/bringg` route

1. The configured header is looked up case-insensitively and its **whole** value is compared with
   `BRINGG_WEBHOOK_SECRET` in constant time (no `Bearer ` parsing). A missing header or mismatch
   returns `401`.
2. The body must be a JSON object (`400` otherwise). Any content type is accepted.
3. The handler dispatches on `webhook_type` (`task_created`, `task_done`, `task_cancelled`,
   `driver_assigned`, `way_point_arrived`, `note_created`).
4. It returns `200 {"received": true}`.

A static header authenticates the sender, not the body, and gives no replay protection. Use
HTTPS and rotate the credential if it leaks.
