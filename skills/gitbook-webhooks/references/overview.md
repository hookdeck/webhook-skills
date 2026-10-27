# GitBook Webhook Events

Receive GitBook content updates, page feedback and site views.

## Events and Payloads

The example scenarios cover `space_content_updated`, `page_feedback`, `site_view`. Use the documented discriminator described below.

Dispatch on type: space_content_updated is a space event; page_feedback and site_view are site events. The envelope includes eventId and installationId.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return a successful HTTP response promptly. Keep processing idempotent using eventId, and accommodate retries.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://gitbook.com/docs/developers/integrations/guides/webhook)
- [Verification](https://gitbook.com/docs/developers/integrations/guides/webhook#hmac-signature-verification)
