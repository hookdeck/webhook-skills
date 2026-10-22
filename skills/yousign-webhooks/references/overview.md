# Yousign Webhooks Overview

## What Are Yousign Webhooks?

Yousign (docs now at developers.youtrust.com) sends an HTTP `POST` with a JSON body to your HTTPS endpoint whenever a subscribed event occurs, so you don't have to poll the API. Webhooks cover eSignature, eSeal and Document Verification. You choose the events and the environment (sandbox or production) per webhook subscription.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `signature_request.activated` | Signature request went from `draft` to `ongoing` | Mark a contract as sent |
| `signature_request.done` | All required signers have signed | Download the signed document, mark contract executed |
| `signature_request.declined` | A signer declined the signature request | Notify the owner, restart the flow |
| `signer.done` | A signer has signed | Track per-signer progress |
| `signer.declined` | A signer declined; the reason is in the payload | Capture the decline reason |

Other events exist (for example `signature_request.expired`, `signature_request.canceled`, `signer.link_opened`, `approver.approved`, `electronic_seal.done`, `verification.identity_document.done`, `workflow_session.done`).

## Event Payload Structure

```json
{
  "event_id": "b6c63685-c556-4a30-8fe9-b6f2b187d936",
  "event_name": "signature_request.activated",
  "event_time": "1670855889",
  "subscription_id": "webhook-subscription-id",
  "subscription_description": "My webhook for signed documents",
  "sandbox": false,
  "data": {
    "signature_request": { "id": "xxx-xxx", "status": "approval" }
  }
}
```

- `event_id` is globally unique: use it to deduplicate retries.
- `event_time` is a Unix timestamp that stays constant across retries.
- `sandbox` is `true` for sandbox events.
- `data` varies per event; see the API reference.

## Delivery Behavior

- Return a 2xx within **1 second**, otherwise the delivery is a failure and is retried (retries may take up to 10 seconds).
- `X-Yousign-Retry` carries the retry count (`0` on first delivery).
- HTTPS is required; self-signed certificates and private networks are not supported.

## Full Event Reference

See [Yousign's webhook documentation](https://developers.youtrust.com/docs/webhooks).
