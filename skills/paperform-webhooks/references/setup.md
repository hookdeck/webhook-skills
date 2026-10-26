# Setting Up Paperform Webhooks

## Prerequisites

- A Paperform account on a plan that includes webhooks
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Add the Webhook

1. In the form editor, go to **After Submission → Integrations & Webhooks**.
2. Open the **Webhooks** section near the bottom of the page.
3. Click **Add Webhook** and enter your webhook URL.
4. In the **Triggered On** dropdown choose **New Submission** or **Partial Submission**.
5. Click **Create**.

Add a second webhook if you want both triggers. To tell them apart on your side, give each URL a
different query string, such as `?trigger=new` and `?trigger=partial` (a convention of this skill's
examples; Paperform's payload has no field that says which trigger fired).

## Add the Secret Header

Paperform doesn't sign webhooks, so authenticate with a custom header:

1. When creating the webhook, enable the **Custom headers** toggle.
2. Click **+ Add Header** and enter a header name and a long random value, for example
   `X-Webhook-Secret: 9f2c...` (generate one with `openssl rand -hex 32`).
3. Set the same two values in your environment:

```bash
PAPERFORM_WEBHOOK_HEADER=X-Webhook-Secret
PAPERFORM_WEBHOOK_SECRET=9f2c...
```

Notes:

- The header name is up to you; the examples default to `Authorization` if
  `PAPERFORM_WEBHOOK_HEADER` is unset.
- `PAPERFORM_WEBHOOK_SECRET` must equal the **entire** header value. If you typed `Bearer abc`,
  the secret is `Bearer abc`.
- Custom headers don't support Answer Piping, so the value is sent literally.
- Anyone who learns the value can send you requests. Use HTTPS and rotate it if it leaks.

## Test the Webhook

Click **Test** in the Webhooks section to send the latest submission's data (the form must have
been submitted at least once), or submit the form. Partial Submission webhooks only fire for a
partial response that has gone 30 minutes without an update.

## Plans

Webhooks are only available on specific pricing plans; check Paperform's pricing page.
