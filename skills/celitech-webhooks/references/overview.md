# Celitech Webhooks Overview

## What Are Celitech Webhooks?

Celitech is a B2B eSIM connectivity API. Its webhooks notify you of data-usage
thresholds on a purchase and of eSIM lifecycle changes on the end user's device
(downloaded, installed, enabled, disabled, deleted). They replace polling the API.

Webhooks are enabled per account by Celitech on request. Delivery runs on
[Svix](https://www.svix.com/), so every request carries `svix-id`, `svix-timestamp`,
and `svix-signature` headers (see [verification.md](verification.md)). Only public
HTTPS endpoints are supported.

## What Event Types Does Celitech Send?

| Event | Triggered When |
|-------|----------------|
| `consumption.threshold.reached` | A purchase's data usage reaches a notification threshold |
| `esim.downloaded` | The eSIM profile is downloaded to the device |
| `esim.installed` | The eSIM profile is installed on the device |
| `esim.enabled` | The eSIM is enabled on the device |
| `esim.disabled` | The eSIM is disabled on the device |
| `esim.deleted` | The eSIM is deleted from the device |

Celitech documents these six; the list may not be exhaustive, so keep a default branch
that logs and acknowledges unknown types.

## What Does a Celitech Webhook Payload Look Like?

The body is flat: a top-level `type` and the event's fields, with no `data` wrapper.

```json
// consumption.threshold.reached
{
  "type": "consumption.threshold.reached",
  "purchaseId": "4973fa15-6979-4daa-9cf3-672620df819c",
  "dataLimitInGB": 5,
  "dataUsageRemainingInGB": 0.2,
  "actualPercentage": 80.03,
  "notificationPercentage": 80
}

// esim.downloaded / installed / enabled / disabled / deleted
{ "type": "esim.installed", "iccid": "1111222233334444555000" }
```

The five `esim.*` events carry only `type` and `iccid`. Celitech publishes no whole
example body: the values above are the per-field examples in its OpenAPI schemas
(`x-webhooks` in https://api.celitech.com/swagger.yaml). `notificationPercentage` is
`50` or `80`, and each threshold fires at most once per purchase.

## How Does Celitech Retry Failed Deliveries?

A delivery fails if your endpoint doesn't return `2xx` within about 15 seconds. It is
then retried with an increasing delay over several hours, after which the endpoint may
be disabled. Delivery is at least once: deduplicate on the `svix-id` header. Example
events sent from the dashboard are not retried.

## Full Event Reference

- [Webhooks overview](https://docs.celitech.com/webhooks/overview)
- [Webhook security](https://docs.celitech.com/webhooks/security)
