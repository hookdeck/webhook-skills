# GOV.UK Pay Webhook Events

Receive GOV.UK Pay card-payment updates.

## Events and Payloads

The example scenarios cover `card_payment_captured`, `card_payment_succeeded`, `card_payment_refunded`. Use the documented discriminator described below.

Read event_type from the body. webhook_message_id identifies the message. Verify Pay-Signature with the signing secret as UTF-8 bytes, preserving the body bytes exactly without adding a BOM.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return 2xx promptly. Messages may arrive more than once and out of order; deduplicate using webhook_message_id and reconcile payment state before applying updates.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://docs.payments.service.gov.uk/webhooks/)
- [Verification](https://docs.payments.service.gov.uk/webhooks/#verifying-webhook-messages-from-gov-uk-pay)
