# Setting Up Mailgun Webhooks

## Prerequisites

- A Mailgun account ([free signup](https://signup.mailgun.com))
- A verified sending domain (or use the sandbox domain for testing)
- A publicly reachable HTTPS URL for your webhook endpoint (use [Hookdeck CLI](https://hookdeck.com/docs/cli) or another tunnel for local development)

## Step 1: Get Your Webhook Signing Key

The signing key is **separate** from your Mailgun API key. There is one signing key per account, and it signs **both** account-level and domain-level webhooks.

1. Log in to the [Mailgun Control Panel](https://app.mailgun.com).
2. Navigate to **Sending → API Keys** (or **Settings → API Security** depending on UI version).
3. Find the **HTTP webhook signing key**.
4. Copy it and store it in your environment:

```bash
MAILGUN_WEBHOOK_SIGNING_KEY=your-webhook-signing-key-here
```

> The signing key looks like a long random hex string. Do **not** confuse it with your **Private API key** (used for API requests) or **SMTP credentials**.

## Step 2: Choose Account-Level or Domain-Level

Mailgun lets you receive webhooks two ways:

### Account-Level Webhooks

Receive events for **all** sending domains on the account at one endpoint.

1. Navigate to **Sending → Webhooks** at the **account level** (not inside a specific domain).
2. Click **Add webhook**.
3. Select an event type (you add one webhook per event type).
4. Enter your endpoint URL: `https://yourapp.com/webhooks/mailgun`.
5. Save.

### Domain-Level Webhooks

Receive events for **one** specific sending domain.

1. Navigate to **Sending → Domains** and select a domain.
2. Click the **Webhooks** tab for that domain.
3. Click **Add webhook**.
4. Select an event type and enter the endpoint URL.
5. Save.

Both deliver the **same payload format** and use the **same signing key**. Your handler code does not change based on which level you configure.

## Step 3: Select Event Types

Mailgun creates one webhook per event type. The available events are:

- `accepted` — Message accepted for delivery
- `rejected` — Message rejected before sending
- `delivered` — Message delivered to recipient's mail server
- `permanent_fail` — Hard bounce (also surfaces as `failed` with `severity: permanent` in payloads)
- `temporary_fail` — Soft bounce (also surfaces as `failed` with `severity: temporary`)
- `opened` — Recipient opened the message
- `clicked` — Recipient clicked a tracked link
- `unsubscribed` — Recipient unsubscribed
- `complained` — Recipient marked as spam

For a new integration, start with: `delivered`, `permanent_fail`, `complained`, `unsubscribed`. Add `opened` and `clicked` if you need engagement tracking.

## Step 4: Test Your Webhook

In the webhook configuration UI, Mailgun provides a **Test webhook** button that sends a sample payload to your endpoint. Use it to confirm:

- Your endpoint is publicly reachable
- Your signature verification passes
- Your handler responds with HTTP `200` within 30 seconds

> Mailgun's test payload uses a deterministic test token and timestamp. The signature is computed normally — your verification must pass.

## Step 5: Enable Open and Click Tracking (Optional)

For `opened` and `clicked` events to fire, tracking must be enabled on the sending domain:

1. Go to **Sending → Domains → [your domain] → Domain Settings**.
2. Under **Tracking Settings**, enable **Open tracking** and/or **Click tracking**.

Tracking can also be toggled per-message via the `o:tracking-opens` / `o:tracking-clicks` API parameters.

## Local Development

Mailgun cannot deliver webhooks to `localhost`. Use a tunnel:

```bash
# Forward Mailgun webhooks to your local server (no account required)
npx hookdeck-cli listen 3000 mailgun --path /webhooks/mailgun
```

The CLI prints a public URL — paste it as the endpoint when creating the webhook in the Mailgun dashboard.

## Retry Behavior

If your endpoint returns a non-2xx status, Mailgun retries with an exponential backoff schedule over roughly 8 hours, then gives up. To handle this gracefully:

- Return `200` quickly (within 30 seconds) once the signature is verified
- Process the event asynchronously (queue it) if work could be slow
- Use the `signature.token` field as an idempotency key — it is unique per webhook delivery

## Subaccounts

If you use Mailgun subaccounts and forward webhooks to a parent-account endpoint, payloads include both `signature` (subaccount key) and `parent-signature` (parent key). Verify `parent-signature` using the parent account's HTTP Webhook Signing Key.

## Useful Links

- [Mailgun Control Panel](https://app.mailgun.com)
- [Webhooks documentation](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks)
- [Securing webhooks](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks)
- [Events reference](https://documentation.mailgun.com/docs/mailgun/user-manual/events/events)
