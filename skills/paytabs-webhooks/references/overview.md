# PayTabs Webhooks Overview

## What Are PayTabs Webhooks?

PayTabs (paytabs.com) is a payment gateway for the MENA region. Two server-to-server notifications deliver the full transaction as JSON in an HTTP `POST`:

- **IPN (Instant Payment Notification).** Sent to the IPN listener URL configured on the profile as soon as a transaction is created or altered, so one payment can produce several IPNs.
- **Callback.** Sent once per payment request, to the callback URL on the request, when the payment process ends (the customer pays, fails or cancels). It does not depend on the customer's actions.

Both carry a `Signature` header. The browser Return URL is a different mechanism (a customer redirect with form fields) and is not covered here.

## Which Events Are There?

None: PayTabs sends no event name in the body or in a header. Every request is the same kind of message, the transaction's current state. Dispatch on these fields instead:

| Field | Values seen in the docs | Use |
|-------|-------------------------|-----|
| `tran_type` | `Sale`, `Refund` (other types such as `Auth` exist) | What kind of transaction this is |
| `payment_result.response_status` | `A` authorised, `D` declined (see PayTabs' Response_code and Response_status article for the rest) | Outcome |
| `payment_result.response_message` | `Authorised`, `Acquirer is unable to process this request` | Human-readable reason |

The examples handle `Sale` and `Refund` explicitly when `response_status` is `A`, and log anything else.

## Event Payload Structure

```json
{
  "tran_ref": "TST2234801409691",
  "merchant_id": 31237,
  "profile_id": 81784,
  "cart_id": "cart_11111",
  "cart_currency": "EGP",
  "cart_amount": "500.00",
  "tran_currency": "EGP",
  "tran_total": "500.00",
  "tran_type": "Sale",
  "tran_class": "ECom",
  "customer_details": { "name": "Mohammed EL Rayes", "email": "mohammed.elrayes@paytabs.com", "country": "EG" },
  "payment_result": {
    "response_status": "D",
    "response_code": "344",
    "response_message": "Acquirer is unable to process this request",
    "transaction_time": "2022-12-14T15:53:58Z"
  },
  "payment_info": { "payment_method": "Visa", "card_type": "Credit", "card_scheme": "Visa" },
  "ipn_trace": "IPNS0004.6399F196.00000FD3"
}
```

(Abbreviated from the sample in the PayTabs docs; `shipping_details` and more `customer_details` fields are also sent.) Treat every field as untrusted and check types before reading nested objects.

## Delivery

Retries, timeout and the expected response are not documented. Reply `2xx` quickly, do the real work in a background task, and dedupe on `tran_ref` plus `payment_result.response_status` because the IPN can repeat for one transaction.

## Full Reference

- [Handle the post-payment responses](https://support.paytabs.com/en/support/solutions/articles/60000978877)
- [Signature verification](https://support.paytabs.com/en/support/solutions/articles/60000718961)
