# vivenu Webhook Events

Receive vivenu transaction, checkout and ticket events.

## Events and Payloads

The example scenarios cover `transaction.complete`, `checkout.completed`, `ticket.created`. Use the documented discriminator described below.

Read type from the {mode, id, type, data} envelope. id identifies the transmission, and mode distinguishes dev and prod. Signing is optional at the sender; enable hmacKey for these verified examples.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return success within the documented ten-second timeout. Failed deliveries can be retried and can arrive out of order; deduplicate on id.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://docs.vivenu.com/api/core/webhooks)
- [Verification](https://docs.vivenu.com/api/core/webhooks#security)
