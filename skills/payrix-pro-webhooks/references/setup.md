# Setting Up Payrix Pro Webhooks

> Set a Header Name and Header Value on each Payrix Pro webhook action. Actions without one send nothing to verify.

## Prerequisites

- A Payrix Pro account with access to create alerts and actions
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 payrix-pro --path /webhooks/payrix-pro` locally)

## Choose Your Header

Pick a header name and a long random value, for example Header Name `X-Payrix-Secret` and Header
Value `replace-with-a-long-random-secret`. Header Value can be anything, including an
authentication scheme such as `Bearer abc123`. Store both:

```bash
PAYRIX_PRO_WEBHOOK_HEADER=X-Payrix-Secret
PAYRIX_PRO_WEBHOOK_SECRET=replace-with-a-long-random-secret   # exact, whole value, incl. any "Bearer "
```

## Register Your Endpoint

1. In the Payrix Pro portal, create the alert for the events you want (see Payrix's
   [Set Up Webhooks](https://resource.payrix.com/docs/set-up-webhooks) page).
2. Add an action and enter your URL in the **Endpoint** field.
3. In the open fields under the Endpoint field, enter the (optional) **Header Name** and **Header
   Value**. Do this on **every** action: an action without them sends nothing to verify.
4. Set the action's format (Content-Type) as needed. The examples handle any content type.
5. Save.

## Hookdeck

In Hookdeck, create a source of type **Payrix Pro** and set **API Key Header** and **API Key** to
the same Header Name and Header Value. Payrix doesn't document the method; a method the source hasn't enabled is rejected, so check the first request and enable its method if needed ([custom methods](https://hookdeck.com/docs/sources#custom-methods)).

## Test

Trigger the alert, or check the header handling with curl (a placeholder body, not a Payrix payload):

```bash
curl -X POST http://localhost:3000/webhooks/payrix-pro \
  -H "Content-Type: application/json" \
  -H "$PAYRIX_PRO_WEBHOOK_HEADER: $PAYRIX_PRO_WEBHOOK_SECRET" \
  -d '{"placeholder":"test body"}'
```

## Network Notes

Payrix doesn't document source IP ranges here, so don't rely on an allowlist. Use HTTPS and the
secret header, and rotate the value if it leaks.
