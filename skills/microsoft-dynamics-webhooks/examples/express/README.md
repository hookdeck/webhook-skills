# Microsoft Dynamics 365 Webhooks - Express Example

Minimal example of receiving Dynamics 365 (Dataverse) webhooks registered with
the Plug-in Registration Tool, authenticated with the **HttpHeader** option.

> **Dataverse doesn't sign webhooks.** There's no signature header and no HMAC.
> You register a secret header on the webhook (`X-Webhook-Secret: <hex>`) and
> this example compares it in constant time before reading the body. The body
> is a `RemoteExecutionContext` whose `MessageName` (`Create`, `Update`,
> `Delete`) is the event.

## What This Example Shows

- `src/index.js`: an Express app with `express.raw({ type: '*/*' })` on `POST /webhooks/microsoft-dynamics`.
- A constant-time check of the registered header (name from
  `DYNAMICS_WEBHOOK_HEADER`, default `X-Webhook-Secret`), run before the body is
  parsed. It fails closed: with `DYNAMICS_WEBHOOK_SECRET` unset, every request
  gets a `500`.
- `401` for a missing or wrong secret, `400` for invalid JSON or a missing
  `MessageName`, `200` (logged) for a message it does not handle.
- Dispatch on `Create`, `Update` and `Delete`, `{key, value}` attribute
  flattening, and a dedupe key from `OperationId` + step id.

## Prerequisites

- Node.js 18+
- A Dynamics 365 / Dataverse environment and the Plug-in Registration Tool

## Setup

1. Install dependencies:
   ```bash
   npm install
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
npm start
```

Server runs on http://localhost:3000, with the webhook endpoint at
`POST /webhooks/microsoft-dynamics`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 microsoft-dynamics --path /webhooks/microsoft-dynamics
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
npm test
```

Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/microsoft-dynamics \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $DYNAMICS_WEBHOOK_SECRET" \
  -d '{"MessageName":"Create","PrimaryEntityName":"contact","PrimaryEntityId":"6d81597f-0f9f-e711-8122-000d3aa2331c","OperationId":"4af10637-4ea2-e711-8122-000d3aa2331c","InputParameters":[{"key":"Target","value":{"Attributes":[{"key":"fullname","value":"Test"}]}}]}'
```
