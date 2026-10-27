# Verify Medplum Webhook Signatures

## Signed Bytes

Header: `x-signature`. Format: a bare hex digest over the raw body. The digest is HMAC-SHA256, encoded as hexadecimal. Use the complete secret as UTF-8 bytes without hex or base64 decoding.

Treat the entire header as one digest; do not split it or strip a prefix.

The message consists of the original body bytes only. Do not re-serialise JSON or include extra headers.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Receiver Sequence

Express uses `express.raw({ type: '*/*' })`, Next.js reads `request.arrayBuffer()`, and FastAPI reads `request.body()`. Run verification before decoding JSON. Accept only exactly 64 hexadecimal characters per candidate. Node uses `crypto.timingSafeEqual` after checking buffer lengths; Python uses `hmac.compare_digest` on bytes. Hexadecimal case is ignored, matching core.

Missing, malformed or mismatched signatures return 401. Correctly signed invalid JSON or a non-object body returns 400. A missing server secret returns 500. These statuses describe the example receivers, not Hookdeck ingress responses.

## Troubleshooting

Confirm the secret belongs to this endpoint and environment. Capture the raw bytes before any JSON middleware. Check the header spelling and encoding; never log the secret. An authentic payload can still have unexpected field types, so the handlers guard nested values before dispatch.

The body is a FHIR resource; dispatch on resourceType. There is no create/update/delete discriminator. Delete notifications contain {}. X-Medplum-Deleted-Resource supplies the resource type/id, but is unsigned because the HMAC covers only the body. Reconcile it with application state before acting; these examples do not trust that header as an authenticated identifier.

## Official Documentation

- [Webhooks](https://www.medplum.com/docs/subscriptions)
- [Verification](https://www.medplum.com/docs/subscriptions/subscription-extensions#signatures)
- [Deletions](https://www.medplum.com/docs/subscriptions/subscription-extensions#subscriptions-for-delete-events)
