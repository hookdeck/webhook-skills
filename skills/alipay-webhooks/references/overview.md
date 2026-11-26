# Alipay (Antom) Webhooks Overview

## What Are Alipay Webhooks?

Antom, which documents Alipay's global merchant payments (global.alipay.com/docs
now redirects to docs.antom.com), sends **asynchronous notifications** to your
server when a payment, capture or refund reaches a final state, and for
authorization, dispute and subscription changes.

Your handler must:

1. **Verify** the RSA256 `Signature` header with the Antom public key.
2. **Parse** the raw JSON body and read the type field for that notification API.
3. **Respond** HTTP 200 with the fixed `SUCCESS` acknowledgement (no signature
   needed).

If Antom doesn't receive that body, it resends the notification up to eight
times within 24 hours (0s, 2m, 10m, 10m, 1h, 2h, 6h, 15h; one Antom page says
seven). In the sandbox a wrong acknowledgement isn't resent.

## Common Event Types

Notifications do **not** carry a single `type` field. Each notification API puts
its type in its own field, and most bodies also carry `result.resultStatus`:
`S` (success) or `F` (failure).

| Type field | Value | Notification API | Fires when |
|------------|-------|------------------|-----------|
| `notifyType` | `PAYMENT_RESULT` | `notifyPayment` | A payment reaches a final success or failure state |
| `notifyType` | `PAYMENT_PENDING` | `notifyPayment` | The buyer has paid; the final result is still to come |
| `notifyType` | `CAPTURE_RESULT` | `notifyCapture` | A capture succeeds or fails |
| `notifyType` | `REFUND_RESULT` | `notifyRefund` | A refund reaches a final state |
| `authorizationNotifyType` | `AUTHCODE_CREATED`, `TOKEN_CREATED`, `TOKEN_CANCELED` | `notifyAuthorization` | An authorization is granted or cancelled |
| `disputeNotificationType` | `DISPUTE_CREATED`, `DEFENSE_DUE_ALERT`, `DISPUTE_JUDGED`, ... | `notifyDispute` | A dispute changes state |
| `subscriptionNotificationType` | `CREATE`, `CHANGE`, `CANCEL`, `TERMINATE`, `UPDATE` | `notifySubscription` | A subscription changes |

`notifyVaulting` and the Subscription Payment `notifyPayment` carry no type
field.

## Event Payload Structure

A `notifyPayment` (`PAYMENT_RESULT`) body, from Antom's docs:

```json
{
  "notifyType": "PAYMENT_RESULT",
  "result": {
    "resultCode": "SUCCESS",
    "resultStatus": "S",
    "resultMessage": "success"
  },
  "paymentRequestId": "2020010123456789XXXX",
  "paymentId": "2020010123456789XXXX",
  "paymentAmount": {
    "value": "8000",
    "currency": "EUR"
  },
  "paymentCreateTime": "2020-01-01T12:01:00+08:30",
  "paymentTime": "2020-01-01T12:01:01+08:30"
}
```

Key fields:

- **`notifyType`**: which payment notification this is.
- **`result.resultStatus`**: `S` or `F`. Only treat `S` on `PAYMENT_RESULT` as paid.
- **`paymentRequestId`**: the ID you sent on `pay()`.
- **`paymentId`**: Antom's payment ID. It's shared by every notification about
  the payment, so don't deduplicate on it alone.
- **`paymentAmount`**: `{ value, currency }`, with `value` in the smallest
  currency unit.

Refunds carry `refundRequestId` / `refundId` / `refundStatus`; captures carry
`captureRequestId` / `captureId` / `captureAmount`; disputes carry `disputeId`.

## Full Event Reference

- [Antom One-time Payments notifications](https://docs.antom.com/ac/cashierpay/notifications)
- [notifyPayment](https://docs.antom.com/ac/ams/paymentrn_online)
- [Sign a request and verify the signature](https://docs.antom.com/ac/ams/digital_signature)
