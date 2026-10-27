# Verify Fingerprint Webhook Signatures

## Signed Bytes

Header: `fpjs-event-signature`. Format: `v1=<hex>` over the raw body. The digest is HMAC-SHA256, encoded as hexadecimal. Use the complete secret as UTF-8 bytes without hex or base64 decoding.

Split comma-separated entries, trim whitespace and try every `v1` digest. Ignore other versions. The examples also accept a bare digest for compatibility with core.

The message consists of the original body bytes only. Do not re-serialise JSON or include extra headers.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

Fingerprint documents `isValidWebhookSignature({ header, data, secret })` in `@fingerprint/node-sdk`. The inspected version 7.9.0 compares hex strings with `===`. These examples use manual verification to retain constant-time comparison, whitespace handling and case-insensitive hex matching.

## Receiver Sequence

Express uses `express.raw({ type: '*/*' })`, Next.js reads `request.arrayBuffer()`, and FastAPI reads `request.body()`. Run verification before decoding JSON. Accept only exactly 64 hexadecimal characters per candidate. Node uses `crypto.timingSafeEqual` after checking buffer lengths; Python uses `hmac.compare_digest` on bytes. Hexadecimal case is ignored, matching core.

Missing, malformed or mismatched signatures return 401. Correctly signed invalid JSON or a non-object body returns 400. A missing server secret returns 500. These statuses describe the example receivers, not Hookdeck ingress responses.

## Troubleshooting

Confirm the secret belongs to this endpoint and environment. Capture the raw bytes before any JSON middleware. Check the header spelling and encoding; never log the secret. An authentic payload can still have unexpected field types, so the handlers guard nested values before dispatch.

Each delivery is an identification result, with event_id and identification in the current format. There is no event-name discriminator. Older webhook formats differ. Accept any matching v1 digest and ignore other signature versions.

## Official Documentation

- [Webhooks](https://docs.fingerprint.com/docs/webhooks)
- [Verification](https://docs.fingerprint.com/docs/webhooks#webhook-signatures)
- [Sdk](https://github.com/fingerprintjs/node-sdk/blob/v7.9.0/src/webhook.ts)

## Published Test Vector

All three example suites include the [vendor's published vector](https://docs.fingerprint.com/docs/webhooks#webhook-signatures) in `published-vector.json`, checked directly against the verifier. The body is the exact string `payload`, the test key is `secret`, and the expected header is `v1=b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4`. The tests also change a body byte and assert rejection.
