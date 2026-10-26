# Setting Up LearnUpon Webhooks

Only Webhooks v2.0 are supported. Ask LearnUpon support to turn them on.

## Prerequisites

- A LearnUpon portal with webhooks enabled by LearnUpon support (contact the support team to turn
  webhooks on for your portal)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 learnupon --path /webhooks/learnupon` locally)

## Get Your Secret

You choose the secret. When you configure the webhook in the portal, set a secret key; LearnUpon uses it
to sign every delivery.

1. Generate a long random value, e.g. `openssl rand -hex 32`.
2. Paste it into the secret field of the webhook configuration (watch for a trailing space).
3. Store the same value as an environment variable:

```bash
LEARNUPON_WEBHOOK_SECRET=your-webhook-secret
```

## Register Your Endpoint

Once support has enabled the feature, set up webhooks version 2.0 through your portal interface,
following the instructions for version 2.0 in the LearnUpon Knowledge Base (linked from the
[webhooks v2.0 guide](https://docs.learnupon.com/webhooks/v2/)). You will provide:

1. Your endpoint URL, e.g. `https://example.com/webhooks/learnupon` (LearnUpon recommends HTTPS).
2. The secret key from above.
3. The webhook types you want, e.g. `user_created`, `course_enrollment`, `course_completion`.

The exact screen layout is in the Knowledge Base; it may differ from this summary.

If you already consume v1 webhooks, LearnUpon recommends a separate endpoint for v2.0.

## Framework Notes

If your framework checks CSRF tokens on POST bodies (Rails, Django), exempt the webhook route.

## Test

Trigger an event in the portal (for example, enroll a test learner), or replay a signed request:

```bash
BODY='{"data":[{"eventCreated":"2023-12-14T19:41:35.463Z","user":{"userId":285900,"email":"bella.bell@yourdomain.com","username":null},"enrollmentId":18976600,"dueDate":null,"courseId":2712800,"wasRecertified":false}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LEARNUPON_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/learnupon \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Type: course_enrollment" \
  -H "X-Webhook-ID: test-1" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$BODY"
```
