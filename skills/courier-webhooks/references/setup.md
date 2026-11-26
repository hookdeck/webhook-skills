# Setting Up Courier Webhooks

## Prerequisites

- A [Courier](https://app.courier.com/) account with access to workspace settings
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/courier`)

## Register Your Endpoint

1. In the Courier dashboard, go to **Platform → Webhooks**
   (`https://app.courier.com/settings/webhooks`) and find **Outbound Webhooks**.
2. Select **Add** and give the destination a name.
3. Enter your endpoint URL (the route that receives `POST` requests, e.g.
   `https://your-app.com/webhooks/courier`).
4. Save. Every destination receives every event type (see [overview.md](overview.md)),
   so your handler filters on `type`. Destinations are created in the dashboard only;
   there is no API for them.

## Get Your Signing Secret

When you add the destination, Courier creates a `whsec_...` **signing secret** for it.
Copy it and store it as an environment variable in your application:

```bash
COURIER_WEBHOOK_SECRET=your_webhook_signing_secret
```

This secret is the HMAC key used to compute and verify the `courier-signature` header.
Never commit it to source control — load it from the environment.

## Test Environment vs Production

Webhooks are **scoped to the environment where they are created**:

- A webhook created in the **test** environment receives only **test** events.
- A webhook created in **production** receives only **production** events.

If you want to receive events in both, create a separate destination in each
environment. Each destination has its own signing secret.

## Verify It Works

1. Deploy your handler (or expose it locally with a tunnel — see below).
2. Trigger an event in Courier — for example, send a test notification so a
   `message:updated` event fires, or publish a template for `notification:published`.
3. Confirm your endpoint receives the `POST`, verifies the `courier-signature` header,
   and returns `200`.

## Local Development

Expose your local server to Courier with the Hookdeck CLI (no account or install required):

```bash
npx hookdeck-cli listen 3000 courier --path /webhooks/courier
```

This creates a local tunnel and a web UI for inspecting requests. Use the printed URL as
your webhook endpoint in the Courier dashboard while developing. For FastAPI, use port
`8000` instead of `3000`.

## Next Steps

- See [verification.md](verification.md) for signature verification details and gotchas.
- See the [examples/](../examples/) directory for complete, tested handlers.
