# Celcoin Webhooks Overview

## What Are Celcoin Webhooks?

Celcoin is a Brazilian banking-as-a-service platform (Pix, TED, accounts, onboarding, cards, charges). It notifies your system of events by sending an HTTP request to a URL you register. Subscriptions are created through the Celcoin API, **one per `entity`** (event type), and each subscription carries the credentials Celcoin will present. Webhooks are not signed; authentication is HTTP Basic (or JWT/OAuth 2.0, which Hookdeck's Celcoin source does not cover).

Celcoin's docs don't name the HTTP method used for notifications, so handle GET, POST, PUT, PATCH and DELETE.

## Event Payload Structure

```json
{
  "entity": "spb-transfer-out",
  "createTimestamp": "2023-07-24T17:02:47.0824409",
  "status": "CONFIRMED",
  "body": { "id": "7e172eef-f05e-429e-ae36-401310a204cd", "amount": 750 }
}
```

| Field | Description |
|-------|-------------|
| `entity` | The event identifier. Dispatch on this |
| `createTimestamp` | When the notification was created (Brasília time, no timezone suffix) |
| `status` | `CONFIRMED` or `ERROR` |
| `body` | Entity-specific data (transaction id, amount, parties) |
| `error` | Only on `ERROR`: `errorCode` and `message` |

Celcoin says it never removes fields from a webhook contract without notice but may add new ones, so don't reject payloads with unknown fields.

## Common Event Types

| Entity | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `pix-payment-out` | A Pix payment or transfer is confirmed | Mark a payout settled or failed |
| `pix-payment-in` | A Pix is received | Credit a customer, reconcile a QR code |
| `pix-reversal-out` | A refund of a received Pix is confirmed | Record a refund |
| `pix-reversal-in` | A refund of a Pix-out is received | Reconcile a returned payment |
| `internal-transfer-in` | An internal transfer is received | Credit an account |
| `internal-transfer-out` | An internal transfer is sent | Confirm a debit |
| `spb-transfer-out` | A TED is confirmed | Mark a TED settled (or failed on `ERROR`) |
| `spb-transfer-in` | A TED is received | Credit an account |
| `onboarding-create` | A new account is created | Store account details |
| `onboarding-proposal` | The proposal is decided (`Approved` or `Reproved`) | Continue or stop onboarding |
| `kyc` | The KYC result of an account is available | Update compliance state |

Other entities in Celcoin's docs include `pix-automatic-*`, `pix-dict-claim-*`, `pix-infraction`, `pix-med-refund`, `pix-funds-recovery-*`, `spb-reversal-in`, `charge-*`, `billpayment`, `topup`, `launch-in`, `launch-out`, `account-status`, `onboarding-backgroundcheck`, `onboarding-documentscopy`, `onboarding-file`, `slc-payment-in`, `judicial-movement-*`, `vehicledebts-*`, `invoice-nfse-*`, `account-accreditation` and `spb-event-error`. The examples log unknown entities and return 200.

## Full Event Reference

- [Celcoin webhooks](https://developers.celcoin.com.br/docs/webhooks-baas)
- [Register and manage webhooks](https://developers.celcoin.com.br/docs/celbricks-cadastrar-e-gerenciar-webhooks)
- [BaaS webhook templates](https://developers.celcoin.com.br/docs/templates-de-webhooks-do-baas)
