# Privy Webhooks Overview

## What Are Privy Webhooks?

[Privy](https://www.privy.io) is auth and embedded-wallet infrastructure: users, wallets,
transactions, wallet actions (swaps, transfers, yield deposits), intents and usage charges. It
sends an HTTPS `POST` to an endpoint you register when something happens in your app, such as a
user logging in or a transaction being confirmed. Deliveries go through Svix and are signed.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx`; everything else, `3xx` included, is a failure |
| Delivery | At least once; no ordering guarantee is documented |
| Source IPs | `44.228.126.217`, `50.112.21.217`, `52.24.126.164`, `54.148.139.208`, `2600:1f24:64:8000::/56` |

## Event Payload Structure

The event name is the top-level `type` field, and the event's own fields sit beside it at the top
level. There is no `data` wrapper.

```json
{
  "type": "user.created",
  "user": { "id": "did:privy:cm..." }
}
```

```json
{
  "type": "transaction.confirmed",
  "wallet_id": "...",
  "transaction_hash": "0x..."
}
```

The dashboard's "Test webhook" button sends a minimal event:

```json
{ "type": "privy.test", "message": "Hello, World!" }
```

Field names differ per event. Check the event's page under the
[webhook reference](https://docs.privy.io/api-reference/webhooks/overview#webhook-events-reference)
for its schema. Some payloads carry an `idempotency_key`; use it to drop duplicates when present.
For `transaction.confirmed`, fetch the transaction directly if you need final gas data, because
`gas_credits_charged` can still be `null` right after the webhook.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `privy.test` | You click "Test webhook" in the dashboard | Confirm the endpoint works |
| `user.created` | A user is created in the app | Create a matching record |
| `user.authenticated` | A user logs in | Audit log, session analytics |
| `user.linked_account` | A user links a new login method | Sync profile data |
| `user.unlinked_account` | A user unlinks a login method | Sync profile data |
| `user.wallet_created` | An embedded or smart wallet is created for a user | Store the wallet address |
| `user.deleted` | A user is deleted | Deprovision |
| `mfa.enabled` / `mfa.disabled` | A user turns multi-factor authentication on or off | Security audit |
| `wallet.funds_deposited` | Funds land in an embedded wallet | Credit balances |
| `wallet.funds_withdrawn` | Funds leave an embedded wallet | Reconcile |
| `wallet.private_key_export` | A user exports their private key | Security alert |
| `transaction.broadcasted` | A transaction is submitted and awaiting confirmation | Show pending state |
| `transaction.confirmed` | A transaction is confirmed on-chain | Mark complete |
| `transaction.failed` | A transaction could not be submitted | Notify, retry |
| `transaction.execution_reverted` | A transaction confirmed but execution reverted | Notify, investigate |
| `wallet_action.swap.created` | A token swap action is created | Show in-progress swap |
| `wallet_action.swap.succeeded` | A swap completes | Mark complete |
| `wallet_action.swap.failed` | A swap fails | Notify |
| `intent.created` | An intent is proposed and awaits approval | Notify approvers |
| `intent.executed` | An approved intent completed | Mark complete |
| `user_operation.completed` | An ERC-4337 UserOperation lands on-chain | Mark complete |

The examples handle exactly these events and acknowledge anything else with `200`.

## Full Event List (70 documented)

The list may not be exhaustive. Names below come from Privy's webhook overview and reference.

- **User:** `user.created`, `user.deleted`, `user.authenticated`, `user.linked_account`,
  `user.unlinked_account`, `user.updated_account`, `user.transferred_account`,
  `user.wallet_created`, `user.kyc.updated`
- **MFA:** `mfa.enabled`, `mfa.disabled`
- **Wallet:** `wallet.archived`, `wallet.restored`, `wallet.funds_deposited`,
  `wallet.funds_withdrawn`, `wallet.private_key_export`, `wallet.seed_phrase_export`,
  `wallet.recovery_setup`, `wallet.recovered`, `wallet.deposit_account.deposit_started`,
  `wallet.deposit_account.deposit_completed`, `wallet.deposit_account.deposit_failed`
- **Transaction:** `transaction.broadcasted`, `transaction.confirmed`, `transaction.failed`,
  `transaction.execution_reverted`, `transaction.replaced`, `transaction.still_pending`,
  `transaction.provider_error`
- **Wallet action** (each with created, succeeded, rejected and failed variants):
  `wallet_action.swap.*`, `wallet_action.transfer.*`, `wallet_action.earn_deposit.*`,
  `wallet_action.earn_withdraw.*`, `wallet_action.earn_incentive_claim.*`
- **Usage charges:** `usage.gas_sponsorship.recorded`, `usage.swap_provider_fee.recorded`, and
  related charge events
- **Intent:** `intent.created`, `intent.authorized`, `intent.rejected`, `intent.executed`,
  `intent.failed`
- **User operation:** `user_operation.completed`
- **Organization:** `organization.kyb.updated`

## Retries and Delivery

Any non-`2xx` response (including `3xx`), timeout or connection error is retried: immediately,
then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 more hours. After
the last attempt the message is marked failed and must be retried manually from the dashboard.
An endpoint whose deliveries fail for 5 consecutive days is disabled automatically. Delivery is
at least once, so deduplicate on `svix-id` (and on `idempotency_key` where present) and make
handlers idempotent.

## Full Event Reference

For payload schemas, see Privy's [webhooks overview](https://docs.privy.io/api-reference/webhooks/overview)
and the per-event pages linked from it.
