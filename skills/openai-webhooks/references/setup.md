# Setting Up OpenAI Webhooks

## Prerequisites

- An OpenAI API project
- A public URL for your webhook endpoint

## Register Your Endpoint

1. Open the project [webhook settings page](https://platform.openai.com/settings/project/webhooks) (Settings → Project → Webhooks)
2. Click **Create**
3. Configure three things:
   - **Name**: for your reference
   - **URL**: a public URL to your server (e.g., `https://api.example.com/webhooks/openai`)
   - **Event types**: one or more, for example:
     - Background responses: `response.completed`, `response.failed`, `response.cancelled`, `response.incomplete`
     - Batch: `batch.completed`, `batch.failed`, `batch.cancelled`, `batch.expired`
     - Fine-tuning: `fine_tuning.job.succeeded`, `fine_tuning.job.failed`, `fine_tuning.job.cancelled`
     - Evals: `eval.run.succeeded`, `eval.run.failed`, `eval.run.canceled` (one "l")
     - Realtime SIP calls: `realtime.call.incoming`
4. Save the signing secret shown after creation (format: `whsec_...`). You can't view it again.

The full list, including the Live API, safety and beta Agents API events, is in the [webhook events reference](https://developers.openai.com/api/reference/resources/webhooks).

Safety warning and deactivation notices (`safety.warning_issued`, `safety.deactivation_issued`) go to organization-level endpoints, created in the [organization webhook settings](https://platform.openai.com/settings/organization/webhooks).

## Testing Your Endpoint

- Trigger test events with sample data from the webhook settings page.
- Or produce a real event: create a response with `background: true` and wait for `response.completed`.

## Local Development

OpenAI needs a public URL. Its docs suggest ngrok or a cloud development environment. The Hookdeck CLI also works:

```bash
# Create tunnel to your local server
npx hookdeck-cli listen 3000 openai --path /webhooks/openai
```

## Delivery Behaviour

- **Response time**: return a 2xx within a few seconds, or the delivery is retried
- **Retries**: exponential backoff for up to 72 hours
- **Redirects**: 3xx responses aren't followed and count as failures; register the final URL
- **Duplicates**: rare but possible; dedupe on the `webhook-id` header

## Rotating the Secret

If you lose or expose the signing secret, rotate it from the webhook settings page, then update `OPENAI_WEBHOOK_SECRET` everywhere you verify.

## Webhook Security

1. **Always verify signatures** - Verification is optional on OpenAI's side, but without it anyone can POST to your endpoint
2. **Use environment variables** - Store the signing secret as `OPENAI_WEBHOOK_SECRET`
3. **Timestamp validation** - OpenAI's SDK `unwrap()` rejects timestamps more than 5 minutes from your clock by default; do the same in a hand-written verifier
4. **Return quickly** - Process events asynchronously
5. **Idempotency** - Use the `webhook-id` header to handle duplicate events
