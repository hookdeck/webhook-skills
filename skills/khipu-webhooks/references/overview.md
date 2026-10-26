# Khipu Webhooks Overview

## What Are Khipu Webhooks?

[Khipu](https://khipu.com) is a Chilean bank-transfer payment service. When you create a collection through the instant payments API with a `notify_url` and `notify_api_version` set to `"3.0"`, Khipu POSTs the payment's data to that URL once the payment is reconciled. Every delivery carries an `x-khipu-signature` header.

The older notifications API 1.3 sent only a `notification_token`; it is not covered here.

> Only notifications API version 3.0 is supported. Version 1.3 notifications aren't signed this way and fail verification.

## Event Types

Khipu has **no event-name field or header**. Each POST is a reconciled payment, so the examples treat every verified delivery as a payment reconciliation (the sample payloads call it `reconciliation`).

| Notification | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| Payment reconciliation | Khipu reconciles a payment for a collection with `notify_url` | Mark the order paid, issue the receipt, release goods |

## Event Payload Structure

```json
{
  "payment_id": "zfxnocsow6mz",
  "receiver_id": 990939,
  "subject": "TEST_COBRO",
  "amount": 1000.0,
  "discount": 0.0,
  "currency": "CLP",
  "receipt_url": "https://s3.amazonaws.com/staging.notifications.khipu.com/CPKH-1804240956-zfxnocsow6mz.pdf",
  "bank": "DemoBank",
  "bank_id": "Bawdf",
  "payer_name": "Developer User #990.939",
  "payer_email": "test@khipu.com",
  "personal_identifier": "44.444.444-4",
  "bank_account_number": "000000000000444444444",
  "out_of_date_conciliation": false,
  "transaction_id": "15f836bd-e8a7-4d12-b2f1-56403012b555",
  "authorizer_operation_code": "AUT-20240418-0001",
  "responsible_user_email": "test@khipu.com",
  "payment_method": "simplified_transfer",
  "conciliation_date": "2024-04-18T13:56:54.859Z"
}
```

The page's signing example shows the same payload with `amount` and `discount` as strings (`"1000.0000"`) and escaped slashes, so don't assume number or string types, and hash the exact bytes received.

## Delivery

One POST per event to the collection's `notify_url`. The docs don't describe retries or what response Khipu expects, so return `200` after recording the payment and make the handler idempotent on `payment_id`.

## Full Event Reference

See [Khipu's payment webhook documentation](https://docs.khipu.com/en/payment-solutions/instant-payments/payment-webhook).
