# Setting Up Discord Webhooks

## Prerequisites

- A Discord account
- A Discord application (create one at [discord.com/developers/applications](https://discord.com/developers/applications))
- Your application's webhook endpoint URL, reachable from the public internet (use [Hookdeck CLI](https://hookdeck.com/docs/cli) for local development)

## 1. Get Your Application Public Key

Webhook signatures are verified with your application's **public key** (hex-encoded), not a shared secret.

1. Go to [Discord Developer Portal](https://discord.com/developers/applications).
2. Click your application.
3. On **General Information**, copy the **Public Key** (a 64-character hex string).
4. Store it in your environment as `DISCORD_PUBLIC_KEY`.

```bash
DISCORD_PUBLIC_KEY=abc123def4567890abc123def4567890abc123def4567890abc123def4567890
```

> The public key is safe to ship in non-secret config (it's a public key), but treating it like a secret is still good practice — it pins which app your endpoint trusts.

## 2. Configure the Webhook Endpoint URL

1. In the Developer Portal, open your application.
2. Go to **Webhooks** (left sidebar, in the "App Settings" group).
3. Set the **Endpoint URL** to your handler URL (e.g. `https://api.example.com/webhooks/discord`).
4. Click **Save**.

When you save, Discord immediately sends a **PING** request (`type: 0`) to verify the endpoint:

- If your handler responds with a signed `2XX` (recommended: `204` empty body) within 3 seconds, the endpoint is accepted.
- If verification fails or the response times out, the Developer Portal shows an error and the endpoint is **not** saved.

## 3. Subscribe to Events

1. Still on the **Webhooks** page, scroll to **Event Subscriptions**.
2. Toggle on the events you want to receive (e.g. `APPLICATION_AUTHORIZED`, `ENTITLEMENT_CREATE`).
3. For lobby/game DM events, you may also need to enable the Social SDK / game integration features for your app.
4. Save.

You'll only receive events you've explicitly subscribed to.

## 4. Local Development with Hookdeck

Discord requires a public HTTPS URL. The easiest way to test locally:

```bash
# Start a tunnel to your local server
npx hookdeck-cli listen 3000 discord --path /webhooks/discord
```

Hookdeck prints a public URL — paste that into the Discord Developer Portal **Endpoint URL** field. The web UI also shows every request/response for debugging.

## 5. Test the Endpoint

There are three ways to verify your endpoint is working:

1. **PING on save** — Simply clicking **Save** on the endpoint URL triggers a PING. A successful save means PING worked.
2. **Resend a test event** — In the Developer Portal, use the **Send Test** button next to your endpoint (when available) to trigger sample events.
3. **Trigger a real event** — Authorize your app from a fresh user account to fire `APPLICATION_AUTHORIZED`.

## Common Setup Errors

| Error in Portal | Likely Cause |
|----------------|--------------|
| "Endpoint could not be verified" | Handler responded non-2XX to the PING, or signature check rejected the PING |
| "Request timed out" | Handler took longer than 3 seconds |
| "Invalid request signature" (in your logs) | Wrong `DISCORD_PUBLIC_KEY`, or you parsed JSON before verifying (lost raw body) |
| 401 on every event | Public key mismatch — copied the wrong app's key, or extra whitespace |

See [verification.md](verification.md) for signature verification details and common pitfalls.
