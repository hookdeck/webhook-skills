# UpPromote Webhook Events

Receive UpPromote referral, affiliate and payment notifications.

## Events and Payloads

The example scenarios cover `referral.new`, `affiliate.approved`, `payment.paid`. These topics are selected when registering a subscription; they are not fields in the body.

Payloads have no event-name discriminator. This example routes by its configured subscription topic, never an invented event field. The header is X-UpPromote-Signature; the Ruby sample's HTTP_X_SIGNATURE is inconsistent with the documented header.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return success for accepted deliveries. Keep business changes idempotent and retain the subscription topic with queued work.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://aff-api.uppromote.com/docs/v2/webhook-overview-1623756m0)
- [Verification](https://aff-api.uppromote.com/docs/v2/webhook-overview-1623756m0)
