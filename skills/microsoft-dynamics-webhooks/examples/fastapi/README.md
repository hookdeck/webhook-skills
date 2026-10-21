# Microsoft Dynamics 365 Webhooks - FastAPI Example

Minimal example of receiving Dynamics 365 (Dataverse) webhooks registered with
the Plug-in Registration Tool, authenticated with the **HttpHeader** option.

> **Dataverse doesn't sign webhooks.** There's no signature header and no HMAC.
> You register a secret header on the webhook (`X-Webhook-Secret: <hex>`) and
> this example compares it in constant time before reading the body. The body
> is a `RemoteExecutionContext` whose `MessageName` (`Create`, `Update`,
> `Delete`) is the event.

## What This Example Shows

- `main.py`: a FastAPI app with a dependency that checks the secret before the body is read.
- A constant-time check (`hmac.compare_digest`) of the registered header (name
  from `DYNAMICS_WEBHOOK_HEADER`, default `X-Webhook-Secret`). It fails closed:
  with `DYNAMICS_WEBHOOK_SECRET` unset, every request gets a `500`.
- `401` for a missing or wrong secret, `400` for invalid JSON or a missing
  `MessageName`, `200` (logged) for a message it does not handle.
- Dispatch on `Create`, `Update` and `Delete`, `{key, value}` attribute
  flattening, and a dedupe key from `OperationId` + step id.

## Prerequisites

- Python 3.10+
- A Dynamics 365 / Dataverse environment and the Plug-in Registration Tool

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

3. Generate a secret and set it as `DYNAMICS_WEBHOOK_SECRET` in `.env`:
   ```bash
   openssl rand -hex 32
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, with the webhook endpoint at
`POST /webhooks/microsoft-dynamics`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 microsoft-dynamics --path /webhooks/microsoft-dynamics
```

No account required. Use the URL it prints as the webhook's endpoint:

1. In the Plug-in Registration Tool choose **Register → Register New WebHook**.
2. **Endpoint URL** = the Hookdeck URL. **Authentication** = **HttpHeader**, with
   key `X-Webhook-Secret` and your secret as the value.
3. Right-click the webhook, **Register New Step**: message `Create` (or
   `Update`, `Delete`), primary entity e.g. `contact`, stage PostOperation,
   mode Asynchronous.
4. Create or edit a contact in Dynamics 365.

## Test

```bash
pytest test_webhook.py -v
```

Or send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/microsoft-dynamics \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $DYNAMICS_WEBHOOK_SECRET" \
  -d '{"MessageName":"Create","PrimaryEntityName":"contact","PrimaryEntityId":"6d81597f-0f9f-e711-8122-000d3aa2331c","OperationId":"4af10637-4ea2-e711-8122-000d3aa2331c","InputParameters":[{"key":"Target","value":{"Attributes":[{"key":"fullname","value":"Test"}]}}]}'
```
