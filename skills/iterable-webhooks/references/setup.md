# Setting Up Iterable Webhooks

## Prerequisites

- An Iterable project and the Manage Integrations permission (or org admin)
- A public **HTTPS** endpoint with a certificate from a trusted CA (use the Hookdeck CLI
  locally). Iterable rejects `http://` URLs and API keys in the URL

## Create a System Webhook

1. Log in as a user with the **Manage Integrations** project permission (or an org admin).
2. Go to **Integrations > System Webhooks** and click **Create Webhook**.
3. Enter the **Webhook URL** (for example `https://example.com/webhooks/iterable`) and click **Create**.
4. On the Edit System Webhook screen, choose **Authentication** and fill in **Authentication
   Token** (see below).
5. Select the **triggering events** (for example Email Send, Open, Click, Bounce, Unsubscribe).
6. Optionally enable **Exclude List Update Events** and add custom HTTP headers.
7. Set **Status** to **Enabled** (new webhooks start Disabled) and click **Save Webhook**.

Changes can take a short while to propagate because of caching.

## Choose Authentication

| Option | Header Iterable sends | What you enter |
|--------|-----------------------|----------------|
| None | no `Authorization` header | nothing (not recommended) |
| Basic | `Authorization: <exactly what you typed>` | the full value, e.g. `Basic abc123`; if you want standard Basic auth, base64-encode `user:pass` yourself and add the `Basic ` prefix |
| OAuth 2.0 | `Authorization: Bearer <token>` | only the token, no `Bearer` prefix |

OAuth 2.0 here is a static bearer token. After saving, the token is hidden and cannot be
viewed again, so keep a copy. Set `ITERABLE_AUTHORIZATION` to the **complete header value**
(for example `Bearer <token>`), prefix included.

Custom headers are visible in plain text to users with the Manage Integrations permission;
prefer the Authentication option for secrets.

## Local Testing

```bash
npx hookdeck-cli listen 3000 iterable --path /webhooks/iterable
```

Use the printed URL as the Webhook URL. For FastAPI use port `8000`. To send a manual test:

```bash
curl -X POST http://localhost:3000/webhooks/iterable \
  -H "Content-Type: application/json" \
  -H "Authorization: $ITERABLE_AUTHORIZATION" \
  -d '{"email":"user@example.com","eventName":"emailOpen","dataFields":{"campaignId":49313}}'
```

## Merge Tags

The webhook URL and custom headers accept merge tags such as `{{campaignId}}`,
`{{campaignName}}`, `{{templateId}}` and `{{workflowId}}`. They render blank when undefined.

## Rotating the Credential

Edit the webhook, enter the new token, and update `ITERABLE_AUTHORIZATION` at the same time.
Requests in between will return `401` and are not retried, so rotate during a quiet period.
