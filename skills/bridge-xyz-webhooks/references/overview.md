# Bridge (bridge.xyz) Webhooks Overview

## What Are Bridge Webhooks?

[Bridge](https://bridge.xyz) is a stablecoin orchestration platform for moving
money between fiat and stablecoins (customers/KYC, transfers, virtual accounts,
liquidation addresses, and cards). Bridge webhooks notify your application when
resources change — for example when a customer completes KYC, a transfer settles,
or funds land in a virtual account — so you don't have to poll the API.

Each event is delivered as an HTTP `POST` with a JSON body and an
`X-Webhook-Signature` header signed with **RSA-SHA256**. You verify the signature
using the **per-endpoint public key** returned by the webhook API (see
[verification.md](verification.md)).

## How Subscription Works

Bridge subscriptions are **category-based**, not per-event. When you create a
webhook you pass an `event_categories` array (e.g. `["customer", "kyc_link",
"transfer"]`). You then receive every `<category>.<action>` event within those
categories. New webhooks are created **disabled** and must be enabled before
events are delivered — see [setup.md](setup.md).

## Event Categories

| Category | Events | Fires when |
|----------|--------|------------|
| `customer` | `customer.created`, `.updated`, `.updated.status_transitioned`, `.deleted` | A customer record or its KYC status changes |
| `kyc_link` | `kyc_link.created`, `.updated`, `.updated.status_transitioned` | A hosted KYC / Terms of Service link changes |
| `transfer` | `transfer.created`, `.updated`, `.updated.status_transitioned` | A transfer is created or moves to a new state |
| `virtual_account.activity` | `virtual_account.activity.created`, `.updated` | Deposit or account activity on a virtual account |
| `liquidation_address.drain` | `liquidation_address.drain.created`, `.updated`, `.updated.status_transitioned` | Funds drain out of a liquidation address |
| `static_memo.activity` | `static_memo.activity.created`, `.updated` | Deposit activity against a static memo |
| `bridge_wallet.activity` | `bridge_wallet.activity.created`, `.updated` | Activity on a Bridge wallet |
| `card_account` | `card_account.created`, `.updated`, `.updated.status_transitioned` | A card account is provisioned or changes |
| `card_transaction` | `card_transaction.created`, `.updated`, `.updated.status_transitioned` | A card authorization, settlement or reversal |
| `posted_card_account_transaction` | `posted_card_account_transaction.created`, `.updated` | A settled transaction posts to a card account |
| `card_withdrawal` | `card_withdrawal.created`, `.updated` | A withdrawal from a card account |
| `external_account` | `external_account.created`, `.updated`, `.deleted` | An external bank account is linked, changed or removed |
| `rfi` (beta) | `rfi.created`, `.updated`, `.updated.status_transitioned` | Bridge requests information for a compliance review |

Event names follow `<category>.<mutation>`. A status change arrives as
`updated.status_transitioned`; plain `updated` means other fields changed. The
most commonly handled events are:

| Event | Common Use Cases |
|-------|------------------|
| `customer.created` | Provision an account, start onboarding |
| `customer.updated.status_transitioned` | React to KYC approval or rejection |
| `kyc_link.updated.status_transitioned` | Track KYC/ToS completion, unblock onboarding steps |
| `transfer.created` | Record a new payment or payout in your ledger |
| `transfer.updated.status_transitioned` | Update payment status, fulfil on `payment_processed` |
| `virtual_account.activity.created` | Reconcile incoming funds, credit a balance |

## Event Payload Structure

Every event uses the same envelope. Bridge's documented example for a new transfer:

```json
{
  "api_version": "v0",
  "event_id": "wh_123abc456def",
  "event_sequence": 1,
  "event_developer_id": "dev_111aaa222bbb333ccc",
  "event_category": "transfer",
  "event_type": "transfer.created",
  "event_object_id": "tr_8e9a1f2c3d4b5a69",
  "event_object_status": "awaiting_funds",
  "event_object": {
    "id": "tr_8e9a1f2c3d4b5a69",
    "state": "awaiting_funds",
    "amount": "1500.00",
    "currency": "usd",
    "developer_fee": "0.0",
    "client_reference_id": null,
    "on_behalf_of": "cust_alice",
    "source": {
      "currency": "usdc",
      "from_address": "0x1111111111111111111111111111111111111111",
      "payment_rail": "polygon"
    },
    "destination": {
      "currency": "usd",
      "payment_rail": "ach",
      "external_account_id": "external-account-123"
    },
    "source_deposit_instructions": {
      "payment_rail": "polygon",
      "amount": "1500.00",
      "currency": "usdc",
      "to_address": "0x2222222222222222222222222222222222222222"
    },
    "created_at": "2025-07-22T11:26:55.000Z",
    "updated_at": "2025-07-22T11:26:55.000Z"
  },
  "event_object_changes": {},
  "event_created_at": "2025-07-22T11:26:55.000Z"
}
```

- `event_id` is globally unique; Bridge suggests it as an idempotency key.
- `event_object` is the full resource, rendered the same way as the API response.
- `event_object_changes` holds diffs from the previous event on updates.
- Branch your handler on `event_type`.

## Delivery, Retries, and Replay Protection

- Return a **200** as quickly as possible to avoid timeouts and retries. Bridge doesn't publish the timeout.
- If your endpoint is unavailable, Bridge retries with exponential backoff for up to two days. Each retry carries a new signature timestamp.
- Bridge advises disregarding events older than a few minutes (10 minutes in its example) and returning a **400** so Bridge retries.

## Full Event Reference

For the complete list of categories, events, and payload fields, see Bridge's
official documentation:

- [Setting up webhooks](https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-webhooks)
- [Webhook signature verification](https://apidocs.bridge.xyz/platform/additional-information/webhooks/signature)
- [Event structure](https://apidocs.bridge.xyz/platform/additional-information/webhooks/structure)
