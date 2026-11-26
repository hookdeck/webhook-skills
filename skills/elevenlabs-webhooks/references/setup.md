# Setting Up ElevenLabs Webhooks

## Prerequisites

- ElevenLabs account with workspace admin access
- Your application's webhook endpoint URL
- HTTPS endpoint (required for production)

## Create the Webhook and Get Your Signing Secret

1. In the ElevenLabs dashboard, go to [**Developers** > **Webhooks**](https://elevenlabs.io/app/developers/webhooks) and click **Create webhook**
2. Enter a **Name** and your HTTPS **Callback URL** (e.g., `https://yourdomain.com/webhooks/elevenlabs`)
3. Choose **HMAC** as the **Webhook Auth Method**
4. Under **Select events to listen to**, tick the workspace events you want (Voice Library removal notices, **Transcription completed**, **Image & Video API generation or template run completed**)
5. Create the webhook and store the shared secret it generates in `ELEVENLABS_WEBHOOK_SECRET`

Only workspace admins, or members with the Webhooks Manage permission, can create webhooks. With the API, `POST /v1/workspace/webhooks` with `auth_type: "hmac"` returns `webhook_secret`.

## Subscribe Products to the Webhook

- **Post-call events**: open the ElevenAgents [settings page](https://elevenlabs.io/app/agents/settings), choose the webhook as the post-call webhook, and select the events (`transcript`, `audio`, `call_initiation_failure`). Override it per agent under the agent's **Settings** > **Post-call webhooks**.
- **Speech to text**: pass `webhook=true` on each `speech_to_text.convert` request.
- **Image & Video and templates**: pass a `webhook` target (`{"type": "all"}` or a list of IDs) on each create request.
- **Alerts**: add the webhook as a notifier under **Developers** > **Alerts** > **Alerts settings** > **Configure notifications**.

## Test Your Webhook

Call [Send Test Webhook Event](https://elevenlabs.io/docs/api-reference/webhooks/test) with a `webhook_type` such as `post_call_transcription`. Test events are signed like real ones and never retried. To resend a stored delivery, use [Redeliver Webhook Delivery](https://elevenlabs.io/docs/api-reference/webhooks/redeliver); it keeps the delivery ID and adds an `ElevenLabs-Webhook-Redelivery` header.

## Managing Webhooks

- **Retries**: off by default; enable them per webhook in its settings or with `retry_enabled` on Update Workspace Webhook
- **Disable**: temporarily stop deliveries from the general settings page
- **Delete**: only when no product uses the webhook
- **Custom headers**: set `request_headers` through the API or SDK; they are sent alongside `ElevenLabs-Signature`

## Security Best Practices

1. **Always verify signatures** - Never trust webhook payloads without verification
2. **Use HTTPS** - Required for production endpoints
3. **Store secrets securely** - Use environment variables, not hardcoded values
4. **Return 200 quickly** - Process webhooks asynchronously if needed
5. **Monitor failures** - Set up alerts for webhook processing errors

## Troubleshooting

**Webhook not receiving events:**
- Verify your endpoint is publicly accessible
- Check that you've selected the correct event types
- Ensure your endpoint returns HTTP 200 status
- Check whether the webhook was auto-disabled (10 or more consecutive failures with no success in the last 7 days) and re-enable it
- For speech to text and Image & Video, check the request opted in to webhook delivery

**Signature verification failing:**
- Confirm you're using the raw request body
- Check that you're parsing the header correctly
- Verify your secret matches exactly (no extra spaces)
- The SDKs reject timestamps older than 30 minutes, so keep your clock in sync