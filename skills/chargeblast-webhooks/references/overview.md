# Chargeblast Webhooks Overview

## What Are Chargeblast Webhooks?

Chargeblast (chargeback prevention) sends a webhook when a chargeback-prevention alert (Ethoca, CDRN, RDR, TC40) or a Visa Consumer Clarity / FPT deflection is created or changes. A webhook is a JSON `POST` to the URL you set in the dashboard. Delivery runs on [Svix](https://www.svix.com/), so each request carries `svix-id`, `svix-timestamp` and `svix-signature` headers. The event type is in the `X-Event-Type` header; the body does not contain it.

## What Are the Common Event Types?

| Event | Triggered When | Alert types | Common Use Cases |
|-------|----------------|-------------|------------------|
| `alert.created` | A new alert exists, including provider ingest, Verifi/RDR paths where enabled, and manual replay or test sends | Ethoca, CDRN, RDR, TC40 | Open a case, start a refund workflow |
| `alert.updated` | An alert changes and it already has a matched charge. Not sent for unmatched alerts | Ethoca, CDRN, RDR, TC40 | Sync status, read `externalOrder` |
| `alert.refunded` | Chargeblast treats the alert as refunded; can follow `alert.created` closely when an alert arrives already resolved | Ethoca, CDRN, RDR (not TC40) | Close the case, reconcile the refund |
| `alert.matched` | The alert is confirmed matched to a single charge; saving the same match again does not re-fire | Ethoca, CDRN, RDR, TC40 | Link the alert to an order |
| `alert.will_expire` | About 46-48 hours before expiry, for eligible alerts that still need attention. At most once per alert | Ethoca, CDRN (not RDR or TC40) | Escalate before the deadline |
| `alert.within_refund_rules` | The alert is within your automation rules. No deduplication; a later refund can still fail | Ethoca, CDRN, RDR (not TC40) | Trigger an automated refund |
| `deflection.created` | A new deflection is persisted | CE, FPT | Record the deflection |
| `deflection.updated` | A deflection changes, for example a CE status change or `fees` populated after billing | CE, FPT | Update status, track fees |

These are the 8 types Chargeblast documents; the list may not be exhaustive.

## Event Payload Structure

There is no envelope: the body is the object itself, and the type comes from `X-Event-Type`.

**Alert body** (`alert.*`), main fields: `id`, `alertId`, `alertType`, `amount`, `currency`, `arn`, `authCode`, `card`, `cardBrand`, `createdAt`, `transactionDate`, `customerEmail`, `customerId`, `descriptor`, `externalOrder`, `externalUrl`, `issuer`, `merchantId`, `networkId` (optional), `provider`, `subprovider` (the alert network, for example `Ethoca`), `reasonCode`, `responseAction`, `site`, `creditStatus`, `creditAppealed`, and `attributes` (string key/value metadata such as an order number). `externalOrder` is not available on `alert.created`; use `alert.updated`.

**Deflection body** (`deflection.*`): `id`, `type` (`CE` or `FPT`, the deflection product, not the event type), `status` (`Succeeded`, `Reversed`, `Failed` or `Timeout`), `amount`, `currency`, `chargeId`, `customerEmail`, `fees` (may be null until billing runs), `merchantId`.

## Delivery

Chargeblast's documentation gives no timeout, retry schedule or ordering guarantee. Return a `2xx` quickly and deduplicate on `svix-id`.

## Full Event Reference

See Chargeblast's [webhook setup](https://docs.chargeblast.com/api-reference/webhooks/setup) and [webhook event types](https://docs.chargeblast.com/api-reference/webhooks/webhook-events) pages.
