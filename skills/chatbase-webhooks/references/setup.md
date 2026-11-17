# Setting Up Chatbase Webhooks

## Prerequisites

- A Chatbase account on a paid plan (webhooks are not available on the free plan)
- An AI agent with the relevant Action or channel enabled
- A publicly reachable endpoint URL (use the Hookdeck CLI below during development)
- For the HIPAA webhook: a HIPAA-compliant Enterprise workspace with a signed BAA, an `https://` endpoint, and permission to edit workspace settings

## Where Each Webhook Lives

Chatbase has no single webhooks page. Each event is configured where it is produced.

| Event | Where to create the webhook |
|-------|-----------------------------|
| `leads.submit` | **Build > Actions** → open **Collect Leads** → **Destinations** |
| `{action name}_collect_data.submit` | **Build > Actions** → open the Collect Data Action → **Destinations** |
| `{action name}_custom_form.submit` | The custom form Action's **Webhooks** tab (the webhook guide also points to the agent's **Settings > Webhooks** tab) |
| `phone_call.summary` | **Phone > Connections** → **Call summary webhook** card (or **Settings > Webhooks** while the phone channel is active) |
| `conversation.deleted` (HIPAA) | Workspace **Settings > HIPAA** → **Webhook configuration** |

## Register an Event Webhook (Collect Leads example)

1. Go to **Build > Actions** and open your **Collect Leads** Action.
2. Expand the **Destinations** section.
3. Enter your endpoint URL, e.g. `https://example.com/webhooks/chatbase`.
4. Click **Create webhook**.

Collect Data Actions use the same **Destinations** section. For custom forms, open the custom form Action's settings, click the **Webhooks** tab, enter your endpoint URL, and click **Create Webhook**. The Action must be enabled before it sends events.

## Get Your Event Webhook Secret

Event webhooks are signed with `x-chatbase-signature`, the hex HMAC-SHA1 of the raw body. Chatbase's webhook guide does not say where this secret is displayed; its own sample code just reads it from a `SECRET_KEY` environment variable. Store whatever secret Chatbase gives you as `CHATBASE_WEBHOOK_SECRET`.

If you are not sure which value is the key, capture one real delivery (the Hookdeck CLI shows the headers and body) and check it locally:

```bash
printf '%s' "$RAW_BODY" | openssl dgst -sha1 -hmac "$CANDIDATE_SECRET"
# The output must equal the x-chatbase-signature header
```

## Configure the HIPAA Conversation Webhook

1. Go to **Settings > HIPAA** and find the **Webhook configuration** card (only shown on HIPAA-enabled workspaces).
2. Enter your `https://` endpoint, e.g. `https://example.com/webhooks/chatbase-hipaa`, and click **Save**. Configure the final URL: redirects (trailing slash, `www`, `301`s) fail verification and deliveries.
3. Copy the **signing secret** from the one-time modal (64 hex characters) into `CHATBASE_HIPAA_WEBHOOK_SECRET`. Afterwards only the last four characters are shown; regenerating is the only way to get a usable value again.
4. Deploy your handler, then click **Verify endpoint**. Chatbase sends two `POST`s with `"test": true`: the first, signed with your secret, must get a 2xx; the second, signed with a throwaway key, must get a non-2xx. Nothing is delivered until verification passes.

Changing the endpoint URL clears verification. Regenerating the secret keeps verification but takes effect immediately, including for deliveries already waiting. To rotate without downtime, accept both old and new secrets briefly. **Remove webhook** deletes both the URL and the secret.

## Local Development

```bash
npx hookdeck-cli listen 3000 chatbase --path /webhooks/chatbase
```

Use the printed URL as the webhook endpoint (port `8000` for the FastAPI example). No account is required. For the HIPAA webhook, point a second tunnel at `/webhooks/chatbase-hipaa`.

## Test

Chatbase has no "send test event" button for event webhooks. Trigger real events instead: open your agent's chat, let the Collect Leads form appear, and submit it. For the HIPAA webhook, **Verify endpoint** exercises both the accept and reject paths.
