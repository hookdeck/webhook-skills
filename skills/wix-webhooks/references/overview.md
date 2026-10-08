# Wix Webhooks Overview

## What Are Wix Webhooks?

Webhooks let your Wix app react to real-time events on the sites where it's installed — instead of polling the Wix APIs, Wix sends your server an HTTP `POST` when something happens (an order is created, your app is installed, a contact is updated, and so on).

This skill covers **self-hosted / self-managed apps** that receive webhooks on their own server. (If you build with the Wix CLI or Blocks, you handle events with [event extensions](https://dev.wix.com/docs/build-apps/develop-your-app/extensions/backend-extensions/events/about-event-extensions.md) or Velo instead, and Wix handles the payload for you.)

Each webhook request body is a **signed JSON Web Token (JWT)**, so you can verify it genuinely came from Wix using your app's public key. See [verification.md](verification.md).

## Common Event Types

Event type strings follow the pattern `wix.<product>.<version>.<entity>_<action>`. You subscribe to each event individually on the **Webhooks** page of your app dashboard.

| Event Type | Triggered When | Common Use Cases |
|------------|----------------|------------------|
| `wix.ecom.v1.order_created` | A new eCommerce order is created | Fulfilment, notifications, analytics |
| `wix.ecom.v1.order_approved` | An order is approved (payment authorized) | Trigger fulfilment, grant access |
| `wix.ecom.v1.order_updated` | An order is updated | Sync order changes to your system |
| `wix.ecom.v1.order_canceled` | An order is canceled | Reverse fulfilment, refunds, revoke access |
| `wix.ecom.v1.order_payment_status_updated` | An order's payment status changes | Reconcile payments |
| `wix.ecom.v1.order_fulfilled` | An order is marked fulfilled | Send shipping confirmation |
| `AppInstalled` | Your app is installed on a site | Onboarding, provisioning |
| `AppRemoved` | Your app is removed from a site | Cleanup, cancel subscriptions |

The eCommerce order events above are exposed by the `@wix/ecom` SDK module as `onOrderCreated`, `onOrderApproved`, `onOrderUpdated`, `onOrderCanceled`, `onOrderPaymentStatusUpdated`, and `onOrderFulfilled`. App instance events (`AppInstalled`, `AppRemoved`) are built into `@wix/sdk` as `client.webhooks.apps.AppInstalled` / `AppRemoved`.

## Event Payload Structure

The request body is a JWT. Once verified and decoded, the structure is nested (each `data` is a JSON **string** that must be parsed):

```
JWT payload (outer)
├── data        → JSON string, parse to get the event envelope:
│   ├── eventType    e.g. "wix.ecom.v1.order_created"
│   ├── instanceId   your app's instance ID for the site
│   └── data     → JSON string, parse to get the inner event payload:
│       ├── id            unique event ID (use for deduplication)
│       ├── entityFqdn    e.g. "wix.ecom.v1.order"
│       ├── slug          e.g. "created"
│       ├── entityId      the affected entity's ID
│       ├── eventTime     ISO timestamp
│       └── createdEvent / updatedEvent / deletedEvent / actionEvent
│                         holds the entity (or changed fields)
├── iat         issued-at (Unix seconds)
└── exp         expiry (Unix seconds)
```

Every verified webhook always includes:

- **`instanceId`** — identifies the site (app instance) where the event occurred.
- **`eventType`** — a description of the event, e.g. `wix.ecom.v1.order_canceled`. It sits on the **middle** envelope only. The inner payload has no `eventType`; it names the same event as `entityFqdn` + `slug` (`wix.ecom.v1.order` + `canceled`), which is the form Wix's reference pages and example payloads use. Verified against the live `wix.ecom.v1` order reference pages, 2026-10-08.

The rest of the data depends on the event.

### SDK-decoded shape

When you use `@wix/sdk`, the SDK verifies the JWT and hands your registered handler a flattened event:

```js
client.orders.onOrderCreated((event) => {
  event.metadata.instanceId; // site / app instance
  event.metadata._id;        // unique event ID (dedupe key)
  event.metadata.entityId;   // the order ID
  event.entity;              // the created order entity
});
```

> **Note:** Webhooks don't always return the full entity. Some **legacy** webhooks (e.g. Wix Stores "Product Changed") return only the fields that changed. When that happens, make a GET request to the related entity endpoint to fetch the full object.

## Full Event Reference

Wix documents each webhook alongside its related API method. Browse the [Wix API Reference](https://dev.wix.com/docs/api-reference) — the sidebar lists events under each API. See also [About Webhooks](https://dev.wix.com/docs/build-apps/develop-your-app/api-integrations/events-and-webhooks/about-webhooks) and [Webhook Structure](https://dev.wix.com/docs/rest/articles/getting-started/webhook-structure).
