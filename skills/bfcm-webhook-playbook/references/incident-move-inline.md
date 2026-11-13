# Move Inline Mid-Incident: No Event Gateway Yet

Use this when webhooks are failing right now, the provider sends straight to your endpoint, and you can change where the provider sends. This is a migration, not a standby. You put Hookdeck Event Gateway in front of the endpoint and point the provider at it, and from then on Event Gateway receives every webhook, queues it while the endpoint is down, and delivers at a rate you set.

If you can't change where the provider sends during the incident, use [emergency standby capture](incident-standby.md#no-event-gateway-yet-emergency-capture) instead.

## Move inline or capture on standby

| Situation | Use |
|-----------|-----|
| You can edit or recreate the provider's subscription, and you can deploy a handler change if needed | **Move inline** (this page) |
| The provider's webhook settings are owned by another team or locked behind a change freeze, so you can only add a second endpoint | [Emergency standby capture](incident-standby.md#no-event-gateway-yet-emergency-capture) |
| The handler can't be changed to accept deliveries from Event Gateway before the endpoint recovers (see [caveats](#caveats-before-you-point-the-provider-at-event-gateway)) | Emergency standby capture, then replay through a recovery lane |
| The provider has deleted or disabled your subscription | **Move inline**: you have to recreate the subscription anyway, so recreate it against the Event Gateway source URL |

Moving inline stops the loss from the moment the provider points at the new URL. Standby capture adds a second copy and keeps your direct subscription, so it needs the full recovery runbook afterwards. Both leave the webhooks that failed before the change out of Event Gateway.

## Variables used below

```sh
export HOOKDECK_API_KEY=...
export API=https://api.hookdeck.com/2026-09-01
export T0=2026-11-27T14:05:00Z   # when deliveries started failing
# Set in the steps below: SRC_URL, CONN, DEST
```

## Step 0 — Authenticate and confirm the project

```sh
hookdeck whoami   # not set up? See Rules for Agents 8 in SKILL.md
```

Show the output to the user and get confirmation that this is the right organization and project before changing anything. (If you authenticated with `hookdeck ci` and `whoami` errors, show the "configured on project … in organization …" line that `ci` printed instead.)

## Step 1 — Create the source and connection, held back

Create a source with provider signature verification and a connection to a destination for your existing endpoint. Use a low rate limit, then pause the connection straight away, so Event Gateway queues webhooks instead of sending them to an endpoint that is still down.

```sh
hookdeck gateway connection upsert shopify-orders \
  --source-name shopify --source-type SHOPIFY --source-webhook-secret "$SHOPIFY_SECRET" \
  --destination-name orders-api --destination-type HTTP \
  --destination-url https://api.example.com/webhooks/shopify \
  --destination-rate-limit 2 --destination-rate-limit-period second \
  --rules '[{"type":"retry","strategy":"exponential","count":10,"interval":60000,"response_status_codes":["429","500-599"]}]'

hookdeck gateway connection pause shopify-orders

export CONN=$(hookdeck gateway connection get shopify-orders --output json | jq -r .id)
export DEST=$(hookdeck gateway connection get shopify-orders --output json | jq -r .destination.id)
export SRC_URL=$(hookdeck gateway source get shopify --output json | jq -r .url)
```

- **Pause before pointing the provider at the source.** No webhook reaches the connection until step 2, so the connection is paused before anything can be delivered.
- **Verification is on.** Event Gateway rejects requests that fail the provider's signature check, as it does for any inline source ([prepare.md § 4a](prepare.md#4a-inline-setup)).
- **Stripe:** register the new endpoint at Stripe first (step 2), then set the source's secret to that endpoint's own signing secret: `hookdeck gateway source upsert stripe --type STRIPE --webhook-secret "$ENDPOINT_WHSEC"`. Each Stripe endpoint has its own secret.
- **Rate limit:** the value of 2 a second is a placeholder for the outage. You set the real rate in step 4.

## Step 2 — Point the provider at the source URL

Replace or add the provider's subscription so it sends to `$SRC_URL`, for the same topics (and, for Stripe, the same API version) as the direct subscription.

