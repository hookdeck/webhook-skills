---
name: medplum-webhooks
description: >
  Receive and verify Medplum webhooks. Use when configuring Medplum webhook
  endpoints, debugging x-signature signatures, or handling create, update, delete.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Medplum Webhooks

Receive signed Medplum FHIR Subscription notifications.

## When to Use This Skill

- Configure a receiver for Medplum webhook deliveries.
- Diagnose `x-signature` verification failures.
- Handle `create`, `update`, `delete`.

## Setup

Create an active FHIR Subscription with channel.type rest-hook, your channel.endpoint and the criteria you want. Add https://www.medplum.com/fhir/StructureDefinition/subscription-secret with valueString set to a strong secret, and configure the same value in the receiver.

Add a subscription-secret extension to the Medplum Subscription. Without it, deliveries are unsigned and fail verification.

Set `MEDPLUM_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`x-signature` contains a bare hex digest over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

After extracting the documented digest and constructing `message` as described in [verification](references/verification.md), the comparison is:

```javascript
const expected = crypto.createHmac('sha256', secret).update(message).digest();
if (digest.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(digest)) return false;
const received = Buffer.from(digest, 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

Complete handlers and tests: [Express](examples/express/), [Next.js](examples/nextjs/), [FastAPI](examples/fastapi/).

## Event Handling

The body is a FHIR resource; dispatch on resourceType. There is no create/update/delete discriminator. Delete notifications contain {}. X-Medplum-Deleted-Resource supplies the resource type/id, but is unsigned because the HMAC covers only the body. Reconcile it with application state before acting; these examples do not trust that header as an authenticated identifier.

Use the Subscription extensions to configure retry behaviour. Queue accepted work durably and keep clinical data out of logs. Signatures are optional at the sender, but these examples require signing to be enabled.

## Local Development

```bash
npx hookdeck-cli listen 3000 medplum --path /webhooks/medplum
```

Use port 8000 for FastAPI. The CLI provides a local tunnel and inspection UI; no account is required to start.

## Resources

- [Overview and event routing](references/overview.md)
- [Endpoint and secret setup](references/setup.md)
- [Verification and troubleshooting](references/verification.md)

## Recommended: webhook-handler-patterns

Use the patterns skill for [handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md), [idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md), [error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) and [retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md).

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks): another HMAC receiver.
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks): another HMAC receiver.
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks): another HMAC receiver.
- [gitbook-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/gitbook-webhooks): another HMAC receiver.
- [preczn-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/preczn-webhooks): another HMAC receiver.
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns): delivery and processing patterns.
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway): managed delivery and inspection.
