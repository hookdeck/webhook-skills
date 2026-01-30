# Local Development with Hookdeck CLI

## Quick Start (No Account)

For basic local webhook testing, no account is needed:

```bash
# Install CLI
brew install hookdeck/hookdeck/hookdeck

# Start local tunnel
hookdeck listen 3000 --path /webhooks/stripe
```

This provides:
- Public URL for receiving webhooks
- Local tunnel to your development server
- Web UI for inspecting requests

## Event Gateway Listen (Account Required)

For Event Gateway features (source verification, routing, replay):

```bash
# Login first
hookdeck login

# Listen with a specific source
hookdeck eg listen 3000 stripe --path /webhooks/stripe
```

### Key Differences

| Feature | `hookdeck listen` | `hookdeck eg listen` |
|---------|-------------------|----------------------|
| Account Required | No | Yes |
| Source Verification | No | Yes |
| Event Replay | No | Yes |
| Connection Rules | No | Yes |
| Persistent History | No | Yes |

## Starting the CLI

### Basic Usage

```bash
# Forward to localhost:3000, path /webhooks
hookdeck listen 3000 --path /webhooks

# With specific source name
hookdeck eg listen 3000 stripe --path /webhooks/stripe

# Multiple destinations
hookdeck eg listen 3000 stripe shopify --path /webhooks
```

### CLI Output

When you start listening, you'll see:

```
Dashboard
👉 Inspect and replay events: https://dashboard.hookdeck.com/...

Sources
stripe          https://events.hookdeck.com/e/src_xxxxx

Connections
stripe → local-cli    forwarding to http://localhost:3000/webhooks/stripe

Listening for webhooks...
```

## Triggering Test Events

### From Provider Dashboard

1. Configure the Hookdeck URL in your provider's webhook settings
2. Use the provider's test webhook feature:
   - **Stripe**: Dashboard → Webhooks → Send test webhook
   - **Shopify**: Create test orders
   - **GitHub**: Repository Settings → Webhooks → Recent Deliveries → Redeliver

### From Stripe CLI

```bash
# Trigger Stripe test events directly
stripe trigger payment_intent.succeeded
```

### From Hookdeck Console

1. Go to your connection in the Dashboard
2. Click **Send test event**
3. Choose event type or paste custom payload

## Inspecting Requests

### Console Output

The CLI logs incoming requests:

```
[stripe] POST /webhooks/stripe 200 (45ms)
  Event: payment_intent.succeeded
  ID: evt_1234567890
```

### Web Dashboard

Click the Dashboard URL to:
- View all received events
- Inspect headers and payloads
- See response from your server
- Replay failed events

## Debugging Failed Requests

### Check CLI Output

```bash
[stripe] POST /webhooks/stripe 500 (123ms)
  Event: payment_intent.succeeded
  Error: Internal Server Error
```

### Check Your Server Logs

Make sure your handler is logging:

```javascript
app.post('/webhooks/stripe', async (req, res) => {
  console.log('Received webhook:', req.headers['x-hookdeck-event-id']);
  console.log('Event type:', JSON.parse(req.body).type);
  
  try {
    await processEvent(req);
    res.json({ received: true });
  } catch (err) {
    console.error('Processing failed:', err);
    res.status(500).send('Error');
  }
});
```

### Replay After Fixing

Once you've fixed the bug:

1. Go to Dashboard → Events
2. Find the failed event
3. Click **Retry**

## Environment Setup

Your development environment should have:

```bash
# .env.local
PORT=3000

# For Hookdeck signature verification
HOOKDECK_WEBHOOK_SECRET=your_secret_here

# Provider secrets (if doing double verification)
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## Common Issues

### "Connection refused"

Your local server isn't running:
```bash
# Start your server first
npm start

# Then start hookdeck listen
hookdeck listen 3000 --path /webhooks
```

### "502 Bad Gateway"

Your server crashed or returned invalid response:
- Check server logs for errors
- Ensure you return valid JSON or status code

### "Signature verification failed"

- Check you're using the correct Hookdeck webhook secret
- Ensure you're reading the raw body (not parsed JSON)

## Next Steps

After successful local development:
1. [04-iterate.md](04-iterate.md) - Debug and replay events

## Full Documentation

- [Hookdeck CLI Reference](https://hookdeck.com/docs/cli)
