# Setting Up Gravity Forms Webhooks

## Prerequisites

- A WordPress site with Gravity Forms and the **Webhooks Add-On** installed and activated
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)
- A random secret you generate yourself:

  ```bash
  openssl rand -hex 32
  ```

Gravity Forms never issues a webhook signing secret. The secret is yours: you put it in
the feed's Request Headers and in your server's `GRAVITY_FORMS_WEBHOOK_SECRET`.

## How Do I Add a Webhook Feed with a Secret Header?

1. In WordPress, open **Forms**, hover over the form, and choose **Settings → Webhooks**.
2. Click **Add New**.
3. **Name:** anything, for example `Send to my app`.
4. **Request URL:** your endpoint, for example `https://example.com/webhooks/gravity-forms`.
   It must pass WordPress URL validation: no custom port, and no redirect to a URL that
   fails validation.
5. **Request Method:** `POST`.
6. **Request Format:** `JSON` (urlencoded `FORM` also works with the examples).
7. **Request Headers:** add a header with name `X-Webhook-Secret` and your secret as the
   value.
8. **Request Body:** `All Fields` for the whole entry, or `Select Fields` and map the keys
   you need. Include `id` and `form_id` so the handler can deduplicate and route.
9. Optionally enable a **Webhook Condition**.
10. Save the feed, then submit the form.

Set the same secret on your server:

```bash
GRAVITY_FORMS_WEBHOOK_SECRET=<your secret>
```

If you used a header name other than `X-Webhook-Secret`, also set
`GRAVITY_FORMS_WEBHOOK_HEADER`.

## Is There a Test Button?

The docs describe none. Submit the form to send a delivery,
and inspect it in the Hookdeck CLI web UI or your server logs.

## What Happens When a Delivery Fails?

The docs don't describe automatic retries, timeouts, source IPs or a delivery ID header.
Return `2xx` quickly, do slow work asynchronously, and deduplicate on the entry `id` in
case you re-run a submission by hand. Put Hookdeck in front if you need retries and replay.

## Local Development

```bash
npx hookdeck-cli listen 3000 gravity-forms --path /webhooks/gravity-forms
```

Use port `8000` for FastAPI. Use the URL it prints as the Request URL.
