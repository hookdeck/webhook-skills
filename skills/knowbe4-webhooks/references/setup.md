# Setting Up KnowBe4 Webhooks

Add a custom header with a secret value to the KSAT or PhishER webhook.

## Prerequisites

- KSAT: a Platinum, Diamond or SAT Advanced subscription and an admin account; or PhishER with
  access to **Settings > Webhook**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 knowbe4 --path /webhooks/knowbe4` locally)
- A long random secret to use as the header value

## Create a KSAT Webhook

1. From your KSAT admin account, click your email address (top right) and select **Account Settings**.
2. Go to **Account Integrations > Webhooks** and click **+ Create**.
3. Enter a **Name** and the **URL** of your endpoint (e.g. `https://example.com/webhooks/knowbe4`).
4. Under **Custom Header**, click the plus icon and fill in **Key** and **Value**: the Key is the
   header name (e.g. `Authorization`, or `X-KnowBe4-Key`) and the Value is your secret.
5. Optionally add **Custom Data** (Key and Value, e.g. `System` and `KnowBe4`) to the payload, and
   tick **Enable Webhook Failure Notifications**.
6. Set **Status** to **Active**.
7. Under **Events**, tick the Phishing, Training or General Events you want.
8. Click **Save**.

KSAT also has an **Authentication** field. This skill relies on the custom header instead; it is
what Hookdeck's KnowBe4 source checks.

## Create a PhishER Webhook

1. In PhishER, go to **Settings > Webhook** and click **New Webhook**.
2. Enter a **Name** and the **URL**.
3. Leave **Authorization** at **No Auth**, or choose API Key or Bearer Token only if you also want
   the header those options produce. **Basic Auth is not covered by Hookdeck's KnowBe4 source.**
4. Under **Custom Headers**, click the plus icon and add your **Key** and **Value**.
5. Choose the **Available Data** types and any **Custom Data**.
6. Optionally set the **Success** and **Failure** message tags, then click **Create**.
7. Create a PhishER action and select **Send to Webhook** so messages are sent to it.

## Match the Environment Variables

```bash
KNOWBE4_WEBHOOK_HEADER=Authorization                    # the Key you entered
KNOWBE4_WEBHOOK_SECRET=Bearer your-long-random-secret   # the exact, whole Value you entered
```

`KNOWBE4_WEBHOOK_SECRET` must equal the whole header value, including any `Bearer ` prefix you
typed in KnowBe4. The header name is matched case-insensitively.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/knowbe4 \
  -H "Content-Type: application/json" \
  -H "Authorization: $KNOWBE4_WEBHOOK_SECRET" \
  -d '{"event_type":"Phish Failure Removed","System":"KnowBe4"}'
```

The body above is illustrative. For a real delivery, trigger a selected event in KSAT or run a
PhishER action with **Send to Webhook**.

## If the Webhook Is Deactivated

A KSAT webhook with more than 1,000 failed responses in an hour is deactivated. Fix the endpoint,
then set the webhook's status back to **Active** in Account Settings.
