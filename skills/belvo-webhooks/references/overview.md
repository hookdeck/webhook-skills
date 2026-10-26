# Belvo Webhooks Overview

## What Are Belvo Webhooks?

Belvo is an open finance API for Latin America. It uses webhooks to tell your server about
asynchronous work: payment requests settling, consents changing, customers being blocked,
and (for Aggregation) links finishing their data retrieval. Webhooks are configured per product
(Aggregation, Payments Brazil, Payments Mexico), each with its own body shape, and are **not
signed**. The only authentication is an optional static `Authorization` header (see
[verification.md](verification.md)).

## Which Body Shapes Does Belvo Send?

| Product | Identifying fields | Notes |
|---------|--------------------|-------|
| Payments Mexico | `eventType`, `eventCode`, `datetime`, `details` | `details.id` is the Belvo ID of the resource |
| Payments Brazil, schema V2 | `schema_version`, `resource`, `resource_id`, `resource_version`, `timestamp` | Minimal: fetch the resource for details |
| Payments Brazil, schema V1 | `webhook_id`, `webhook_type`, `webhook_code`, `object_id`, `external_id`, `data` | `object_id` is the resource to fetch |
| Aggregation | `webhook_id`, `webhook_type`, `webhook_code`, `link_id`, `request_id`, `external_id`, `data` | `webhook_type` is the resource, in upper case (`ACCOUNTS`) |

Dispatch on `eventCode` when it is present (Mexico), on `resource` when `schema_version` is present
(Brazil V2), and otherwise on `webhook_code`, using `object_id` (Brazil V1) versus `link_id`
(Aggregation) to tell those two apart.

## Payments (Mexico) Event Codes

`eventType` is what you subscribe to in the portal; `eventCode` is what the body carries.

| `eventType` | `eventCode` | Sent when |
|-------------|-------------|-----------|
| `customer_update` | `customer_blocked` | The direct debit customer was blocked for suspicious activity. Sent to **all** merchants, even those without that customer |
| `customer_update` | `customer_unblocked` | The customer was unblocked after review |
| `consent_update` | `consent_submitted` | All required documents were uploaded |
| `consent_update` | `consent_confirmed` | The consent was approved and is active |
| `consent_update` | `consent_incomplete_information` | Documents are missing or invalid |
| `consent_update` | `consent_rejected` | The consent was denied |
| `payment_method_update` | `payment_method_registration_successful` | Direct debit registration succeeded (also the result of a successful penny validation) |
| `payment_method_update` | `payment_method_registration_failed` | Registration failed (`account_validation_failed` for a failed penny validation) |
| `payment_method_update` | `payment_method_registration_canceled` | Registration was canceled, usually by the owner |
| `payment_request_update` | `payment_request_successful` | The payout succeeded |
| `payment_request_update` | `payment_request_failed` | The payment infrastructure provider reported an error |
| `payment_request_update` | `payment_request_chargeback` | Your customer issued a chargeback |
| `withdrawal_update` | `withdrawal_created` | A withdrawal was created and funds are being settled to you |

### Payments Payload

```json
{
  "eventType": "payment_request_update",
  "eventCode": "payment_request_successful",
  "datetime": "2022-01-01T12:34:56.789Z",
  "details": {
    "id": "3118128a-6792-4b06-bd61-4acf6f6ad6b5",
    "reference": "your_reference_here",
    "status": "successful",
    "amount": 100.5,
    "failedReason": null,
    "failedMessage": null
  }
}
```

Extra `details` fields depend on the resource: `documentNumber` (customer events, RFC or CURP),
`paymentMethodId` and `reasons` (consent events; `reasons` only on `consent_rejected` and
`consent_incomplete_information`), `fromDatetime`, `toDatetime` and `extra` (withdrawals).
No webhook is sent for a consent's initial `awaiting_information` status.

## Payments (Brazil) Webhooks

Brazil has two schema versions. **V2** is sent for resources created with the
`X-Belvo-API-Resource-Version: Payments-BR.V2` header (bank accounts, charges, customers and
payment authorizations); without that header you get **V1** where applicable.

```json
{
  "schema_version": "2.0.0",
  "resource": "BANK_ACCOUNT",
  "resource_id": "7d01c4cf-57ed-4ed9-b109-a5bfb2d8c42b",
  "resource_version": "V2",
  "timestamp": "2025-01-16T10:30:45Z"
}
```

