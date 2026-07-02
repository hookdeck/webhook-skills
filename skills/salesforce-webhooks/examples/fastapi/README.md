# Salesforce Webhooks - FastAPI Example

Minimal example of receiving Salesforce **Outbound Messages** with FastAPI,
validating the `OrganizationId`, and returning the required SOAP `<Ack>true</Ack>`
response.

Salesforce Outbound Messages have **no signature** — you authenticate by matching
the `<OrganizationId>` in the SOAP body against your org id (plus HTTPS + IP
allowlisting at the edge). The parsing uses the Python standard library
(`xml.etree.ElementTree`) and `hmac.compare_digest` — no third-party SDK exists
for Salesforce webhook verification.

## Prerequisites

- Python 3.9+
- A Salesforce org with an Outbound Message configured (see
  [../../references/setup.md](../../references/setup.md))
- Your 18-character Salesforce Organization Id

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

3. Add your Salesforce Organization Id to `.env` as `SALESFORCE_ORG_ID`, then
   export it (or use a loader like `python-dotenv`):
   ```bash
   export SALESFORCE_ORG_ID=00Dxx0000000000EAA
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The endpoint is served at `POST http://localhost:8000/webhooks/salesforce`.

## Local Testing with Hookdeck CLI

Expose your local server so Salesforce can reach it (no account required):

```bash
npx hookdeck-cli listen 8000 salesforce --path /webhooks/salesforce
```

Point your Outbound Message **Endpoint URL** at the Hookdeck URL, then edit a
matching record in Salesforce to trigger a delivery.

## Test

```bash
pytest test_webhook.py
```

The tests build real Outbound Message SOAP envelopes and assert the endpoint acks
valid messages, rejects mismatched/absent/malformed input, and handles multiple
notifications per message.
