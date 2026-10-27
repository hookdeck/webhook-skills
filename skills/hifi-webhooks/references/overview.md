# HIFI Webhook Events

Receive HIFI user, compliance and money-movement events.

## Events and Payloads

The example scenarios cover `ONRAMP.STATUS.COMPLETED`, `USER.CREATED`, `CRYPTO_TRANSFER.CREATED`. Use the documented discriminator described below.

The envelope contains id, eventType, eventCreatedAt and data. Use eventType for dispatch; data is the resource state. RESOURCE.CREATED and RESOURCE.STATUS.CREATED are distinct notifications.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return 2xx promptly. HIFI retries failed deliveries with exponential backoff for up to 10 attempts. Deliveries may arrive out of order; reconcile the resource state before applying a change.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://docs.hifi.com/v3/core/webhooks/overview)
- [Verification](https://docs.hifi.com/v3/core/webhooks/overview)
