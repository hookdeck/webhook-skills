# Root Webhook Events

Receive Root insurance policy, policyholder and claim events.

## Events and Payloads

The example scenarios cover `policyholder_created`, `policy_issued`, `claim_opened`. Use the documented discriminator described below.

Event deliveries carry event.type. Notification deliveries carry notification instead and may have no event type. Verify X-Hook-Signature-256; the older X-Hook-Signature uses deprecated SHA-1.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return 2xx within 30 seconds and keep handlers fast. Acknowledge notification payloads you do not process, and make event handling idempotent.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://docs.rootplatform.com/reference/webhooks)
- [Verification](https://docs.rootplatform.com/docs/webhook-setup-and-verification)
