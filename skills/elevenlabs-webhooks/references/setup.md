# Setting Up ElevenLabs Webhooks

## Prerequisites

- ElevenLabs account with workspace admin access
- Your application's webhook endpoint URL
- HTTPS endpoint (required for production)

## Get Your Signing Secret

1. Log in to your ElevenLabs account
2. Navigate to **Settings** → **General**
3. Scroll to the **Webhooks** section
4. If no webhook exists, add one first (see below)
5. Copy your **Webhook Signing Secret** - it will be displayed when you create or edit a webhook

## Register Your Endpoint

1. In the **Webhooks** section, click **Add Webhook**
2. Configure your webhook:
   - **URL**: Enter your webhook endpoint (e.g., `https://yourdomain.com/webhooks/elevenlabs`)
   - **Events**: Select the events you want to receive:
     - `post_call_transcription` - Recommended for call analysis
     - `post_call_audio` - For accessing call recordings
     - `call_initiation_failure` - For monitoring call failures
3. Click **Create Webhook**
4. **Important**: Copy the signing secret immediately - it won't be shown again

## Test Your Webhook

ElevenLabs doesn't provide a test button, but you can trigger real events:

1. For `post_call_transcription` or `post_call_audio`: Make a test call using the API
2. For `call_initiation_failure`: Attempt a call with invalid parameters

## Managing Webhooks

- **View Status**: Check webhook health in the dashboard
- **Update Events**: Edit webhook to add/remove event types
- **Disable**: Temporarily stop receiving events without deleting
- **Delete**: Permanently remove the webhook configuration

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
- Look for auto-disable after 10 consecutive failures

**Signature verification failing:**
- Confirm you're using the raw request body
- Check that you're parsing the header correctly
- Verify your secret matches exactly (no extra spaces)
- Ensure timestamp validation allows for network delay