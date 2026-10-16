# Setting Up Fanvue Webhooks

## Prerequisites

- A Fanvue account and an app in the [Developer Area](https://api.fanvue.com/docs/get-started/build-your-first-app)
- A public HTTPS endpoint that answers `POST` (for local development, a tunnel such as the Hookdeck CLI)
- The scope each event needs, added on the app's **Authentication** tab or in `oauth.scopes` of your App Manifest

| Family | Scope |
|---|---|
| Creator (`creator.*`) | `read:creator` (`read:experience` for `creator.experience_subscription.*`) |
| Checkout (`checkout_link.*`, `payout.*`) | `read:creator` |
| App (`app.*`) | `read:self` |
| Legacy flat events | `read:creator`, except `message.received` and `message.read`, which need `read:chat` |

## Three Ways to Register an Endpoint

An endpoint receives an event only when a destination exists for the topic **and**
the consenting token holds the topic's scope.

| Path | Registers for | Signing secret | Sends the probe? |
|---|---|---|---|
| Developer Area → your app → **Events** | Your app as a whole | One per app, from **View signing secret** | No |
| `webhooks.destinations` in `app-manifest.json` | Your app as a whole | The same per-app secret | No |
| `POST /webhooks/subscriptions` | One creator, via their access token | One per subscription, `signingSecret`, returned once | Yes |

Whichever you use, make sure the endpoint answers the
[verification probe](verification.md#the-unsigned-verification-probe) and checks
signatures before you register it.

### 1. Developer Area Events tab

1. Open the Developer Area and select your app.
2. Open the **Events** tab and click **Add webhook**.
3. Enter your HTTPS endpoint URL (for example `https://your-app.com/webhooks/fanvue`) and tick the event types.
4. Click **View signing secret** and copy it into `FANVUE_WEBHOOK_SECRET`, exactly as shown.

Rules:

- **One destination per event type**, at most **20 destinations per app** (so at most 20 event types).
- **One signing secret per app**, shared by every endpoint on the app. **View signing secret** shows it any time.
- **`localhost` URLs are disabled** when the list loads. Use a public tunnel URL for local development.
- **No probe is sent.** A handler that rejects every unsigned request still registers here, then fails later if you move to the API path.
- An event whose scope your app lacks shows a missing-permissions warning and is not delivered. Creators who authorised your app before you added a scope must authorise it again.
- `payout.paid` and `payout.failed` are not in the picker; subscribe to them through the manifest or the API.
- Checkout events appear in the picker only for accounts with checkout links enabled.
- **History** on a row shows recent delivery attempts. A destination auto-disabled after repeated failures is re-enabled with the row's toggle.

### 2. App Manifest

Declare the same destinations in `app-manifest.json`:

```json
{
  "webhooks": {
    "destinations": [
      { "topic": "creator.payment.succeeded", "url": "https://your-app.com/webhooks/fanvue" },
      { "topic": "creator.subscription.activated", "url": "https://your-app.com/webhooks/fanvue" }
    ]
  }
}
```

Rules:

- URLs must be public `https://`. Loopback, private and credentialed URLs fail validation.
- Two destinations with the same topic fail validation.
- While the manifest sets `webhooks`, the Events tab lists only the manifest's rows, read-only.
- Deliveries are signed with the same per-app secret as the Events tab (**View signing secret**).
- Reserved topics (`creator.payment.pending`, `creator.payment.failed`, `checkout_link.refund.rejected`, `checkout_link.refund.failed`, `app.subscription.deactivated`) and the legacy names `message.reaction`, `post.like` and `post.comment` validate but **never deliver**.

### 3. API: POST /webhooks/subscriptions

Creates a destination on behalf of the creator whose access token you send:

```bash
curl -X POST https://api.fanvue.com/webhooks/subscriptions \
  -H "Authorization: Bearer <creator access token>" \
  -H "X-Fanvue-API-Version: 2025-06-26" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/fanvue",
    "events": ["creator.payment.succeeded", "creator.subscription.activated"]
  }'
```

```json
{
  "id": "b6f0e6d2-1f0a-4f1e-9b3a-1c2d3e4f5a6b",
  "signingSecret": "whsec_3b1f8a0c2d4e6f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f708"
}
```

Rules:

- **Probe first.** Fanvue POSTs an unsigned `{"type":"fanvue.webhook.verification", ...}` body to the URL. Any `2xx` passes; any other status, a redirect, or no answer within 8 seconds fails the subscribe call.
- **`signingSecret` is returned exactly once** (`whsec_` + 64 hex characters). No endpoint reads it back. If you lose it, `DELETE /webhooks/subscriptions/{id}` and create a new subscription.
- Every subscribe call mints a new destination with its own secret, even for the same URL and creator. Store a secret per subscription id.
- `events` holds 1 to 50 event names. The token needs `read:self` plus the scope of every requested event (`403` otherwise).
- At most 20 subscriptions per creator and client.
- `app.*` events are not available through the API.
- There is no enable or edit endpoint. List with `GET /webhooks/subscriptions`, then delete and recreate. An auto-disabled API subscription sends no notification and `GET` shows no enabled flag, so watch for silence yourself.

Zapier uses this API path on the creator's behalf and verifies signatures itself.

## Testing

A test delivery carries a real signature, so a `200` proves the check end to end.

**Events tab:** open the row's actions menu and click **Test**. It is refused
until the **app owner** has authorised the app with the event's scope, with the
generic error "Re-authorize your app and grant the required scopes before testing
this webhook." To unlock it, sign in to your app with your own Fanvue account and
grant the scope.

**API:** `POST /webhooks/test` with `{ "event": "creator.follow.created" }`. It
is rate limited to 30 calls per minute, returns `404` when the client has no
active subscription for the event, and rejects the deprecated legacy events with
`400`.

Test payloads carry `TEST-` prefixed ids inside `data` and a random envelope `id`.
They also populate `purchaser.email` and `transaction_id` on payment events,
which production `creator.payment.*` deliveries set to `null`, so don't build on
those two fields.

## Local Development

```bash
# Start tunnel (no account needed)
npx hookdeck-cli listen 3000 fanvue --path /webhooks/fanvue
```

Register the printed public URL (the Events tab disables `localhost`), then send
a **Test** from the row.

## Full Documentation

- [Fanvue webhooks](https://api.fanvue.com/docs/webhooks)
- [Subscribe to webhooks](https://api.fanvue.com/docs/webhooks/subscribing)
- [Verify webhook signatures](https://api.fanvue.com/docs/webhooks/signature-verification)
