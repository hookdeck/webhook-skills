# Setting Up Estuary Webhooks

## Prerequisites

- An Estuary account with a materialization you can edit
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## What to Tell Hookdeck

Hookdeck shows this setup note for its Estuary source:

> Estuary triggers are not signed. Add a secret header to the materialization trigger (or the HTTP Webhook connector) and enter it here.

On the Hookdeck source, enter the **header name** and the **whole header value** (exact string,
including any `Bearer ` prefix you typed).

## Add the Secret Header

1. Pick a header name and a long random value, e.g. `Authorization: Bearer <random>`.
2. **Materialization trigger**: set the trigger's `headers` ("HTTP headers to include in the
   request"; values are encrypted at rest) to include it. Check Estuary's docs for the exact
   field layout.
3. **HTTP Webhook connector**: add it under `/headers/customHeaders` instead.
4. Set the trigger `url` to your endpoint (for example `https://example.com/webhooks/estuary`).
5. Store the name and the exact whole value in your receiver:

```bash
ESTUARY_WEBHOOK_HEADER=Authorization
ESTUARY_WEBHOOK_SECRET=Bearer <random>
```

## Choose the Method

Triggers default to `POST`; `PUT` and `PATCH` are also allowed ("One of: POST, PUT, PATCH").
The example handlers accept `GET`, `POST`, `PUT`, `PATCH` and `DELETE`.

Hookdeck's Estuary source pre-selects `POST` without managing the method, so if your trigger
uses `PUT` or `PATCH`, also allow that method on the Hookdeck source.

## Local Testing

```bash
npx hookdeck-cli listen 3000 estuary --path /webhooks/estuary
```

Use the printed URL as the trigger `url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/estuary \
  -H "Content-Type: application/json" \
  -H "$ESTUARY_WEBHOOK_HEADER: $ESTUARY_WEBHOOK_SECRET" \
  -d '{"materialization_name":"acmeCo/orders/to-warehouse","run_id":"run-0001"}'
```

## Rotating the Credential

Because the credential is static and unsigned requests carry no timestamp, rotate it
immediately if it leaks: change the header value in Estuary and the matching value in your
receiver (and in Hookdeck).
