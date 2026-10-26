# Setting Up Envoy Webhooks

## Prerequisites

- An Envoy account with access to the developer dashboard and an Envoy app
  (public or private)
- A public HTTPS endpoint (for local development, run
  `npx hookdeck-cli listen 3000 envoy --path /webhooks/envoy`)

## Get Your Signing Secret

Envoy has no separate webhook secret. It signs every webhook with your **Envoy
app's client secret** (shown on the app in the Envoy dashboard). Save it as
`ENVOY_CLIENT_SECRET`.

If you receive Envoy webhooks through Hookdeck, create an Envoy source and paste
that client secret into its webhook signing secret field: Hookdeck verifies
`X-Envoy-Signature` with it before forwarding.

## Register Your Endpoint

1. Go to the **Apps** page in the Envoy dashboard.
2. Click **Configure** on the **Webhooks** card.
3. Under **Events**, select the event types you want (for example
   `entry_sign_in`, `entry_sign_out`, `invite_created`).
4. Enter the full URL of your endpoint in **Webhook URLs**.
5. Click **Complete Setup**.

### Optional HTTP Basic auth

You can also protect the endpoint with HTTP Basic authentication by entering the
username and password as `username:password`; Envoy sends it in the request's
`Authorization` header. It is separate from signature verification and these
examples do not check it. Keep verifying `X-Envoy-Signature` either way.

## Test and Debug

Sign a test visitor in (or create an invite) at a location of an account that
has installed your app and watch for the delivery. Some events (`desk_sign_in`,
`ticket_created`) are in beta and may not be enabled on your account.
