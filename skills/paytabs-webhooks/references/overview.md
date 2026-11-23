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
| `tran_type` | `Sale` in the samples; the documented types are sale, auth, capture, void, register and refund | What kind of transaction this is |
| `payment_result.response_status` | `A` authorised, `H` hold, `P` pending (refunds), `V` voided, `E` error, `D` declined, `X` expired | Outcome |
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
  "customer_details": { "name": "Jane Doe", "email": "user1@example.com", "country": "EG" },
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

(Abbreviated from the sample in the PayTabs docs, with the customer's name and email replaced by placeholders; `shipping_details` and more `customer_details` fields are also sent.) Treat every field as untrusted and check types before reading nested objects.

## Delivery

The IPN expects a `200 OK`. Without one it is queued and retried up to 5 times with an increasing delay; after the last failure PayTabs adds a note to the transaction. The timeout is not documented. Reply `200` quickly, do the real work in a background task, and dedupe on `tran_ref` plus `payment_result.response_status` because the IPN can repeat for one transaction.

The IPN config's notification type sets the body: **Default Web** sends the nested transaction shown above, **Basic Web** a flat object with `response_status` at the top level.

## Full Reference

- [Handle the post-payment responses](https://support.paytabs.com/en/support/solutions/articles/60000978877)
- [Signature verification](https://support.paytabs.com/en/support/solutions/articles/60000718961)
- [How to configure IPN](https://support.paytabs.com/en/support/solutions/articles/60000710069)
- [Response_code and Response_status](https://support.paytabs.com/en/support/solutions/articles/60000711358)
