# Preczn Webhook Events

Receive Preczn transaction and merchant notifications.

## Events and Payloads

The example scenarios cover `transaction.approved`, `transaction.declined`, `merchant.created`. Use the documented discriminator described below.

The envelope contains id, webhookId, eventType and data. Multiple comma-separated v1 signatures can be present during secret rotation; any matching v1 signature authenticates the request.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Respond with 2xx within five seconds. Preczn retries 5xx responses and transport failures up to three times, but does not retry 4xx. Deduplicate retries by id; dashboard resends have a new id, so also make the business operation idempotent.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://docs.preczn.com/docs/receiving-and-verifying-webhooks)
- [Verification](https://docs.preczn.com/docs/receiving-and-verifying-webhooks)
