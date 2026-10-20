# Setting Up Cal.com Webhooks

## Prerequisites

- A Cal.com account (cal.com SaaS or self-hosted)
- Your application's webhook endpoint URL
  - **Cal.com SaaS**: must be public **HTTPS**; `localhost` and private IPs are blocked. Use a
    tunnel (below) for local development.
  - **Self-hosted**: HTTP and private IPs are allowed.

## Create a Webhook

1. In Cal.com go to **Settings → Developer → Webhooks** (`/settings/developer/webhooks`).
   Webhooks can also be added on a single event type (event type → **Webhooks** tab), on a team, or
   via the Cal.com API.
2. **Subscriber URL**: your endpoint, e.g. `https://your-app.com/webhooks/cal-com`.
3. **Event triggers**: select what you need, e.g. Booking Created, Booking Rescheduled,
   Booking Cancelled, Booking Paid, Meeting Ended. In the body these arrive as `BOOKING_CREATED`,
   `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`, `BOOKING_PAID`, `MEETING_ENDED`.
4. **Secret**: enter a random secret (e.g. `openssl rand -hex 32`). This is what Cal.com uses to
   sign every delivery. Store the same value in your app:

   ```bash
   CALCOM_WEBHOOK_SECRET=your_webhook_secret
   ```

5. Optional: **Custom headers** (up to 10 static headers, e.g. an `Authorization` bearer token)
   and a **Custom payload** template. Neither changes how `x-cal-signature-256` is computed.
6. Save.

The secret is optional in Cal.com. Without one, deliveries carry
`x-cal-signature-256: no-secret-provided` and cannot be verified — always set a secret for
production endpoints.

## Verify It Works

Each delivery includes `X-Cal-Signature-256` (hex HMAC-SHA256 of the raw body) and
`X-Cal-Webhook-Version`. See [verification.md](verification.md).

## Test Your Endpoint

1. Start your handler locally and expose it with the Hookdeck CLI (no account required):

   ```bash
   npx hookdeck-cli listen 3000 cal-com --path /webhooks/cal-com
   ```

2. Use the tunnel URL as the Subscriber URL.
3. Use the **Ping test** button on the webhook form, or book a test meeting on one of your event
   types to fire `BOOKING_CREATED`; cancel it to fire `BOOKING_CANCELLED`.
4. Inspect requests and replay them in the Hookdeck web UI.

## Delivery Notes

- Respond with a 2xx quickly and do slow work asynchronously.
- Cal.com documents retries (on network errors, 408, 429, and 5xx) only for the
  `DELEGATION_CREDENTIAL_*` events; don't rely on retries for booking events. Put
  [Hookdeck Event Gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway)
  in front of your endpoint if you need guaranteed delivery and replay.
- `MEETING_STARTED` / `MEETING_ENDED` are scheduled at booking time and cancelled automatically if
  the booking is cancelled or rescheduled.
