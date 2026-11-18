# Authorize.net Webhooks Overview

## What Authorize.net Sends

A JSON `POST` to each active webhook subscribed to the event, with the hash in `X-ANET-Signature`.

## Payload

| Field | Meaning |
|---|---|
| `notificationId` | Unique ID of this notification. Dedupe on it |
| `eventType` | For example `net.authorize.payment.authcapture.created` |
| `eventDate` | When the event happened (UTC) |
| `webhookId` | The webhook that matched |
| `payload` | A summary: `entityName` (`transaction`, `customerProfile`, `customerPaymentProfile`, `subscription`, ...) and `id`, plus a few event-specific fields |

Payment events add `responseCode`, `authCode`, `avsResponse`, `authAmount` and `merchantReferenceId`. Fetch the full record from the API (for example `getTransactionDetails`) when you need it.

## Event Types

- **Payments:** `net.authorize.payment.authorization.created`, `authcapture.created`, `capture.created`, `refund.created`, `priorAuthCapture.created`, `void.created`
- **Fraud:** `net.authorize.payment.fraud.held`, `fraud.approved`, `fraud.declined`
- **Customer profiles:** `net.authorize.customer.created`, `updated`, `deleted` (deleting a profile deletes its sub-profiles without separate notifications)
- **Payment profiles:** `net.authorize.customer.paymentProfile.created`, `updated`, `deleted`
- **Subscriptions:** `net.authorize.customer.subscription.created`, `updated`, `suspended`, `terminated`, `cancelled`, `expiring`, `expired`, `failed`
- **Partner boarding:** `net.authorize.partner.boarding.*`

## Retries

From the docs: if a delivery fails, Authorize.net retries up to 10 times until it gets **HTTP 200**: three times at three-minute intervals, three times at eight-hour intervals, then four times at 48-hour intervals. If every attempt fails, the webhook is set to **inactive** and stops receiving notifications until you reactivate it.

Return `200` quickly and process asynchronously. `GET /rest/v1/notifications?deliveryStatus=Failed` lists failed notifications with their retry logs.
