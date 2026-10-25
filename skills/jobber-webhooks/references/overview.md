# Jobber Webhooks Overview

## What Are Jobber Webhooks?

Jobber (field service management) sends an `HTTP POST` to a URL you configure when an event occurs on an account that has connected your app, so you don't have to poll the API. Webhooks are configured per app in the [Jobber Developer Center](https://developer.getjobber.com/). To receive a topic, your app needs the read scope for that object (e.g. the client read scope for `CLIENT_CREATE`).

## Common Event Types

Topics follow the pattern `OBJECT_ACTION` and are values of `WebHookTopicEnum` in the GraphQL schema. The Developer Center lists every available topic when you add a webhook.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `CLIENT_CREATE` | A client is created | Sync new clients to a CRM |
| `INVOICE_UPDATE` | An invoice changes (payment applied, status change) | Reconcile payments, update accounting |
| `APP_CONNECT` | An account connects your app | Store the account link, start syncing |
| `APP_DISCONNECT` | An account disconnects your app | Revoke tokens, clean up (required for Marketplace apps) |

## Event Payload Structure

```json
{
  "data": {
    "webHookEvent": {
      "topic": "CLIENT_CREATE",
      "appId": "3ef22a50-072d-430c-a78f-b7646657560b",
      "accountId": "MQ==",
      "itemId": "MQ==",
      "occurredAt": "2026-07-16T16:31:31-06:00"
    }
  }
}
```

- `topic`: the event (dispatch on this)
- `accountId`: the Jobber account it happened on
- `itemId`: the affected object. The payload has no object data, so query the GraphQL API with this ID
- `occurredAt`: ISO 8601 time. Apps created before December 8, 2023 receive the misspelled `occuredAt`
- Apps created before April 11, 2022 receive `application/x-www-form-urlencoded` instead of `application/json`

## Delivery Behavior

- Respond within **1 second**; process in a background job. Consistently slow or failing endpoints may have webhooks disabled by Jobber.
- **At-least-once** delivery: the same webhook can arrive more than once.
- One user action can fire the same topic several times about a second apart (e.g. adding a payment fires `INVOICE_UPDATE` twice). Dedupe on `itemId` + `topic` in a short window, or make processing idempotent.
- The Developer Center does not alert you to failing endpoints, so monitor them yourself.

## Full Event Reference

See [Jobber's webhook documentation](https://developer.getjobber.com/docs/using_jobbers_api/setting_up_webhooks/).
