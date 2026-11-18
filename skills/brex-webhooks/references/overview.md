# Brex Webhooks Overview

## What Are Brex Webhooks?

Brex webhooks notify your systems in real time when events happen in a Brex account, so you can update records or notify users without polling the Brex APIs. Typical uses: reconcile a payment when `TRANSFER_PROCESSED` arrives, alert finance on `TRANSFER_FAILED`, sync HR changes on `USER_UPDATED`, track referrals for partners.

- Registered with the [Webhooks API](https://developer.brex.com/openapi/webhooks_api/) (`POST /v1/webhooks`), not in the dashboard.
- **One endpoint per API client** (`client_id`). One endpoint can listen to many event types.
- Signed in the Standard Webhooks format with a base64 secret (see [verification.md](verification.md)).

## Payload Shape

Each event is a flat JSON object with `event_type` and the IDs of what changed. Fetch details (amounts, statuses, names) from the matching API with an access token for `company_id`.

```json
{
  "event_type": "TRANSFER_PROCESSED",
  "transfer_id": "dptx_ckyypz30n000101kgzgnrtqlf",
  "payment_type": "ACH",
  "company_id": "cuacc_ckqckhadg000601r95ox48c2s"
}
```

## Event Catalog

Brex's [webhooks guide](https://developer.brex.com/guides/webhooks) lists six events; the [Webhook Events reference](https://developer.brex.com/openapi/webhooks_api/#tag/Webhook-Events) adds two more.

| Event | API | Fired when | Fields |
|-------|-----|------------|--------|
| `REFERRAL_CREATED` | Onboarding | A referral is created, by API or mobile/web | `referral_id` |
| `REFERRAL_ACTIVATED` | Onboarding | A referred contact signs up with your referral link | `referral_id` |
| `REFERRAL_APPLICATION_STATUS_CHANGED` | Onboarding | A product application status changes | `referral_id`, `application` |
| `TRANSFER_PROCESSED` | Payments | A transfer is successfully received | `transfer_id`, `payment_type`, `return_for_id`, `company_id` |
| `TRANSFER_FAILED` | Payments | A transfer fails | `transfer_id`, `payment_type`, `return_for_id`, `company_id` |
| `USER_UPDATED` | Team | A user is updated | `user_id`, `company_id`, `updated_attributes` |
| `EXPENSE_PAYMENT_UPDATED` | Expenses | Expense activity on Brex cards | `expense_id`, `payment_status`, `payment_type`, `card_id`, `merchant`, `amount`, `version`, ... |
| `ACCOUNTING_RECORD_READY_FOR_EXPORT` | Accounting | Accounting records are ready to export | `accountingRecordIds`, `companyId` (camelCase) |

Field values:

- `payment_type` on transfers: `ACH`, `DOMESTIC_WIRE`, `CHEQUE`, `INTERNATIONAL_WIRE`, `BOOK_TRANSFER`, `STABLECOIN`, and the returns `ACH_RETURN`, `WIRE_RETURN`, `CHEQUE_RETURN` (with `return_for_id` set to the original transfer).
- `updated_attributes` on `USER_UPDATED`: any of `STATUS`, `MANAGER_ID`, `DEPARTMENT_ID`, `LOCATION_ID`.
- `EXPENSE_PAYMENT_UPDATED`: `payment_status` is `PENDING` or `DECLINED`; `payment_type` is `PURCHASE`, `REFUND`, `WITHDRAWAL` or `DECLINED`. Money fields are objects with `amount` in the smallest currency unit and `currency`. `version` increases with each update, so ignore an update older than one you've already stored.

The `WebhookEventType` enum also includes embedded-partner types such as `EMBEDDED_CARD_TRANSACTION_UPDATED`, `EMBEDDED_CARD_UPDATED`, `EMBEDDED_DISPUTE_UPDATED`, `EMBEDDED_CARD_AUTHORIZATION` and `PARTNERSHIP_INTEGRATION_CONNECTION_UPDATED`, which aren't documented in the public catalog. Return `200` for types you don't handle.

## Delivery Notes

- Your endpoint must be public HTTPS and accept a JSON `POST`.
- `Webhook-Id` stays the same when a message is resent; `Webhook-Timestamp` is the time of the attempt. Dedupe on `Webhook-Id`.
- Brex doesn't publish a retry schedule. Return `2xx` quickly and do the work asynchronously.
- Deliveries come from fixed IPs (see [setup.md](setup.md#ip-allowlist)).

## Partners: Which Access Token?

If you serve many Brex customers, keep a map of `company_id` to `access_token`. The Team API's companies endpoint returns the `company_id` for a token, which lets you build that map.