- **Shopify:** recreate or update the subscription so its URL is `$SRC_URL`. This covers a subscription declared in `shopify.app.toml` (change the URI and deploy) and an Admin API subscription that Shopify deleted after repeated failures (create it again against `$SRC_URL`). See [provider-notes.md](provider-notes.md#shopify).
- **Stripe, PayPal, WooCommerce:** add `$SRC_URL` as a new endpoint, and set the Event Gateway source's secret to that endpoint's own secret. Each endpoint signs with its own secret, so the direct endpoint's secret does not verify deliveries to the new URL.

Then remove or disable the old direct subscription, so every webhook doesn't arrive twice once the endpoint recovers. If the provider deleted it already, there is nothing to remove.

Confirm webhooks are arriving. They are held, not delivered, because the connection is paused:

```sh
hookdeck gateway event list --connection-id "$CONN" --limit 5 --output json \
  | jq '.models[] | {id, status, created_at}'
```

Genuine webhooks show status `HOLD`. If you see rejected requests instead, check `rejection_cause` on the source: `VERIFICATION_FAILED` means the source's secret does not match what the provider signs with ([incident-standby.md § VERIFICATION_FAILED](incident-standby.md#verification_failed-on-the-standby-source) covers the wait after changing a secret).

## Step 3 — Fix the endpoint

The fix happens outside Event Gateway. Confirm the endpoint is healthy before resuming delivery, and confirm it accepts deliveries from Event Gateway (see the caveats below).

## Step 4 — Continue the inline runbook

From here the connection is a normal inline connection with a paused queue. [incident-inline.md](incident-inline.md) already covers the rest, starting at its step 2 ("Fix the endpoint", which you just did):

1. **Set a safe rate** ([step 3](incident-inline.md#step-3--set-a-safe-rate)). Replace the placeholder rate on the destination with the rate the endpoint can take now.
2. **Retry failures** ([step 4](incident-inline.md#step-4--retry-what-failed-before-unpausing)). Events that failed after the move are `FAILED` until retried. Retry them while the connection is paused, so older failures arrive before newer held events. If nothing is `FAILED`, the dry-run count is 0 and you skip this.
3. **Unpause** ([step 5](incident-inline.md#step-5--unpause)).
4. **Mop up** ([step 6](incident-inline.md#step-6--mop-up)). Restore the delivery policy. For this connection, the policy to restore is the steady-state rate from [prepare.md § 2](prepare.md#2-know-your-safe-delivery-rate), not the placeholder from step 1. Then reconcile critical objects against the provider's API.

## Caveats before you point the provider at Event Gateway

- **The handler must accept deliveries from Event Gateway.** Deliveries come from Event Gateway, not from the provider. If the handler checks only the provider's signature, change it to verify `x-hookdeck-signature` (see [hookdeck-event-gateway-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway-webhooks)). That is safe because the source verifies the provider's signature on the way in.
- **Stripe signature tolerance and per-endpoint secrets.** Stripe's libraries reject signatures older than 5 minutes by default, and each Stripe endpoint has its own secret. Held webhooks are delivered late, so a handler that still verifies `Stripe-Signature` will reject them. Verify `x-hookdeck-signature` instead ([provider-notes.md § Stripe](provider-notes.md#stripe)).
- **Provider IP allowlists.** If the endpoint or a firewall allows only the provider's IP addresses, deliveries from Event Gateway get `403`. Allow Hookdeck's outbound IPs before unpausing.
- **Payload retention.** Held and failed events are kept for your plan's retention window. Check it covers the time to fix and drain the backlog ([prepare.md § 5](prepare.md#5-check-payload-retention)).
- **Webhooks that failed before the move are not in Event Gateway.** Recover them with the provider's resend tools where they exist (Stripe, PayPal), or by reconciling against the provider's API (Shopify, BigCommerce, WooCommerce). See [provider-notes.md](provider-notes.md).
- **Duplicates.** Handlers must be idempotent. Resent and reconciled webhooks can overlap with ones already processed ([ordering.md](ordering.md)).

## What has not been tested

This path reuses the commands from [prepare.md § 4a](prepare.md#4a-inline-setup) and [incident-inline.md](incident-inline.md), but the full mid-incident sequence has not been run end to end. Rehearse it against a non-production project before relying on it ([prepare.md § Rehearse](prepare.md#7-rehearse)).
