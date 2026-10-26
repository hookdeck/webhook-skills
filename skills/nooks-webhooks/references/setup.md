# Setting Up Nooks Webhooks

## Prerequisites

- A Nooks workspace where you can open **Integrations → Webhooks** settings
- A publicly reachable endpoint that answers `POST` with a 2xx (use the Hookdeck CLI for local development)

## Add Your Endpoint and Activate It

1. In Nooks, go to the **Webhooks** settings page under **Integrations**.
2. Add your endpoint URL and save.
3. When you save, Nooks immediately sends a one-time activation `POST` to the URL. **Your endpoint must answer it with a 2xx** (`200 OK` or `202 Accepted`). If it can't be pinged, or answers 4xx/5xx, the save fails.
4. After a successful save, Nooks shows the signing key (format `nooks-webhook-signing-key-...`). **It is shown only once**, so store it right away as `NOOKS_WEBHOOK_SECRET`. Use it exactly as shown: no decoding, no prefix stripping.
5. The endpoint is marked active and `call.logged` events start after you verify the webhook URL from the settings page.

The activation ping may be unsigned, and the signing key doesn't exist until activation succeeds, so you can't verify it. The examples reject unsigned requests with 401 by default. To activate a URL that points straight at your app, start it with `NOOKS_ACCEPT_UNSIGNED_PING=true` (no `NOOKS_WEBHOOK_SECRET` needed yet) and save the URL: unsigned requests then get 200 and are not processed. Store the signing key as `NOOKS_WEBHOOK_SECRET` and remove the flag. Every later delivery is signed, and a request that carries the header but doesn't verify gets 401 either way.

If saving fails with a 4xx or 5xx, your endpoint is rejecting the activation ping (usually an auth rule or a signature check applied too early): use the flag above while you save, then turn it off.

## Hookdeck Setup

Put the Hookdeck source URL in Nooks instead of your own URL. Hookdeck answers the activation ping for you, so the save succeeds even before your server is running.

**The one-off activation ping Nooks sends when you save the URL is unsigned and may show as a failed verification. Later deliveries are signed.** Ignore that single failed verification. Then:

1. Copy the signing key Nooks shows after saving.
2. Paste it as the signing secret on the Hookdeck source (the Nooks source type) so later deliveries are verified.
3. Verify the webhook URL from the Nooks settings page so events start flowing.

If your handler is verifying too (as the examples do), set `NOOKS_WEBHOOK_SECRET` to the same key.

For local development:

```bash
npx hookdeck-cli listen 3000 nooks --path /webhooks/nooks
```

Use the Hookdeck URL as the endpoint URL in Nooks.

## Testing

Nooks's activation ping is the only documented test delivery. After activation, make or log a call in Nooks to produce a real `call.logged` event, and watch it arrive in the Hookdeck dashboard.

## Lost the Key?

Nooks's guide says the signing key is shown only once and documents no way to view it again. If you lose it, check the Nooks settings page for a way to re-create the webhook, and save the new key when it is shown.
