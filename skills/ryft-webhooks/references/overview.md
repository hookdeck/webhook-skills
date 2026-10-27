# Ryft Webhook Events

Receive Ryft payment-session, payout and account notifications.

## Events and Payloads

The example scenarios cover `PaymentSession.captured`, `Payout.created`, `Account.updated`. Use the documented discriminator described below.

Read eventType from the envelope; data contains the affected resource. Verify the generic Signature header as a bare hex digest. The guide names HMAC-SHA256; Ryft's .NET SDK supplies the hex encoding detail. Its ASCII secret encoding agrees with UTF-8 for the supplied ASCII secrets.

The tests use a minimal, illustrative payload with the routing fields. It is not a captured delivery or a complete schema; consult the event documentation before reading additional fields.

## Delivery and Processing

Return 200 within 1.5 seconds. Ryft documents six attempts, separated by delays of 0, 1, 5, 10, 10 and 10 minutes. Queue durable work before acknowledging.

The examples verify the signature, parse an object, then log only the event label. Add durable queueing and application-specific processing before returning success. Validate nested fields before using them, and acknowledge unrecognised events you intentionally ignore.

## Official Documentation

- [Webhooks](https://developer.ryftpay.com/documentation/get_started/webhooks)
- [Verification](https://developer.ryftpay.com/documentation/get_started/webhooks#webhook-authorization)
- [Sdk](https://github.com/RyftPay/ryft-dotnet/blob/master/RyftDotNet/test/RyftDotNet.Tests/Utility/Webhooks/WebhookSignatureVerifierTest.cs)
