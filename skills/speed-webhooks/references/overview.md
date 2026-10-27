# Speed Webhooks Overview

## What Are Speed Webhooks?

[Speed](https://www.tryspeed.com) is a Bitcoin and Lightning (and USDT on Ethereum and Tron) payments platform. When something happens in your account, Speed sends a JSON `POST` to each registered HTTPS endpoint that subscribed to that event type. Endpoints are registered in the dashboard (**Developers > Webhooks**) or with the webhooks API, and can subscribe to your own account or to your connected accounts.

Speed does not store the event data it sends, so capture and store what you need. You can also read events back with the Events API (Retrieve an event, List all events).

## Event Envelope

```json
{
  "id": "evt_xxxxxxxxxx",
  "object": "events",
  "api_version": "2022-10-15",
  "event_type": "payment.paid",
  "data": {
    "object": {
      "id": "pi_xxxxxxxxxx",
      "object": "payment",
      "amount": 5000,
      "currency": "SATS",
      "status": "paid"
    }
  },
  "livemode": false,
  "request": { "id": "xxxxxxxxxx" },
  "created": 1696847071760,
  "modified": 1696847071760
}
```

- `event_type` is the event name (`resource.event`). The top-level `object` is always `events`.
- `data.object` is the resource. Its shape depends on the event and on the endpoint's `api_version` (`2022-04-15` is the default; `2022-10-15` adds `payment_methods` and `payment_method_options` on payments).
- For Connect endpoints, events carry `data.account_id` plus application fee fields where relevant.
- `id` (`evt_…`) is the same on every retry; `webhook-id` is not.

## Event Types

Speed documents these 28 types and notes that more may be added, so acknowledge unknown types instead of failing.

| Group | Events |
|-------|--------|
| Payments | `payment.created`, `payment.paid`, `payment.confirmed`, `payment.expired`, `payment.cancelled` |
| Checkout sessions | `checkout_session.created`, `checkout_session.paid`, `checkout_session.payment_paid`, `checkout_session.deactivated` |
| Checkout links | `checkout_link.created`, `checkout_link.deactivated`, `checkout_link.paid` |
| Payment links | `payment_link.created`, `payment_link.deactivated`, `payment_link.paymentreceived` |
| Payment addresses | `payment_address.paymentreceived` |
| Payrequests | `payrequest.payment_paid` |
| Invoices | `invoice.paid` |
| Withdrawals | `withdraw.created`, `withdraw.paid`, `withdraw.failed` |
| Withdrawal links | `withdrawal_link.created`, `withdrawal_link.paid`, `withdrawal_link.deactivated` |
| Withdraw requests | `withdraw_request.created`, `withdraw_request.deactivated`, `withdraw_request.paid` |
| Connect | `connect.completed` |

## Delivery and Retries

- Reply `2xx` as soon as possible. A non-2xx reply or no reply is retried: immediately, 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, then 10 hours again, with some randomisation. If nothing succeeds within 5 days, the endpoint is deactivated.
- Each retry is re-signed with a new `webhook-id` and timestamp. Dedupe on the event `id`.
- Speed emails you before it deactivates an endpoint and does not retry events generated while an endpoint is deactivated. You can retry a message manually from the dashboard.

## Full Event Reference

[Types of events](https://apidocs.tryspeed.com/reference/types-of-events), [Handle a request](https://apidocs.tryspeed.com/reference/handle-a-request) and [Webhooks](https://apidocs.tryspeed.com/reference/webhooks) in Speed's API reference.
