# Dojah Webhooks Overview

## What Are Dojah Webhooks?

Dojah is an African identity verification, KYC/KYB and AML platform. You subscribe a callback URL to a
**service**; when a matching event occurs Dojah sends an HTTP `POST` with a JSON body to that URL. Respond
`200` to acknowledge receipt. Retries and the delivery timeout are not documented.

Subscriptions are per service and per environment (Live or Sandbox). Documented services:

| Service | Delivers |
|---------|----------|
| `kyc_widget` | Result of a hosted flow (EasyOnboard) session |
| `sms` | SMS delivery events |
| `address` | Address verification events |
| `AML Monitoring` | AML monitoring hits |

For hosted flows the webhook, not the client callback (`onSuccess` / `onError` / `onClose`), is the
authoritative result. Never grant access from the browser alone.

## Event Types

Dojah has **no event-name field or header**. The URL is subscribed to one service, so dispatch on the body.
For `kyc_widget`, use `verification_status`:

| `verification_status` | Triggered When | Common Use Cases |
|-----------------------|----------------|------------------|
| `Ongoing` | The user started the flow and is still working through it | Nothing yet |
| `Pending` | Every step was submitted; outcome awaits a check or manual review | Hold the user in review |
| `Completed` | The session finished and a result is available | Inspect `status` and each step before deciding |
| `Failed` | The verification could not be completed | Let the user retry |
| `Abandoned` | The user left the flow before finishing | Prompt the user to resume |

Only `Completed`, `Failed` and `Abandoned` are terminal. **`Completed` means finished, not passed**: check the
top-level `status` and each step's `status` inside `data` (a session can be `Completed` while `address.status`
or `aml.status` is `false`).

## Event Payload Structure

Fields are at the top level (no `entity` wrapper). A `kyc_widget` event has three layers:

```json
{
  "reference_id": "DJ-92F24FA662",
  "widget_id": "6a551c4bd6d8a5b39c456c0a",
  "verification_status": "Completed",
  "status": true,
  "message": "Successfully completed the verification.",
  "id_type": "NIN",
  "value": "123456789",
  "verification_mode": "LIVENESS",
  "verification_type": "DL_ID",
  "selfie_url": "https://files.dojah.io/dojah-images/selfie_sample_image_1720624219.jpg?...",
  "verification_pdf": "https://files.dojah.io/dojah-files/1788185624685-25170.pdf?...",
  "aml": { "status": false },
  "data": {
    "user_data": { "data": { "first_name": "John" }, "message": "", "status": true },
    "selfie": { "data": { "liveness_score": null }, "message": "...", "status": true }
  },
  "metadata": { "ipinfo": { "country": "Nigeria" } }
}
```

- Top level: the summary (`reference_id`, `verification_status`, `status`, the ID captured and links to files).
- `data`: one key per step, each with its own `status`, `message` and `data`.
- `metadata`: session context such as geo-IP details and anything you passed when launching the flow.
- `reference_id` is the value you supplied when launching the flow: use it to match the user.
- File URLs are pre-signed and expire after about an hour.

Payloads for the `sms`, `address` and `AML Monitoring` services have their own shapes; see Dojah's docs.

## Full Event Reference

See [Dojah's webhooks and signatures documentation](https://docs.dojah.io/api-reference/core-concepts/webhooks-signatures).
