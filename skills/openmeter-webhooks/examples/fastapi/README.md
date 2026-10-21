# OpenMeter Webhooks - FastAPI Example

Minimal FastAPI example of receiving OpenMeter notification webhooks with
signature verification, using the official [`svix`](https://pypi.org/project/svix/)
Python SDK (OpenMeter delivers webhooks via Svix).

## Prerequisites

- Python 3.10+
- An OpenMeter webhook notification channel and its signing secret (`whsec_...`)

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

3. Add your channel's signing secret to `.env` as `OPENMETER_WEBHOOK_SECRET`.
   If you set a custom secret on the channel, keep the `whsec_` prefix.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

Webhook endpoint: `POST http://localhost:8000/webhooks/openmeter`

## Test

Run the test suite (generates real Svix-style signatures):

```bash
pytest test_webhook.py -v
```

To receive real OpenMeter webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 openmeter --path /webhooks/openmeter
```

Use the printed URL as the `url` of your OpenMeter webhook channel and attach
the channel to a notification rule.

## Events Handled

- `entitlements.balance.threshold`
- `entitlements.reset`
- `invoice.created`
- `invoice.updated`

## Project Structure

```
├── main.py            # FastAPI app + webhook handler
├── test_webhook.py    # Signature verification tests
├── requirements.txt
└── .env.example
```
