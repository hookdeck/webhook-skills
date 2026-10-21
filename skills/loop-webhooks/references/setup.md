# Setting Up Loop Webhooks

## Prerequisites

- A Loop account with access to the organization's Settings
- A public HTTPS URL for your webhook endpoint (use the Hookdeck CLI below
  during development)

## How Do I Add a Loop Webhook Endpoint?

Loop's webhook management is a Svix application portal inside the Loop app.

1. In Loop, click **Settings** in the left navigation, then **Webhooks** under
   your organization name.
2. Add an endpoint with your URL, e.g. `https://example.com/webhooks/loop`.
3. Choose the event types to receive (see [overview.md](overview.md)). If you
   choose none, the endpoint receives **all** events. That's handy for
   testing, but Loop recommends narrowing it later.

Not ready to receive yet? The portal's **Svix Play** button generates a
temporary URL where you can inspect deliveries.

## Where Do I Find the Signing Secret?

Each endpoint has its own signing secret, shown on the endpoint's details page
in the portal. It looks like `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`. Store it
as `LOOP_WEBHOOK_SECRET`:

```bash
LOOP_WEBHOOK_SECRET=whsec_...
```

Keep the `whsec_` prefix. The Svix SDK expects it and strips it itself.
Because secrets are per endpoint, a staging and a production endpoint have
different secrets.

## How Do I Test My Endpoint Locally?

Start your server, then open a tunnel with the Hookdeck CLI (no account
required):

```bash
npx hookdeck-cli listen 3000 loop --path /webhooks/loop   # Express / Next.js
npx hookdeck-cli listen 8000 loop --path /webhooks/loop   # FastAPI
```

Add the printed URL as an endpoint, open the endpoint's **Testing** tab, and
send an example event such as `test-event.created`. Click into the message to
see the payload and every delivery attempt.

## How Do I Set a Rate Limit?

Svix rate limits per endpoint and spreads messages out when the limit is hit.
Loop recommends setting one: **Settings** → **Webhooks** → select the endpoint →
**Advanced** → enter the rate limit.

## How Do I Recover Failed Deliveries?

- **One message:** find it in the portal, open the options menu next to an
  attempt and click **Resend**.
- **Everything since an outage:** on the endpoint page, **Options** →
  **Recover Failed Messages**, then pick a time window. Or open any message's
  options menu → **Replay...** → "Replay all failed messages since this time".
- **Disabled endpoint:** after 5 days of failures the endpoint is disabled.
  Find it in the list and select **Enable Endpoint**.

Resent messages keep the same payload `eventId`, which is why handlers dedupe on
it rather than on `svix-id`.

## Checklist

- [ ] Endpoint returns `2xx` within 15 seconds (queue slow work)
- [ ] CSRF protection disabled for the webhook route, if your framework adds it
- [ ] Raw body used for verification
- [ ] `LOOP_WEBHOOK_SECRET` set per environment
- [ ] Processed `eventId`s stored for deduplication
