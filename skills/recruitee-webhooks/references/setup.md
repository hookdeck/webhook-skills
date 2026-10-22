# Setting Up Recruitee Webhooks

## Prerequisites

- A Recruitee account whose hiring role has the **Manage webhooks** ability (under Add-ons)
- A public **HTTPS** endpoint (e.g. `https://your-app.com/webhooks/recruitee`)

## Register Your Endpoint

1. In Recruitee go to **Settings → Apps and Plugins → Webhooks**.
2. Click **+ New webhook**.
3. **Name** - anything meaningful to you.
4. **POST URL** - your HTTPS endpoint.
5. **Events** - pick the events you want (`new_candidate`, `candidate_moved`, `candidate_assigned`, `candidate_deleted`, and the job events). You may select none and adjust later.
6. Click **Verify and create**. Recruitee POSTs `{"test":true}` and your endpoint must return **200** for the webhook to be saved.

## Get Your Signing Secret

The webhook secret is shown under **Settings → Apps and Plugins → Webhooks**.
Store it as `RECRUITEE_WEBHOOK_SECRET`. Recruitee generates it; you do not choose it.

## Testing

- **Test** sends `{"test":true}`; **Test payload** sends an example event payload with the test parameter too.
- The **Logs** tab keeps every request for 30 days with the body, your response, the next attempt time, and buttons to cancel or retry immediately.
- For local development, tunnel requests with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 recruitee --path /webhooks/recruitee
```

## Delivery, Retries, and Limits

- Only a **200** response counts as success. Anything else is retried up to nine times: after 1 min, 3 min, 10 min, 45 min, 2 h, 5 h, 10 h, 24 h, 48 h.
- Requests time out after 10 seconds: acknowledge fast, process async.
- Rate limit: 5 requests/minute for trial companies, 100/minute otherwise. Beyond that, deliveries are delayed 10 ± 5 minutes.
- Under **Settings → Apps and Plugins → Webhooks** you can pick team members to be emailed about failed deliveries.
