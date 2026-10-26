# Setting Up Convox Webhooks

## Prerequisites

- A Convox Rack on 3.24.6 or later (signing is not available on earlier versions)
- Permission to set Rack parameters (and Admin role in Console if you want to reveal an existing key)
- Your application's webhook endpoint URL (`/webhooks/convox` in the examples)

> Signing is opt-in: set the webhook_signing_key rack parameter (Rack 3.24.6 or later) and paste the same value. Without it, deliveries are unsigned and fail verification.

## How Do I Get the Signing Secret?

You choose it. The Rack uses the value as-is, so any string with enough entropy works. Convox suggests 32 random bytes as hex:

```bash
convox rack params set webhook_signing_key=$(openssl rand -hex 32)
```

Or use Console under Rack > Settings, which can generate, reveal and rotate the key (revealing needs the Admin role; other users see a masked value).

Put the same value in `CONVOX_WEBHOOK_SECRET` on the receiver. Even though the suggested value looks like hex, **use it as the literal string**; don't hex-decode it. With CLIs older than 3.24.6, `convox rack params` prints the key in plaintext, so upgrade the CLI first.

If you receive through Hookdeck, create a source with the Convox type and paste the same value into its signing secret field.

## How Do I Register My Endpoint?

1. In Console, open your app, then App > Settings > Webhooks.
2. Add your endpoint URL (for local testing, the Hookdeck CLI URL from `npx hookdeck-cli listen 3000 convox --path /webhooks/convox`).
3. For budget-cap events you can instead set `budget.atCapWebhookUrl` at the top level of `convox.yml`. It applies to the whole app; there is no per-service URL.

Handle the actions you care about and log the rest, since the docs tell receivers to ignore unknown actions. A receiver config can also be a JSON object with `url` and a `timeout` (Rack 3.24.6+), for example `{"url":"https://audit.internal.corp/v1/events","timeout":"60s"}`.

## How Do I Rotate the Signing Key Without Downtime?

A Rack supports up to 4 active keys at once. While more than one is active, it signs with all of them and sends one `v1=` per key.

1. Generate a new key and set it on the Rack.
2. Update your receivers to the new key. The Rack signs with every active key, so a receiver holding either the old or the new key keeps verifying (it accepts the delivery if any `v1=` matches) while you switch them one by one.
3. Remove the old key from the Rack.

Old payloads cannot be re-signed. Setting more than 4 keys is rejected. If you downgrade a Rack below 3.24.6 it stops sending `Convox-Signature`; set a fresh key after upgrading again.

## Testing

Trigger a cheap event such as `convox apps create`, or use an action that fires from the CLI like `convox budget set`. Check the Hookdeck CLI web UI or your logs for the delivery. If you get `401`, see [verification.md](verification.md#how-do-i-debug-verification-failures).
