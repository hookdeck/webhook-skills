# Setting Up Chatbase Webhooks

## Prerequisites

- A Chatbase account on a paid plan (webhooks need one)
- An AI agent with the relevant Action or channel enabled
- A publicly reachable endpoint URL (use the Hookdeck CLI below during development)

## Where Each Webhook Lives

Each webhook is configured where its event is produced.

| Event | Where to create the webhook |
|-------|-----------------------------|
| `leads.submit` | **Build > Actions** → open **Collect Leads** → **Destinations** |
| `{action name}_collect_data.submit` | **Build > Actions** → open the Collect Data Action → **Destinations** |
| `{action name}_custom_form.submit` | The AI agent's **Settings > Webhooks** tab |
| `phone_call.summary` | **Phone > Connections** → **Call summary webhook** card (or **Settings > Webhooks** while the phone channel is active) |

## Register a Webhook (Collect Leads example)

1. Go to **Build > Actions** and open your **Collect Leads** Action.
2. Open the **Destinations** section.
3. Enter your endpoint URL, e.g. `https://example.com/webhooks/chatbase`.
4. Click **Create webhook**.

Collect Data Actions use the same **Destinations** section.

For custom forms, Chatbase's [AI agent settings page](https://chatbase.co/docs/user-guides/chatbot/settings.md) describes the **Event webhooks** card on the **Settings > Webhooks** tab: tick the form submissions you want under **Events**, enter the URL in **Endpoint**, and click **Create webhook**. The **Events** list stays empty until you create and enable at least one custom form Action.

For phone call summaries, go to **Phone > Connections** on an AI agent with a phone number assigned, enter the URL in the **Call summary webhook** card, and click **Create webhook**.

## Get Your Webhook Secret

Requests are signed with `x-chatbase-signature`, the hex HMAC-SHA1 of the raw body. Chatbase's webhook guide doesn't say where this secret is shown; its examples read it from a `SECRET_KEY` environment variable. Store it as `CHATBASE_WEBHOOK_SECRET`.

To check a candidate secret, capture one real delivery (the Hookdeck CLI shows its headers and body) and compute the digest locally:

```bash
printf '%s' "$RAW_BODY" | openssl dgst -sha1 -hmac "$CANDIDATE_SECRET"
# The output must equal the x-chatbase-signature header (case-insensitive)
```

## Local Development

```bash
npx hookdeck-cli listen 3000 chatbase --path /webhooks/chatbase
```

Use the printed URL as the webhook endpoint (port `8000` for the FastAPI example). No account is required.

## Test

Chatbase's webhook guide documents no test button. Trigger a real event instead: open your agent's chat, let the Collect Leads Action ask for your details, and submit them.
