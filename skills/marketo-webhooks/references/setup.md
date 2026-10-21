# Setting Up Marketo Webhooks

## Prerequisites

- A Marketo Engage instance, with an admin role that can open **Admin → Webhooks**
  and permission to edit Smart Campaigns.
- A public HTTPS URL for your endpoint. For local development, use
  `npx hookdeck-cli listen 3000 marketo --path /webhooks/marketo`.

## Generate Your Shared Secret

Marketo has no signing secret, so you create your own:

```bash
openssl rand -hex 32
```

Put the value in your app's environment as `MARKETO_WEBHOOK_SECRET`.

## Create the Webhook

1. Go to **Admin → Webhooks** and choose **New Webhook**.
2. **Webhook Name:** e.g. "Lead created".
3. **URL:** `https://your-app.example.com/webhooks/marketo` (or your Hookdeck
   Source URL).
4. **Request Type:** `POST`.
5. **Payload Template:** click **Insert Token** to add each token. Marketo quotes
   string tokens for you, so don't add quotes around them:
   ```json
   {
     "event": "lead_created",
     "campaign": {{campaign.name}},
     "lead": {
       "id": {{lead.Id}},
       "email": {{lead.Email Address}},
       "first_name": {{lead.First Name}},
       "last_name": {{lead.Last Name}},
       "company": {{lead.Company Name}}
     }
   }
   ```
6. **Request Token Encoding:** JSON. **Response Type:** JSON.
7. Save, then choose **Webhook Actions → Set Custom Header** and add:
   - **Header:** `X-Webhook-Secret`
   - **Value:** your `MARKETO_WEBHOOK_SECRET`

   To use a different header name, also set `MARKETO_WEBHOOK_HEADER` in your app.

Create a second webhook ("Lead updated") with the same URL and header and
`"event": "lead_updated"`. Keep each `event` value fixed, since your handler
dispatches on it.

## Call the Webhook from a Smart Campaign

1. Open (or create) a **trigger** Smart Campaign. Marketo's docs say to use the
   Call Webhook step only in trigger campaigns.
2. On the **Smart List** tab, add a trigger such as **Person is Created** or
   **Data Value Changes**.
3. On the **Flow** tab, add the **Call Webhook** step and choose your webhook.
4. Set the campaign's qualification rule, then activate it.

## Test the Webhook

1. Run the example app and the Hookdeck CLI tunnel, then put the tunnel URL in
   the webhook.
2. Create a test lead (or change a field) so the campaign triggers.
3. Check the delivery in the Hookdeck CLI web UI and your app logs. A `401`
   means the header name or value doesn't match `MARKETO_WEBHOOK_SECRET` /
   `MARKETO_WEBHOOK_HEADER`.

You can also test without Marketo:

```bash
curl -X POST http://localhost:3000/webhooks/marketo \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $MARKETO_WEBHOOK_SECRET" \
  -d '{"event":"lead_created","campaign":"Test","lead":{"id":1042,"email":"amy@example.com"}}'
```

Marketo has no test mode for webhooks. Use a test campaign whose Smart List
only matches a test lead.

## Timeouts

Marketo waits up to 30 seconds for a response. A slow endpoint delays campaign
execution for every lead behind it, so acknowledge quickly and process the
payload in a queue.

## Using Hookdeck in Production

1. In Hookdeck, create a Connection with a **Marketo** source.
2. Turn on verification and enter:
   - **Header Name:** `X-Webhook-Secret` (the custom header you added)
   - **Header Value:** your secret, exactly as entered in Marketo
3. Paste the Hookdeck Source URL into the webhook's **URL** field.

Hookdeck rejects requests whose header doesn't match. It also acknowledges
quickly and queues deliveries to your app, so a slow handler doesn't hold up
your Marketo campaigns, and failed deliveries can be retried and replayed.
