# Setting Up Brevo Webhooks

## Prerequisites

- Brevo account with access to Transactional and/or Marketing webhooks
- A Brevo API key (`xkeysib-...`) if you create webhooks through the API
- A public HTTPS endpoint (use the Hookdeck CLI tunnel for local development)

## Choose Your Authentication

Brevo has no signing secret. Pick a credential and set it on your server:

- **Basic auth**: choose a username and password, set `BREVO_WEBHOOK_USERNAME`
  and `BREVO_WEBHOOK_PASSWORD`, and put them in the notify URL.
- **Bearer token**: generate a random token (e.g. `openssl rand -hex 32`) and
  set `BREVO_WEBHOOK_TOKEN`.

## Register Your Endpoint (Dashboard)

1. In Brevo, open the Transactional or Marketing webhooks page.
2. Add a new webhook and enter your notify URL. For Basic auth, embed the
   credentials: `https://username:password@your-domain.com/webhooks/brevo`.
3. Select events, for example: Delivered, Opened, Clicked, Soft Bounce,
   Hard Bounce, Spam, Unsubscribed.
4. Save.

## Register Your Endpoint (API)

Bearer token:

```bash
curl --request POST https://api.brevo.com/v3/webhooks \
  --header 'api-key: xkeysib-your-api-key' \
  --header 'content-type: application/json' \
  --data '{
    "description": "My app",
    "url": "https://your-domain.com/webhooks/brevo",
    "type": "transactional",
    "events": ["delivered", "hardBounce", "softBounce", "spam", "unsubscribed"],
    "auth": { "type": "bearer", "token": "your_webhook_token" }
  }'
```

Basic auth (credentials in the URL):

```bash
curl --request POST https://api.brevo.com/v3/webhooks \
  --header 'api-key: xkeysib-your-api-key' \
  --header 'content-type: application/json' \
  --data '{
    "url": "https://your_webhook_username:your_webhook_password@your-domain.com/webhooks/brevo",
    "type": "marketing",
    "events": ["delivered", "opened", "click", "hardBounce", "unsubscribed", "spam"]
  }'
```

Other useful fields:

- `"headers": [{"key": "x-my-secret", "value": "..."}]` — custom headers sent on every delivery
- `"batched": true` — deliver events in batches (5-minute windows, up to 500 events)
- `"channel": "sms"` — SMS events instead of email

Note that `events` uses camelCase (`hardBounce`), while payloads use snake_case
(`hard_bounce`). See [overview.md](overview.md).

## Restrict by IP

Allow only Brevo's webhook IP ranges at your firewall, load balancer, or WAF.
Brevo publishes them here:
[Brevo IP ranges](https://help.brevo.com/hc/en-us/articles/208848409).

## Testing

1. Start your server and a tunnel:
   ```bash
   npx hookdeck-cli listen 3000 brevo --path /webhooks/brevo
   ```
2. Use the tunnel URL as the notify URL (with `username:password@` for Basic auth).
3. Send a transactional email through the API or dashboard. You'll receive
   `request` (if subscribed to Sent) and `delivered` events.

## Managing Webhooks

Use the API to list (`GET /v3/webhooks`), update (`PUT /v3/webhooks/{webhookId}`),
or delete (`DELETE /v3/webhooks/{webhookId}`) webhooks. Rotate credentials by
updating the webhook URL or `auth` token, then updating your environment variables.
