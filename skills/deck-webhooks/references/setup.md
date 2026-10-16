# Setting Up Deck Webhooks

## Prerequisites

- A Deck account and an API key (`sk_live_...`) for `https://api.deck.co/v2`, or access to the Deck Console
- A publicly reachable HTTPS endpoint (for local development, use a Hookdeck CLI tunnel; see below)

## Step 1: Generate Your Signing Secret

Deck **does not generate** a signing secret. `webhook.secret` is documented as *"Optional and caller-provided. Supply your own if you want to verify signatures."* Generate one in the Standard Webhooks format, `whsec_` followed by base64 of random bytes:

```bash
# Node.js
node -e "console.log('whsec_' + require('crypto').randomBytes(32).toString('base64'))"

# Python
python3 -c "import base64, os; print('whsec_' + base64.b64encode(os.urandom(32)).decode())"
```

Deck's docs don't specify a required key length. 24–32 random bytes is the Standard Webhooks convention.

Put the value in your secret store and in `DECK_WEBHOOK_SECRET` **before** you create the destination. Deck stores it write-only, and it **can't be retrieved after creation**.

## Step 2: Create the Webhook Destination

```bash
curl -X POST https://api.deck.co/v2/event-destinations \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Webhook",
    "type": "webhook",
    "webhook": {
      "url": "https://your-app.com/webhooks/deck",
      "secret": "whsec_..."
    },
    "events": ["credential.verified", "task_run.completed", "task_run.failed"]
  }'
```

| Field | Required | Notes |
|-------|----------|-------|
| `webhook.url` | Yes | Absolute URL. HTTP is accepted, but use HTTPS in production |
| `webhook.secret` | No | Your `whsec_` secret. **Omit it and you can't verify signatures** |
| `webhook.custom_headers` | No | A **JSON-encoded string** of extra headers sent on every request, e.g. `"{\"X-Env\":\"prod\"}"` |
| `events` | Yes | Event types to subscribe to, or `["*"]` for everything |

You can also create destinations in the Deck Console.

**Created a destination without a secret?** Deliveries to it can't be verified. Either create a new destination with a secret and delete the old one, or set a secret on the existing one. The OpenAPI spec's `PATCH /v2/event-destinations/{id}` request accepts a write-only `webhook.secret`, and `webhook.url` is required in that object:

```bash
curl -X PATCH https://api.deck.co/v2/event-destinations/{destination_id} \
  -H "Authorization: Bearer sk_live_..." -H "Content-Type: application/json" \
  -d '{"webhook": {"url": "https://your-app.com/webhooks/deck", "secret": "whsec_..."}}'
```

Don't loosen your handler to accept unsigned requests.

## Step 3: Get the Destination Activated

New destinations start in **`pending_verification`**, which means Deck is waiting for a successful response from your endpoint. When it gets one, the destination moves to **`active`** and Deck fires `event_destination.activated`.

Deck doesn't document the verification request's body or headers, and there's **no documented challenge or echo**. Make sure the endpoint is deployed, reachable, and returns a `2xx` for valid deliveries. If a destination stays in `pending_verification`, check that the URL resolves, TLS is valid, the route path matches, and the handler isn't returning `4xx`/`5xx` (for example because `DECK_WEBHOOK_SECRET` is missing on the server).

| Status | Meaning |
|--------|---------|
| `pending_verification` | Waiting for a successful response from your endpoint |
| `active` | Receiving deliveries |
| `inactive` | Disabled. `PATCH /v2/event-destinations/{id}` with `{"status": "active"}` resumes it |

## Step 4: Send a Test Event

Once the destination is `active`, click **Send test ping** on it in the Console, or:

```bash
curl -X POST https://api.deck.co/v2/event-destinations/{destination_id}/test \
  -H "Authorization: Bearer sk_live_..."
```

```json
{ "status": "success", "event_id": "evt_a1b2c3d4", "response_code": 200 }
```

`status` is `success`, `failure`, or `pending` if the attempt hasn't resolved yet. The event's type is `test.ping` and its `data` is `{"ok": true}`. It's sent once and never retried. A destination still in `pending_verification` can't receive test events (the API returns `422`).

## No Receiver Yet? Use a Test Endpoint

In the Console create flow, choose **Test endpoint** instead of entering a URL. Deck provisions a disposable [Hookdeck Console](https://console.hookdeck.com) URL, and an **Inspect deliveries** button opens the delivered payloads in your browser. Over the API, such destinations show a read-only `test_endpoint.inspect_url`. Anyone with that link can read the deliveries, so send test data only.

## Local Development

Deck's docs recommend Hookdeck for local testing. Run the CLI via `npx` (no install or account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 deck --path /webhooks/deck

# FastAPI
npx hookdeck-cli listen 8000 deck --path /webhooks/deck
```

Use the printed URL as `webhook.url` in Step 2.

## Alternative: Native Hookdeck Destination

Deck has a first-class `hookdeck` destination type that sends events into the Hookdeck Event Gateway. Routing, filtering, transformations and delivery settings are then managed in the Hookdeck dashboard:

```json
{
  "type": "hookdeck",
  "hookdeck": { "token": "<HOOKDECK_SOURCE_TOKEN>" },
  "events": ["*"]
}
```

This type authenticates with the Hookdeck source token rather than a Standard Webhooks `whsec_` secret. The rest of this skill covers the `webhook` type.

## Rotating the Signing Secret

When you rotate the signing secret, Deck **keeps the previous secret valid for 24 hours**. To roll over without downtime:

1. Move the current value to `DECK_WEBHOOK_SECRET_PREVIOUS` and put the new value in `DECK_WEBHOOK_SECRET`. The example handlers try the current secret first, then the previous one.
2. Rotate the secret in Deck.
3. Remove `DECK_WEBHOOK_SECRET_PREVIOUS` after 24 hours.

Deck's prose docs describe the 24-hour rollover window but don't say which API call or Console action starts it. The OpenAPI spec's update request (`PATCH /v2/event-destinations/{id}`) accepts a write-only `webhook.secret`, but the docs don't say that this call triggers the 24-hour overlap. Until you've confirmed it, keep both secrets configured and check the [deliveries list](#maintenance-and-monitoring) for failures after rotating.

## Static IP Addresses (Optional)

Webhook deliveries come from fixed IPs. If your endpoint is behind a firewall, allowlist them. **This is defence in depth. Always verify signatures as well.**

- Current: `34.139.110.242`, `35.237.129.153`, `34.24.255.163`
- Previous set, which may still be used until the **October 28, 2026** cutover: `136.107.35.242`, `34.86.136.110`, `136.107.63.48`

Allowlist both sets until the cutover, then remove the old ones. Static IPs apply to webhook destinations only.

## Maintenance and Monitoring

- **Planned downtime:** set the destination to `inactive` and back to `active` afterwards.
- **Failed deliveries:** `GET /v2/event-destinations/{id}/event-deliveries?status=failure`. A delivery is marked `failure` once all retries (up to 10, exponential backoff from 30s) are exhausted. Persistent failures **don't** auto-disable a destination.