`resource` is `BANK_ACCOUNT`, `CHARGE`, `CUSTOMER` or `PAYMENT_AUTHORIZATION`; `schema_version` is
currently always `2.0.0`. Fetch the details with
`GET /payments/br/{resource}/{id}/` and the `X-Belvo-API-Resource-Version: Payments-BR.V2` header.

**V1** bodies use `webhook_type` (the resource) and `webhook_code` (the event):

```json
{
  "webhook_id": "3b9a69f7-0f0a-455b-832d-49ad6fd4905c",
  "webhook_type": "PAYMENT_INTENTS",
  "webhook_code": "STATUS_UPDATE",
  "object_id": "d2e40773-19f6-48d1-93c3-3590ec0c74df",
  "external_id": "c3c51aaf-aaa3-400c-926d-87ab62e195fd",
  "data": {
    "status": "FAILED",
    "metadata": { "internal_reference_id": "GGq12345w2" },
    "failure_code": "consent_expired",
    "failure_message": "The payment consent was not accepted in time.",
    "end_to_end_id": "E432158152024081610416f2b595b056"
  }
}
```

| `webhook_type` | `webhook_code` | Sent when |
|----------------|----------------|-----------|
| `CHARGES` | `STATUS_UPDATE` | A charge's status changes (`SCHEDULED`, `SUCCEEDED`, `FAILED`, `CANCELED`) |
| `CUSTOMERS` | `OBJECT_CREATED` | A customer is created asynchronously |
| `ENROLLMENTS` | `STATUS_UPDATE` | An enrollment's status changes (`PENDING`, `SUCCEEDED`, `FAILED`) |
| `PAYMENT_INTENTS` | `STATUS_UPDATE` | A payment intent's status changes |
| `TRANSACTIONS` | `OBJECT_CREATED` | A transaction is created |

Fetch the details with `GET /payments/br/{resource}/{id}/`, using `object_id` as the ID.

## Aggregation Webhooks

Every Aggregation payload has the same core: `webhook_id`, `webhook_type` (the resource),
`webhook_code`, `link_id`, `request_id`, `external_id` and `data`. Retrieval errors arrive in
`data.errors[]` (each with `code` and `message`, for example `operational_limits_reached`).
`process_type` (`historical_update`, `recurrent_update`, `async_post`, ...) says why it fired.

`webhook_code` values seen in the Aggregation docs include `historical_update`,
`historical_update_progress_complete`, `new_accounts_available`, `new_bills_available`,
`new_transactions_available`, `transactions_updated`, `transactions_deleted`,
`new_owners_available`, `new_investments_available`, `new_investment_transactions_available`,
`new_invoices_available`, `invoices_cancelled`, `new_tax_returns_available`,
`new_employments_available`, `new_financial_statements_available`, `employment_changes`,
`initial_inflow_update`, `historical_inflow_update`, `invalid_credentials`, `token_required`,
`link_deleted`, and consent codes (`consent_rejected`, `openfinance_consent_about_to_expire`,
`openfinance_consent_expired`, `openfinance_consent_expiration_changed`,
`openfinance_consent_with_temporarily_unavailable_resources`,
`openfinance_consent_with_unrecoverable_resources`). Treat the list as open: unknown codes
should be acknowledged with `200`.

## Retries

- **Payments Mexico**: retried only when your server is unreachable, times out or returns `5xx`;
  every 60 minutes, 3 attempts in total (initial plus 2 retries). `4xx` responses are never
  retried. Test deliveries from the portal are not retried.
- **Payments Brazil**: if there is no `2xx`, Belvo retries up to three times, 60 seconds apart.
  Reply with a `2xx` within five seconds.
- **Aggregation**: if there is no `2xx`, Belvo retries five times with linear backoff.

Aggregation and Payments Brazil webhooks come from `3.130.254.46`, `18.220.61.186` and `18.223.45.212`.

## Full Reference

- Payments Mexico: https://developers.belvo.com/developer_resources/resources-webhooks-payments-mexico
- Payments Brazil: https://developers.belvo.com/developer_resources/resources-webhooks-payments-brazil
- Aggregation: https://developers.belvo.com/developer_resources/resources-webhooks-aggregation
