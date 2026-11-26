# FedEx Webhooks Overview

## Advanced Integrated Visibility

AIV webhooks push tracking events for shipments tied to FedEx account numbers or to tracking numbers you subscribe through the API. Subscriptions need a US-based 9-digit FedEx account for billing, and FedEx charges a monthly fee based on the number of tracking numbers. One shipping account number can't be used in more than one AIV webhook.

## Destination URL Rules

From FedEx's [business rules](https://developer.fedex.com/api/en-us/catalog/shipment-visibility-webhook/docs/introduction/business-rules-and-best-practices.html):

- HTTPS, TLS 1.2 or higher
- Responds to `POST` requests and parses JSON payloads
- At most 200 characters
- Not an RFC 1918 address, not fedex.com or its subdomains, and no IP addresses (including localhost)

When you create the webhook, FedEx validates the URL. "If FedEx receives any response other than 200 (OK) or 202 (Accepted), then the validation… will be considered as failed."

## Payload

You pick a payload language and a tracking type: **Detailed Tracking Response** (the shipment's whole event history) or **Event-Specific Tracking Response**. Account-number subscriptions include secured (PII) data such as shipper and recipient details, signature or picture proof of delivery and GPS coordinates. Proof-of-delivery images can arrive in a later notification than the delivery event. Use the downloadable schema and the Tracking Reference Guide for field definitions and codes.

## Delivery and Retries

From [Monitoring Failures and Retry Mechanism](https://developer.fedex.com/api/en-us/catalog/shipment-visibility-webhook/docs/introduction/monitoring-failures-retry-mechanism.html):

- Anything other than `200` or `202` is a failure.
- FedEx retries each failed event 3 times within about 15 minutes. (The page describes both 5-minute intervals and a 1/2/4-minute schedule with jitter.)
- After that, the event goes to a missed-events queue for 7 days. To have FedEx resend missed events, start the retry process on the AIV webhook project.
