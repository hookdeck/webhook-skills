# Scaleway Topics and Events Webhooks - Express Example

Minimal example of receiving Scaleway Topics and Events (SNS-compatible) HTTP/S deliveries: signature verification against Scaleway's CA trust chain, subscription confirmation, and `Notification` handling.

## Prerequisites

- Node.js 18+
- A Scaleway topic in `fr-par` or `nl-ams`, and an HTTP/HTTPS subscription pointing at this server (or at a Hookdeck source)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Download Scaleway's CA trust chain. Its root is valid until 2032, but the intermediate CA in the same file expires on 5 December 2027, so download it again before then:
   ```bash
   curl -o sns-trust-chain.pem https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns-trust-chain.pem
   ```

3. Copy environment variables and set `SCALEWAY_SNS_TOPIC_ARNS` to your topic's ARN:
   ```bash
   cp .env.example .env
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000 (the route is `POST /webhooks/scaleway-topics-and-events`)

The handler reads the raw body with `express.raw({ type: '*/*' })`. Verification lives in `src/scaleway-sns.js`.

For every message the handler:

1. Parses the JSON envelope (400 if it isn't one). Content-Type is ignored.
2. Verifies `Signature` (SignatureVersion `1`, RSA-SHA1 over the SNS canonical string) with the certificate at `SigningCertURL`, after checking that the URL is https on an allowed host (no query string or fragment) and that the certificate chains to the trust chain. Failures return 401, including a certificate URL that answers 4xx; a network error or 5xx while downloading the certificate returns 503.
3. Rejects topics not in `SCALEWAY_SNS_TOPIC_ARNS` with 403. When it's unset, the app logs a warning at startup: it then accepts, and confirms subscriptions to, any topic.
4. Routes on the signed `Type`:
   - `SubscriptionConfirmation`: checks `SubscribeURL` (https, `sns.mnq.<region>.scaleway.com`, matching `TopicArn` and `Token`) and GETs it. 200 on success, 502 if Scaleway doesn't answer 200.
   - `Notification`: logs `MessageId`, `Subject` and whether `Message` is JSON. Deduplicate on `MessageId`.
   - `UnsubscribeConfirmation`: acknowledged.

Behind Hookdeck, the `SubscriptionConfirmation` never reaches this server: Hookdeck's Scaleway Topics and Events source confirms the subscription itself. Notifications arrive unchanged, so the same verification works.

## Test

```bash
npm test
```

The tests build a throwaway root, intermediate and signing certificate, sign envelopes with it, and never touch the network. They don't use a real Scaleway delivery.

To receive real messages locally:

```bash
npx hookdeck-cli listen 3000 scaleway-topics-and-events --path /webhooks/scaleway-topics-and-events
```

Subscribe the URL it prints to your topic (protocol HTTPS), then publish a message with the AWS CLI configured for Scaleway (see Scaleway's [Topics and Events AWS CLI guide](https://www.scaleway.com/en/docs/topics-and-events/api-cli/topics-events-aws-cli/)):

```bash
aws sns publish --endpoint-url https://sns.mnq.fr-par.scaleway.com \
  --topic-arn "$TOPIC_ARN" --message '{"hello":"world"}'
```
