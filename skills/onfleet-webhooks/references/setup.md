# Setting Up Onfleet Webhooks

## Prerequisites

- An Onfleet account with administrator access to the dashboard
- A public HTTPS endpoint that handles **both** `GET` (validation) and `POST`
  (events), e.g. `https://example.com/webhooks/onfleet`
- Your handler running **before** you create the webhook, so it can answer the
  validation request

## Where Do I Find the Onfleet Webhook Secret?

In the Onfleet dashboard, go to **Configuration → API & Webhook** and click
**Show Secret** ([Onfleet docs: Secrets](https://docs.onfleet.com/reference/secrets)).

- There is **one secret for the whole organisation**. Every webhook you create
  is signed with it.
- It's a **hex string**. Your code must hex-decode it before using it as the
  HMAC key (see [verification.md](verification.md)).
- It's **separate from your API key**. The API key authenticates your calls to
  Onfleet; the webhook secret verifies Onfleet's calls to you.

```bash
ONFLEET_WEBHOOK_SECRET=your_hex_webhook_secret
```

## How Do I Create an Onfleet Webhook?

Each webhook covers **one trigger**. To receive `taskStarted`, `taskCompleted`
and `taskFailed`, create three webhooks. They can all point at the same URL;
route on `triggerName` / `triggerId` in your handler.

### Option 1: Dashboard

1. Go to **Configuration → API & Webhook**.
2. Add a webhook: enter a name, your URL and the trigger.
3. For triggers that need a threshold (below), enter it.
4. Save. Onfleet sends the validation request before it saves the webhook.

### Option 2: API

`POST https://onfleet.com/api/v2/webhooks`, authenticated with your **API key**
as the Basic Auth username and an empty password:

```bash
curl -X POST "https://onfleet.com/api/v2/webhooks" \
  -u "$ONFLEET_API_KEY:" \
  -d '{"url":"https://example.com/webhooks/onfleet","name":"Task completed","trigger":3}'
```

| Field | Required | Notes |
|---|---|---|
| `url` | Yes | Your endpoint |
| `name` | Yes | A label for the webhook |
| `trigger` | Yes | Numeric trigger ID (see [overview.md](overview.md)) |
| `threshold` | For triggers 1, 2, 12, 30 | See below |

### Thresholds

| Trigger | `threshold` means |
|---|---|
| 1 `taskEta` | Fire when the driver's ETA is at or below this many **seconds** |
| 2 `taskArrival` | Fire when the driver is at or within this many **meters** |
| 12 `taskDelayed` | Fire when the task delay is at or above this many **seconds** |
| 30 `predictedTaskDelay` | Fire when the predicted delay is at or above this many **seconds** |

Triggers 1, 2 and 12 are limited to 10 webhooks each. To get ETA alerts at
both 10 and 2 minutes, for example, create two `taskEta` webhooks with
thresholds `600` and `120`.

## The Validation Request

When you create a webhook (dashboard or API), Onfleet checks that you control
the URL:

```
GET https://example.com/webhooks/onfleet?check=<random_string>
```

Your endpoint must:

- respond with status **`200`**. A `204` is rejected, even though it's a success code.
- return the `check` value **as-is** as a plain-text body.
- respond within 10 seconds.
- **not** require a signature. This request isn't signed.

The string is different every time, so echo it rather than hard-coding it. If
validation fails, Onfleet doesn't create the webhook.

Common reasons validation fails:

| Symptom | Cause |
|---|---|
| Webhook won't save | Route only handles `POST`; add `GET` |
| Webhook won't save | Signature middleware also runs on `GET` and rejects it |
| Webhook won't save | Handler returns JSON (`{"check": "..."}`) or `204` instead of the plain string with `200` |
| Webhook won't save | Tunnel or server not running yet |

## Testing

1. Start your handler and a tunnel:

   ```bash
   npx hookdeck-cli listen 3000 onfleet --path /webhooks/onfleet
   ```

2. Create a webhook for a trigger you can fire easily, e.g. `taskCreated` (6),
   using the tunnel URL.
3. Create a task in the dashboard. (Tasks created by dashboard **import** don't
   fire `taskCreated`.)
4. Check your handler logs for the verified event.

You can list and delete webhooks with `GET /api/v2/webhooks` and
`DELETE /api/v2/webhooks/:id`.
