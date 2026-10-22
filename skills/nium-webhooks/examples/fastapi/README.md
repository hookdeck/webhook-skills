# Nium Webhooks - FastAPI Example

Minimal example of receiving Nium webhooks and authenticating them with the static header agreed
with Nium at client setup.

Nium does not sign payloads, so there is no HMAC to verify. The handler reads the header named in
`NIUM_WEBHOOK_HEADER` (default `x-partner-key`) and compares its **whole** value with
`NIUM_WEBHOOK_SECRET` in constant time. A static shared credential authenticates the sender, not
the body, and gives no replay protection: use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Nium client setup that adds your chosen static header (see [../../references/setup.md](../../references/setup.md))

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

3. Set `NIUM_WEBHOOK_HEADER` to the header name you agreed with Nium and `NIUM_WEBHOOK_SECRET` to
   the exact, whole header value (including any `Bearer ` prefix you typed).

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/nium`.

## Test

```bash
pytest test_webhook.py
```

The tests send every handled event (including the RFI events, identified by `rfiDetails.status`)
with correct, wrong and missing credentials. No Nium account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/nium \
  -H "Content-Type: application/json" \
  -H "x-partner-key: $NIUM_WEBHOOK_SECRET" \
  -d '{"customerHashId":"0de1e512-e0d7-4eca-ad41-dd39325facc2","systemReferenceNumber":"RT1343085439","template":"REMIT_TRANSACTION_PAID_WEBHOOK"}'
```

## Receive Webhooks Locally

Nium can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 nium --path /webhooks/nium
```

Give the printed URL to Nium as your webhook URL.

## How It Works

- `main.py`: `verify_nium_request()`, a `require_nium_credential` dependency and the `POST /webhooks/nium` route, which reads the raw body so any content type works.

1. The configured header is checked before the body is parsed. A missing header or mismatch returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `template` field (`CUSTOMER_STATUS_WEBHOOK`,
   `REMIT_TRANSACTION_PAID_WEBHOOK`, `FX_CONVERSION_COMPLETED_WEBHOOK`, `CARD_POS_APPROVED_WEBHOOK`,
   and others), or on `rfiDetails.status` (`RFI_REQUESTED`, `RFI_RESPONDED`, `RFI_CLOSED`) for RFI events.
4. It returns `200 {"received": true}`. Nium treats any other status as a failed delivery.
