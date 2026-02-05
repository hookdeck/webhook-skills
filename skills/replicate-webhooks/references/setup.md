# Setting Up Replicate Webhooks

## Prerequisites

- Replicate account with API access
- Your application's webhook endpoint URL
- API token from Replicate dashboard

## Get Your Webhook Signing Secret

When you configure webhooks, Replicate will provide a signing secret in the format:

```
whsec_base64encodedkey
```

Store this secret securely in your environment variables - you'll need it to verify webhook signatures.

## Register Your Webhook Endpoint

Webhooks are configured per prediction when you create them via the API:

```javascript
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const prediction = await replicate.run(
  "stability-ai/stable-diffusion:...",
  {
    input: {
      prompt: "a painting of a sunset"
    },
    webhook: "https://your-app.com/webhooks/replicate",
    webhook_events_filter: ["start", "output", "logs", "completed"]
  }
);
```

## Webhook Configuration Options

- **webhook**: Your endpoint URL (HTTPS required for production)
- **webhook_events_filter**: Array of events to receive
  - `start` - When prediction begins
  - `output` - When output is generated
  - `logs` - When logs are produced
  - `completed` - When prediction finishes (success/fail/cancel)

## Adding Custom Metadata

You can pass custom data via query parameters:

```javascript
webhook: "https://your-app.com/webhooks/replicate?userId=123&jobId=456"
```

## Local Development with Hookdeck CLI

For local testing, use the Hookdeck CLI instead of ngrok:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Create a tunnel to your local server
hookdeck listen 3000 --path /webhooks/replicate
```

This provides:
- A public URL for your webhook endpoint
- Request inspection in the web UI
- Automatic retries and error handling
- No account required for basic usage

Example with custom source name:
```bash
hookdeck listen 3000 \
  --path /webhooks/replicate \
  --source replicate-webhooks
```

## Test Your Webhook

Create a test prediction with your webhook URL:

```javascript
const testPrediction = await replicate.run(
  "stability-ai/stable-diffusion:...",
  {
    input: {
      prompt: "test image"
    },
    webhook: "https://your-hookdeck-url.hookdeck.com",
    webhook_events_filter: ["completed"]
  }
);
```

You should receive a webhook notification when the prediction completes.

## Production Considerations

1. **Use HTTPS**: Required for production webhooks
2. **Verify signatures**: Always verify the webhook signature
3. **Handle retries**: Replicate may retry failed webhook deliveries
4. **Process async**: Handle webhooks quickly and process heavy work asynchronously
5. **Monitor failures**: Log and monitor webhook processing errors