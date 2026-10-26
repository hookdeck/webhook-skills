# Setting Up Form.io Webhooks

## Prerequisites

- A Form.io project with permission to edit a form's **Actions**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 formio --path /webhooks/formio` locally)

## Choose the Credentials

Pick a username and a long random password, and store them as `FORMIO_WEBHOOK_USERNAME` and
`FORMIO_WEBHOOK_PASSWORD`. Form.io has no generated secret; you choose both values.

## Register Your Endpoint

1. Open the form and go to **Actions**.
2. Add the **Webhook** action.
3. Set **Request URL** to your endpoint (e.g. `https://example.com/webhooks/formio`).
4. Set **Request Method** to **Match** (or blank) to receive POST for creates, PUT for updates
   and DELETE for deletes. A fixed method sends every operation with that verb.
5. Enter the username in **Authorize User** and the password in **Authorize Password**. Form.io
   sends them as `Authorization: Basic base64(username:password)`.
6. Leave **Forward Headers** off unless you need them. Optionally set **Retry Request**.
7. Save the action.

**Additional Headers** (for example your own `Authorization` header) is an alternative way to send
a credential; this skill covers the Basic auth fields.

## Test

Webhooks only run when the form is used, not in the Developer Portal's form builder. Launch the
form with the FormviewPro Application or embed it in an app, submit it, then update and delete the
submission. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/formio \
  -u "$FORMIO_WEBHOOK_USERNAME:$FORMIO_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"submission":{"_id":"62e052a316f1ad4f786d4038","data":{"textField":"Test value"}},"params":{"formId":"62a745944e836ccf1c0ba167"}}'
```

Form.io also publishes an example [Webhook Receiver](https://github.com/formio/formio-webhook-receiver).

## Using Hookdeck

Hookdeck's Form.io source pre-selects POST only. Allow **PUT** and **DELETE** (and PATCH or GET if
your action uses them) on the source, or update and delete requests are rejected.

## Network Notes

Form.io calls your endpoint from its own servers, so rely on HTTPS plus the Basic credentials.
