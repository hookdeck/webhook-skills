# Verify Ryft Webhook Signatures

## Signed Bytes

Header: `signature`. Format: a bare hex digest over the raw body. The digest is HMAC-SHA256, encoded as hexadecimal. Use the complete secret as UTF-8 bytes without hex or base64 decoding.

Treat the entire header as one digest; do not split it or strip a prefix.

The message consists of the original body bytes only. Do not re-serialise JSON or include extra headers.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Receiver Sequence

Express uses `express.raw({ type: '*/*' })`, Next.js reads `request.arrayBuffer()`, and FastAPI reads `request.body()`. Run verification before decoding JSON. Accept only exactly 64 hexadecimal characters per candidate. Node uses `crypto.timingSafeEqual` after checking buffer lengths; Python uses `hmac.compare_digest` on bytes. Hexadecimal case is ignored, matching core.

Missing, malformed or mismatched signatures return 401. Correctly signed invalid JSON or a non-object body returns 400. A missing server secret returns 500. These statuses describe the example receivers, not Hookdeck ingress responses.

## Troubleshooting

Confirm the secret belongs to this endpoint and environment. Capture the raw bytes before any JSON middleware. Check the header spelling and encoding; never log the secret. An authentic payload can still have unexpected field types, so the handlers guard nested values before dispatch.

Read eventType from the envelope; data contains the affected resource. Verify the generic Signature header as a bare hex digest. The guide names HMAC-SHA256; Ryft's .NET SDK supplies the hex encoding detail. Its ASCII secret encoding agrees with UTF-8 for the supplied ASCII secrets.

## Official Documentation

- [Webhooks](https://developer.ryftpay.com/documentation/get_started/webhooks)
- [Verification](https://developer.ryftpay.com/documentation/get_started/webhooks#webhook-authorization)
- [Sdk](https://github.com/RyftPay/ryft-dotnet/blob/master/RyftDotNet/test/RyftDotNet.Tests/Utility/Webhooks/WebhookSignatureVerifierTest.cs)

## Published Test Vector

All three example suites include the [vendor's published vector](https://github.com/RyftPay/ryft-dotnet/blob/master/RyftDotNet/test/RyftDotNet.Tests/Utility/Webhooks/WebhookSignatureVerifierTest.cs) in `published-vector.json`, checked directly against the verifier. The body is the exact string `{"amount": 500, "currency": "GBP"}`, the test key is `abcdef4455`, and the expected header is `12443c521a6900579d09b1b29cf17b679f7745eb32a8018e46f44bb27103f865`. The tests also change a body byte and assert rejection.
