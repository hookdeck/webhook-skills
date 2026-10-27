# Verify GitBook Webhook Signatures

## Signed Bytes

Header: `x-gitbook-signature`. Format: `t=<Unix seconds>,v1=<hex>` over `timestamp + "." + raw body`. The digest is HMAC-SHA256, encoded as hexadecimal. Use the complete secret as UTF-8 bytes without hex or base64 decoding.

The verifier requires one numeric `t` and accepts any matching `v1` digest. Other versions are ignored. The original timestamp text is signed unchanged.

Build the message as a buffer containing the exact t text, a literal dot, and the original body bytes. Do not normalise the timestamp or re-serialise JSON.

Set `GITBOOK_WEBHOOK_TOLERANCE_SECONDS` to a positive number to enforce an application age limit in seconds. Unset or `0` disables it. Old timestamps remain valid by default so Hookdeck retries and replays can retain the original headers.

## Receiver Sequence

Express uses `express.raw({ type: '*/*' })`, Next.js reads `request.arrayBuffer()`, and FastAPI reads `request.body()`. Run verification before decoding JSON. Accept only exactly 64 hexadecimal characters per candidate. Node uses `crypto.timingSafeEqual` after checking buffer lengths; Python uses `hmac.compare_digest` on bytes. Hexadecimal case is ignored, matching core.

Missing, malformed or mismatched signatures return 401. Correctly signed invalid JSON or a non-object body returns 400. A missing server secret returns 500. These statuses describe the example receivers, not Hookdeck ingress responses.

## Troubleshooting

Confirm the secret belongs to this endpoint and environment. Capture the raw bytes before any JSON middleware. Check the header spelling and encoding; never log the secret. An authentic payload can still have unexpected field types, so the handlers guard nested values before dispatch.

Dispatch on type: space_content_updated is a space event; page_feedback and site_view are site events. The envelope includes eventId and installationId.

## Official Documentation

- [Webhooks](https://gitbook.com/docs/developers/integrations/guides/webhook)
- [Verification](https://gitbook.com/docs/developers/integrations/guides/webhook#hmac-signature-verification)
