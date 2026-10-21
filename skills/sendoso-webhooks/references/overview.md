# Sendoso Webhooks Overview

## What Are Sendoso Webhooks?

Sendoso sends physical gifts, eGifts and direct mail. Each send moves through statuses in the Sendoso **send tracker**: initiated, fulfilling, shipped, delivered, and for eGifts sent, opened and redeemed. Sendoso webhooks push each status change to your endpoint in real time, so you don't have to poll the Sends API.

Sendoso delivers webhooks through [Svix](https://www.svix.com). You manage endpoints, event subscriptions, secrets, test sends and replays in a Svix-powered **webhooks portal** that's linked from Sendoso's integrations page. Every request is a `POST` with a JSON body and `svix-id`, `svix-timestamp` and `svix-signature` headers (see [verification.md](verification.md)).

Webhooks are **opt-in**. Sendoso support (developers@sendoso.com) has to enable them for your organization first (see [setup.md](setup.md)).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `send.delivered` | The send has been delivered to the recipient | Trigger a sales follow-up, update the CRM |
| `send.shipped` | The send is in transit to the recipient | Notify the sender, log tracking |
| `send.redeemed` | The eGift has been redeemed by the recipient | Mark the touch converted, attribute pipeline |
| `send.opened` | The eGift has been opened by the recipient | Engagement scoring, timely outreach |
| `send.undeliverable` | The send can't be delivered to the recipient | Fix the address, alert the sender |
| `send.bounced` | The send can't be redeemed and will be refunded | Clean the contact record, reconcile budget |
| `send.failed` | The send has failed | Alert, retry with a new send |
| `send.confirming_address` | The send is waiting for the recipient to confirm their address | Nudge the recipient |

## All Event Types

The full list from Sendoso's [Events page](https://developer.sendoso.com/webhooks/events). You subscribe to these per endpoint in the webhooks portal. An endpoint with no event types selected receives **all** of them.

| Event | Triggered when |
|-------|----------------|
| `send.amazon_fulfilling` | The Amazon send is being processed |
| `send.amazon_shipped` | The send has shipped from Amazon and is in transit to Sendoso |
| `send.blocked` | A request to redeem the send has been blocked |
| `send.bounced` | The send can't be redeemed and will be refunded |
| `send.canceled` | The sender canceled the send |
| `send.clicked` | The recipient viewed the eGift send |
| `send.confirmation_canceled` | The sender canceled address confirmation for the send |
| `send.confirming_address` | The send is waiting for the recipient to confirm their address |
| `send.delivered` | The send has been delivered to the recipient |
| `send.email_blacklist` | A request to redeem the send has been blacklisted |
| `send.expired` | The link to redeem the send has expired |
| `send.failed` | The send has failed |
| `send.fulfilling` | Sendoso is processing the send |
| `send.fulfillment_issue` | There's a fulfillment-side issue with the send |
| `send.initiated` | The send is being created |
| `send.insufficient_funds` | The send can't be processed due to insufficient funds |
| `send.invalid_email_format` | The recipient email isn't a valid email |
| `send.opened` | The recipient opened the eGift send |
| `send.order_received` | The send order was received and is being processed |
| `send.out_of_stock` | The product for the send is out of stock |
| `send.pending_approval` | The send is waiting for approval by the sender |
| `send.pending_sendoso_approval` | The send is waiting for approval by a Sendoso admin |
| `send.redeemed` | The recipient redeemed the eGift send |
| `send.refunded` | The send has been refunded |
| `send.sent` | The eGift send has been sent to the recipient |
| `send.shipped` | The send is in transit to the recipient |
| `send.suspicious_email` | The recipient email was flagged as suspicious |
| `send.undeliverable` | The send can't be delivered to the recipient |

Note the spellings: `canceled` uses one "l", and words are joined with underscores (`send.out_of_stock`, not `send.out-of-stock`).

## Event Payload Structure

Sendoso documents one schema for every event type:

```json
{
  "send_gid": "<string>",
  "status_changed_at": "<string>"
}
```

| Field | Description |
|-------|-------------|
| `send_gid` | The gid of the send. It matches `send_gid` in the [Retrieve All Sends](https://developer.sendoso.com/rest-api/reference/sends/get-sends) response |
| `status_changed_at` | When the send's status changed (ISO 8601) |

### Which status did the send change to?

The documented payload **doesn't name the event type**, and Svix doesn't send it in a header. You have these options:

1. **One endpoint per concern.** Subscribe an endpoint only to the events it handles. For example, `https://app.example.com/webhooks/sendoso` subscribed to `send.delivered` and `send.redeemed` knows every delivery means "the gift landed".
2. **Look the send up.** Call Retrieve All Sends and match on `send_gid`. The response includes the current `status` and the `status_updates` history.
3. **Check a real message.** In the portal, open a delivered message to see the exact payload your account receives before you rely on any field that isn't documented.

Whichever you choose, use `status_changed_at` to ignore updates older than the state you've already stored. Retries and manual replays can arrive out of order.

## Delivery Behaviour

| Behaviour | Detail |
|-----------|--------|
| Success | Any `2xx` response. Sendoso treats a `2xx` as delivered even if your body says it failed |
| Timeout | **15 seconds**. Slower responses count as failures |
| Retries | Exponential backoff after a failed attempt: immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h |
| Auto-disable | If all attempts to an endpoint fail for **5 days**, the endpoint is disabled. Re-enable it with **Enable Endpoint** in the portal |
| Manual replay | Resend one message, **Recover Failed Messages** for a time window, or **Replay all failed messages since this time** |
| Guarantee | At least once. Dedupe on the `svix-id` header, which stays the same across retries of one message |

## Full Event Reference

- [Introduction](https://developer.sendoso.com/webhooks/introduction)
- [Events](https://developer.sendoso.com/webhooks/events)
- [Endpoints](https://developer.sendoso.com/webhooks/endpoints)
- [Security](https://developer.sendoso.com/webhooks/security)
- [Retries](https://developer.sendoso.com/webhooks/retries)
- [Troubleshooting](https://developer.sendoso.com/webhooks/troubleshooting)
