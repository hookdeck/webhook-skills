# Roblox Webhooks Overview

## What Are Roblox Webhook Notifications?

Roblox webhook notifications are HTTP POSTs that Roblox sends when something happens in an experience you own: a player asks for their data to be erased, someone buys or cancels a subscription, a commerce order is paid or refunded, a transaction is refunded, an experiment shows early harm, or an analytics alert fires. You configure them per experience in the Creator Hub under **Configurations** → **Webhooks** (also at https://create.roblox.com/settings/webhooks).

Source: [Webhook notifications](https://create.roblox.com/docs/cloud/webhooks/webhook-notifications).

What they're **not**:

- **Open Cloud REST APIs** (`apis.roblox.com`, `x-api-key`, OAuth 2.0). Those are calls you make to Roblox. The right-to-erasure flow uses both: the webhook arrives, then your worker calls the Data Stores API with an API key. The API key and the webhook secret are different credentials.
- **Discord or Slack incoming webhooks.** Roblox "fully supports webhook notifications for Discord and Slack", which means pointing the Roblox webhook URL at a Discord or Slack incoming-webhook URL. In that case the signature travels in the message footer (see [verification.md](verification.md)).
- **`HttpService`, Studio plugins or engine events** (`RBXScriptSignal`). None of these are webhooks.

## Which EventType Values Are Documented?

Roblox lists its triggers by their **dashboard label**. The value that arrives in `EventType` is a separate thing, and Roblox has published it for only three:

| `EventType` | Source in Roblox's docs | `EventPayload` fields |
|---|---|---|
| `RightToErasureRequest` | [Webhook notifications: payload schema](https://create.roblox.com/docs/cloud/webhooks/webhook-notifications#payload-schema) | `UserId` (number), `GameIds` (array of numbers: start place IDs) |
| `SampleNotification` | [Webhook notifications: test webhooks](https://create.roblox.com/docs/cloud/webhooks/webhook-notifications#test-webhooks) | `UserId` (number): the user who clicked **Test Response** |
| `AnalyticsAlert` | [Analytics alerts: webhook delivery](https://create.roblox.com/docs/production/analytics/alerts#webhook-delivery) | `TargetType` (e.g. `"Universe"`), `TargetId` (a **string**), `AlertMessage` (a JSON **string** with `summary`, `metric`, `universe_id`, `evaluation_time_utc`, `alert_history`) |

`AnalyticsAlert` is configured from **Configurations** → **Alerts** (choose the webhook as the alert's delivery channel), not from the webhook's trigger list. `AlertMessage.summary` contains "fired" when the alert triggers and "recovered" when the metric returns to normal.

## Which Triggers Have No Published EventType?

These triggers are documented, but **their `EventType` strings are not published**. Find them by logging `EventType` from a real delivery, then add a case for each. Don't hard-code a guessed string.

| Group | Trigger (dashboard label) | What Roblox says the notification contains |
|---|---|---|
| Subscription | Subscription Resubscribed | The subscription and subscriber |
| Subscription | Subscription Renewed | The subscription and subscriber |
| Subscription | Subscription Refunded | The subscription and subscriber |
| Subscription | Subscription Purchased | The subscription and subscriber |
| Subscription | Subscription Cancelled | The subscription and subscriber, plus the reason given for the cancellation |
| Commerce | Commerce Product Order Refunded | The user got a refund for a commerce product order, or the order was cancelled |
| Commerce | Commerce Product Order Paid | The user paid for a commerce product order. "Duplicate webhook events are possible, so you should deduplicate events using the unique commerce order ID." |
| Refunds | Transaction Refunded | See below |
| Experiments | Early Harm Detection | The experiment, the harming metric and its lift (critical harm in the first 24 hours) |

Subscription field details live in the Open Cloud [Subscription reference](https://create.roblox.com/docs/cloud/reference/Subscription).

### Transaction Refunded

Covers developer products, passes, private servers and paid access. It doesn't cover subscriptions. Roblox describes the `EventPayload` in prose without field names. It includes:

- The buyer's user ID
- The product type and product ID
- The Robux amount: the product's original price, not what the buyer paid
- The universe and place where the purchase was made
- The transaction or receipt ID
- The time of the refund

When a pass or avatar item is refunded through Roblox Customer Service, Roblox revokes ownership itself. **Developer product benefits exist only in your code**, so you have to remove the granted currency or boosts from the player's save data yourself when this notification arrives.

## Event Payload Structure

Every notification shares one envelope with **PascalCase** keys. There's no `id`/`type`/`data` triple:

```json
{
  "NotificationId": "string",
  "EventType": "RightToErasureRequest",
  "EventTime": "2023-12-30T16:24:24.2118874Z",
  "EventPayload": {
    "UserId": 1,
    "GameIds": [1234, 2345]
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `NotificationId` | string | "A unique identifier for each notification sent. If the same `NotificationId` is received twice, it is considered a duplicate." Your idempotency key. |
| `EventType` | string | The event that triggered the notification. Route on it. |
| `EventTime` | string | When the event was triggered: ISO-8601 UTC with 7 fractional digits. That's more precision than JavaScript `Date` (milliseconds) or Python `datetime` (microseconds) holds, so trim it before parsing. |
| `EventPayload` | object | Event-specific. Structure varies by `EventType`. |

User, place and universe IDs are JSON **numbers**. They're often above 2^31 but stay well below 2^53, so JavaScript numbers hold them exactly. Store them as 64-bit integers.

## How Should the Handler Route Events?

```javascript
switch (notification.EventType) {
  case 'RightToErasureRequest': /* enqueue erasure */ break;
  case 'SampleNotification':    /* log */ break;
  case 'AnalyticsAlert':        /* JSON.parse(EventPayload.AlertMessage) */ break;
  default:
    // Subscription, Commerce, Transaction Refunded, Early Harm Detection:
    // wire names unpublished. Log EventType and return 2xx.
}
```

The default branch must **return 2xx**. If it threw, the first subscription notification would fail 5 times and Roblox would stop using the URL.

## How Do I Handle Right to Erasure Requests?

A `RightToErasureRequest` means a user has exercised their right to have their personal data deleted (GDPR, CCPA, LGPD, PIPA). If you store PII such as user IDs, you need to act on it. See Roblox's [RTBF and creators](https://create.roblox.com/docs/production/publishing/RTBF-and-creators).

1. **Verify** the `roblox-signature` and dedupe on `NotificationId`.
2. **Enqueue** an erasure job with `UserId` and `GameIds`, then return 2xx. Don't do the deletion inside the 5-second response budget.
3. **Delete** in a worker. `GameIds` are **start place IDs**. Roblox's [automation guide](https://create.roblox.com/docs/cloud/webhooks/automate-right-to-erasure) maps each start place ID to its universe ID and data store entries, then calls the Open Cloud Data Stores API:
   ```
   DELETE https://apis.roblox.com/datastores/v1/universes/{universeId}/standard-datastores/datastore/entries/entry
          ?datastoreName=...&scope=...&entryKey=...
   x-api-key: <Open Cloud API key with the data stores "Delete Entry" permission>
   ```
   Ordered data stores use `DELETE https://apis.roblox.com/ordered-data-stores/v1/universes/{universeId}/orderedDatastores/{name}/scopes/{scope}/entries/{key}` and need the ordered data stores **Write** permission.
4. **Record** completion (user, games, time, result) for your compliance log, and alert on failures.

For data stores, Roblox's [RTBF deletion templates](https://create.roblox.com/docs/cloud-services/data-stores/right-to-be-forgotten) can delete matching entries automatically with no hosted code. The webhook is for data that lives elsewhere (your own database, analytics, logs) or schemas the templates don't support.

## What Are the Delivery Rules?

Quoted from Roblox's docs. Your endpoint:

- "must be publicly accessible for handling requests"
- "can handle POST requests"
- "can respond to the request with a 2XX response within 5 seconds"
- "can handle HTTPS requests"

**Retries:** "Roblox retries sending the message to the configured URL 5 times using a fixed window size. If the notification still fails to be delivered after 5 attempts, Roblox stops trying to send the notification and assumes that the URL is no longer valid." You then have to update the webhook configuration with a reachable URL. Roblox doesn't publish a backoff schedule or per-attempt timeout.

**Limits:** "Currently, you can configure up to 5 webhooks in total." For group-owned games, "only group owners can configure and receive webhook notifications."

Roblox documents no source-IP allowlist and no handshake or URL-validation request.

## Full Event Reference

- [Webhook notifications](https://create.roblox.com/docs/cloud/webhooks/webhook-notifications)
- [Analytics alerts](https://create.roblox.com/docs/production/analytics/alerts)
- [Automate right to erasure requests](https://create.roblox.com/docs/cloud/webhooks/automate-right-to-erasure)
- [Subscription reference](https://create.roblox.com/docs/cloud/reference/Subscription)
