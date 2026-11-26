# Setting Up AWS SNS HTTP/HTTPS Webhooks

## Prerequisites

- An AWS account with permission to manage SNS (`sns:CreateTopic`,
  `sns:Subscribe`, `sns:ConfirmSubscription`).
- A **publicly reachable** endpoint URL. For local development use a tunnel
  (see "Local Development" below) — SNS must be able to reach your endpoint over
  the public internet.
- For **HTTPS** subscriptions, your endpoint must present a server certificate
  signed by a CA that AWS trusts. Self-signed certs are rejected for HTTPS
  subscriptions (use HTTP or a tunnel for local testing).

## 1. Create a Topic

Console: **SNS → Topics → Create topic** (Standard type). Or CLI:

```bash
aws sns create-topic --name MyTopic
# → returns TopicArn, e.g. arn:aws:sns:us-east-1:123456789012:MyTopic
```

## 2. Deploy Your Endpoint First

SNS sends the `SubscriptionConfirmation` message **immediately** when you
subscribe, and will not deliver notifications until you confirm. Your endpoint
must already be running and able to:

1. Read the `x-amz-sns-message-type` header.
2. Verify the message signature.
3. On `SubscriptionConfirmation`, GET the `SubscribeURL` to confirm.

See the [examples/](../) for complete handlers that do this.

## 3. Subscribe Your Endpoint

Console: open the topic → **Create subscription** → Protocol `HTTP` or `HTTPS` →
Endpoint = your URL (e.g. `https://your-app.com/webhooks/aws-sns`). Or CLI:

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:MyTopic \
  --protocol https \
  --notification-endpoint https://your-app.com/webhooks/aws-sns
```

SNS immediately POSTs a `SubscriptionConfirmation` to your endpoint.

## 4. Confirm the Subscription

Your handler confirms automatically by issuing a GET to the `SubscribeURL` from
the confirmation message. After confirmation the subscription's status changes
from *PendingConfirmation* to a real `SubscriptionArn`, and notifications begin.

You can confirm manually instead:

```bash
# The Token comes from the SubscriptionConfirmation message body
aws sns confirm-subscription \
  --topic-arn arn:aws:sns:us-east-1:123456789012:MyTopic \
  --token 2336412f37...
```

## 5. (Optional) Opt In to SignatureVersion 2 (SHA256)

New topics default to **SignatureVersion 1 (SHA1)**. To require the stronger
**SignatureVersion 2 (SHA256)** signatures on delivered messages:

```bash
aws sns set-topic-attributes \
  --topic-arn arn:aws:sns:us-east-1:123456789012:MyTopic \
  --attribute-name SignatureVersion \
  --attribute-value 2
```

Your handler should support **both** versions (select SHA1 vs SHA256 from the
`SignatureVersion` field). The example handlers and `sns-validator` already do.

## 6. (Optional) Configure Retries and a Dead-Letter Queue

- **Delivery policy** — customize retry counts/backoff per subscription
  (`aws sns set-subscription-attributes --attribute-name DeliveryPolicy`).
- **Dead-letter queue** — attach an SQS DLQ so messages that exhaust retries are
  not lost (`--attribute-name RedrivePolicy`).

## Restricting Trust

There is no signing secret to keep private, so anyone could POST a validly
*shaped* message. Defend by:

- **Validating the `TopicArn`** against an allowlist (`AWS_SNS_TOPIC_ARN`).
- **Verifying every signature** and enforcing that `SigningCertURL` is an
  `sns.<region>.amazonaws.com` HTTPS URL (`sns-validator` and the manual
  examples enforce this).

## Local Development

SNS must reach your endpoint over the public internet. To use the Hookdeck CLI,
first create a Hookdeck source with the **AWS SNS** source type named
`aws-sns`, then forward it:

```bash
npx hookdeck-cli listen 3000 aws-sns --path /webhooks/aws-sns
```

This gives you a public HTTPS URL to use as the subscription endpoint and a web
UI to inspect each request. Note SNS requires a CA-trusted cert for HTTPS
subscriptions — a tunnel that terminates TLS with a trusted cert satisfies this.
