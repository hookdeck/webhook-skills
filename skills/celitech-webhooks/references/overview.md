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
  "purchaseId": "3f6c1c2e-0000-4000-8000-000000000001",
  "dataLimitInGB": 5,
  "dataUsageRemainingInGB": 1,
  "actualPercentage": 80,
  "notificationPercentage": 80
}

// esim.downloaded / installed / enabled / disabled / deleted
{ "type": "esim.installed", "iccid": "8910300000000000001" }
```

The five `esim.*` events carry only `type` and `iccid`. The JSON above uses illustrative
values; field names come from Celitech's webhook schemas.

## How Does Celitech Retry Failed Deliveries?

A delivery fails if your endpoint doesn't return `2xx` within about 15 seconds. It is
then retried with an increasing delay over several hours, after which the endpoint may
be disabled. Delivery is at least once: deduplicate on the `svix-id` header. Example
events sent from the dashboard are not retried.

## Full Event Reference

- [Webhooks overview](https://docs.celitech.com/webhooks/overview)
- [Webhook security](https://docs.celitech.com/webhooks/security)
