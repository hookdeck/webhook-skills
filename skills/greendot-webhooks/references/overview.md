# Green Dot Webhooks Overview

## What Are Green Dot Webhooks?

Green Dot's Embedded Finance platform (Banking-as-a-Service, BaaS) sends
**webhooks** to a partner-hosted HTTPS endpoint whenever something happens on an
account, card, or transfer in your program. Green Dot POSTs a JSON body to the
callback URL your Green Dot representative registers for you.

Unlike most providers, Green Dot uses **push authentication**: Green Dot
authenticates *itself* to your endpoint (see below), rather than you verifying a
single HMAC signature over the body. This is the same class of security model as
Auth0 Custom Log Streams — the trust is established by the credentials on the
incoming request, not solely by a body signature.

## How Deliveries Are Authenticated

The primary mechanism is an **OAuth 2.0 client_credentials Bearer token** sent
on the `Authorization` header of every webhook request. The token carries the
scope `post:webhook`. Green Dot supports several per-partner variants configured
by your rep:

- **OAuth** — client_credentials grant (the default)
- **FormOAuth** / **FormUrlEncodedOAuth** — form-encoded token requests
- **PartnerOAuth** — token issued by the partner's own authorization server
- **Certificate** — mutual TLS (mTLS) / PKCS#7 client certificates

A delivery may also carry an **`x-gd-signature`** header, but its algorithm,
encoding, and canonical payload are **not documented publicly**. This skill
therefore does **not** verify it — a guessed HMAC would give false confidence.
If you need payload-level verification, obtain the specification (and signing
key) from your Green Dot representative first.

Green Dot also sends an **`API-Key`** header on every delivery — your
program's own, static API key. It is not a computed signature (just the same
key you already hold), so at most treat a compare against it as weak
defense-in-depth layered on the Bearer token check, never as a replacement.

See [verification.md](verification.md) for details.

## Request Headers You Will Receive

| Header | Notes |
|--------|-------|
| `Authorization: Bearer <token>` | OAuth client_credentials token, scope `post:webhook` |
| `x-GD-RequestId` | Correlation id — **you must echo this back** in your response |
| `x-gd-signature` | May be present; algorithm undocumented — not verified by this skill |
| `API-Key` | Your program's API key, the same on every delivery — not a computed signature |
| `User-Agent: greendot-baas/3.0.0` | Identifies Green Dot's delivery agent |
| `Accept: application/json, text/plain, text/html` | The body is JSON; Green Dot doesn't document its Content-Type |

## Common Event Types

The event name is the **`eventType`** field inside the JSON body.

| `eventType` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `transaction` | A card or account transaction posts | Ledger sync, spend notifications |
| `accountUpdated` | Account details or status change | Keep local account records in sync |
| `achTransfer` | An ACH transfer changes state | Funding / payout status tracking |
| `cardUpdate` | A card is issued, activated, or changes status | Card lifecycle, reissue flows |
| `billPayTransfer` | A bill pay transfer changes state | Bill pay status, receipts |
| `directDepositSwitch` | A direct-deposit switch progresses | DD onboarding funnel |
| `provisioning` | Account / card provisioning progresses | Onboarding orchestration |

Green Dot also emits statement-ready, interest-paid, NSF/failed-transfer, NOC,
eWallet, paper-check, mail-tracking, promotional, P2P, ATM PIN, auto money
movement, and adjustment final-status events. **The exact set enabled for your
program is configured per-partner** — confirm the `eventType` values you will
receive with your Green Dot rep.

## Event Payload Structure

Every body has the same envelope. The event type is **each event's**
`eventType`, inside `accounts[].events[]`, not a top-level field:

```json
{
  "accounts": [
    {
      "accountIdentifier": "...",
      "events": [ { "eventType": "...", ... } ]
    }
  ]
}
```

Each event carries `eventIdentifier`, `eventType`, `eventDateTime` and an object
named for the event (`account`, `transactions`, `transfer`, ...). Green Dot says
a multi-clearing transaction can put several events in one POST, so loop over
both arrays. Full examples for every event type are on Green Dot's
[Webhook Events](https://developer.greendot.com/embedded-finance/docs/webhook-events) page.

## Acknowledging a Delivery

Your endpoint must respond `200` or `201` and:

1. **Echo the `x-GD-RequestId` header** back on the response.
2. Return a JSON body with a `responseDetails` array:

```json
{ "responseDetails": [{ "code": 0, "subCode": 0, "description": "<x-GD-RequestId>" }] }
```

`code: 0` signals success. A `5xx`, a timeout, a `401`/`403` or a connection
failure causes Green Dot to retry the delivery if retries are enabled for your
program.

## Full Event Reference

For the complete, current list of events and payloads, see Green Dot's
[Webhook Events](https://developer.greendot.com/embedded-finance/docs/webhook-events)
and [Webhooks overview](https://developer.greendot.com/embedded-finance/docs/webhooks-overview)
pages, and confirm the enabled set with your Green Dot representative.
