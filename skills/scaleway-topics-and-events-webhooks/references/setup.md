# Setting Up Scaleway Topics and Events Webhooks

## Prerequisites

- A Scaleway account with Owner status or IAM permissions in the Organization
- A topic (Integration Services > Topics and Events > Topics) in `fr-par` or `nl-ams`
- An HTTPS endpoint that accepts `POST` (Scaleway allows plain HTTP but recommends HTTPS)

## Get the Trust Chain

There's no shared secret. Messages are signed with a certificate that chains to Scaleway's CA, so download the trust chain once and point `SCALEWAY_SNS_TRUST_CHAIN_PATH` at it:

```bash
curl -o sns-trust-chain.pem https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns-trust-chain.pem
# nl-ams: https://messaging.s3.fr-par.scw.cloud/nl-ams/sns/sns-trust-chain.pem (currently the same file)
```

Scaleway calls it "the long-term CA certificate, which is valid until 2032". The file holds two certificates: the root `Scaleway MnQ Root` (valid until June 2032) and an intermediate `Scaleway MnQ` (valid until 5 December 2027). Scaleway's docs don't mention the intermediate's expiry. Download the file again before December 2027, and if verification starts failing with "does not chain to the trust chain".

## Create the Subscription

In the console: **Topics and Events** > select the region > your topic > **Create Subscription** > protocol **HTTPS** (or HTTP) > enter the endpoint URL. "Note that the scheme (`https://`) is not required." With the examples in this skill the path is `/webhooks/scaleway-topics-and-events`.

With the AWS CLI configured for Scaleway:

```bash
aws sns subscribe --endpoint-url https://sns.mnq.fr-par.scaleway.com \
  --topic-arn "$TOPIC_ARN" --protocol https --notification-endpoint "https://example.com/webhooks/scaleway-topics-and-events"
```

## Confirm the Subscription

An HTTP/HTTPS subscription "will have a `Pending` status until you confirm it", and until then it receives nothing.

### Behind Hookdeck

1. In Hookdeck, create a source with the **Scaleway Topics and Events** source type, and connect it to your destination.
2. Subscribe the Hookdeck source URL to your topic.
3. When the `SubscriptionConfirmation` arrives, Hookdeck checks its `SubscribeURL` and GETs it. Your destination never sees the confirmation.
4. Refresh the subscription in the Scaleway console: it should show **Confirmed**.

If it's still `Pending`, look in Hookdeck's requests for a rejected request from Scaleway. Hookdeck rejects a confirmation (and answers Scaleway 500) when the `SubscribeURL` isn't `https://sns.mnq.<region>.scaleway.com/` with matching `TopicArn` and `Token`, or when Scaleway doesn't answer the GET with 200. The rejected request keeps its body, so you can copy the `SubscribeURL` from it and confirm by hand (below).

### Receiving Directly

The examples confirm automatically: they verify the signature, check that `TopicArn` is one of yours, validate `SubscribeURL` the same way Hookdeck does, and GET it.

### By Hand

Scaleway documents two manual ways:

- "make a request to the `SubscribeURL` using your browser or curl": `curl "$SUBSCRIBE_URL"`
- In the console, open the topic's subscriptions, click the more icon next to the subscription, choose **Confirm subscription**, and paste the `SubscribeURL`. The dialog says: "A subscription confirmation message has been sent to the subscription endpoint. Retrieve the SubscribeURL value from the message and enter it in the box below."

Scaleway's docs don't say whether the confirmation message is sent when the subscription is created or when you open that dialog. Either way, Hookdeck (or the examples) confirm it when it arrives.

## Pin Your Topics

Set `SCALEWAY_SNS_TOPIC_ARNS` to your topic ARNs. Anyone can create a Scaleway topic and subscribe your URL to it, and their messages carry valid Scaleway signatures too.

## Test

Publish a message:

```bash
aws sns publish --endpoint-url https://sns.mnq.fr-par.scaleway.com \
  --topic-arn "$TOPIC_ARN" --subject "order.created" --message '{"order_id":"ord_123"}'
```

For local development, tunnel to your machine (no account needed) and subscribe the URL it prints:

```bash
npx hookdeck-cli listen 3000 scaleway-topics-and-events --path /webhooks/scaleway-topics-and-events
```

## Delete the Subscription

Console: topic > **Subscriptions** tab > the subscription > **Delete subscription** (type `DELETE` to confirm). CLI: `aws sns unsubscribe --subscription-arn …`.
