# Setting Up Zoho Flow Webhooks

## Prerequisites

- A Zoho Flow account (Zoho offers a 15-day trial with premium features).
- A public HTTPS endpoint. For local development: `npx hookdeck-cli listen 3000 zoho-flow --path /webhooks/zoho-flow`.
- A long random secret, for example `openssl rand -hex 32`.

## Option A: API Key Auth Profile (Reusable)

### 1. Create the auth profile

1. Go to **Settings > Auth Profiles** and click **Create**.
2. Select the **API Key** authentication method.
3. Enter an **Auth Profile Name**, a **Field Label** (what you'll see when creating a connection, e.g. "Webhook secret") and the **Parameter Name**, e.g. `X-Webhook-Secret`.
4. Set **API Key Placement** to the **header**. Body or query placement won't reach a header check.
5. Click **Save**.

You can't change the authentication method of a saved auth profile.

### 2. Create a connection

1. Go to **Settings > Connections** and click **Create Connection**.
2. Select your auth profile under **Auth Profiles** and click **Next**.
3. Enter a **Connection Name**, and the secret in the field you labelled.
4. Click **Authorize**.

### 3. Configure the Send Webhook action

1. In the **Builder**, go to **Logic > Webhooks** and drag **Send Webhook** into the flow.
2. Choose **Use a connection** and pick the connection.
3. Pick the **Request** method and enter the **HTTP URL**, e.g. `https://example.com/webhooks/zoho-flow`.
4. Add body parameters (map values from earlier steps), choose **Content-Type** JSON, and pick a **Response Type**.
5. Click **Save**, then **Test**.

## Option B: No Authentication, Header on the Action

1. Add **Send Webhook** and choose **No Authentication**.
2. Pick the method and enter the URL.
3. In the header fields, add Param Name `X-Webhook-Secret` and Param Value set to your secret.
4. Add the body, choose the Content-Type, **Save**, then **Test**.

This is quicker for one flow. The secret is stored on the action, so every flow that calls your endpoint needs its own copy; Option A keeps it in one connection.

## Configure Your App

```bash
ZOHO_FLOW_WEBHOOK_HEADER=X-Webhook-Secret
ZOHO_FLOW_WEBHOOK_SECRET=your-random-secret
```

**Hookdeck:** on a Zoho Flow source (`ZOHO_FLOW`), enter the same header name and value. Verification is optional on the source. The source pre-selects POST; allow the action's method if it's another one.

## Test

**Test** on the action sends a real request. With the Hookdeck CLI you can inspect the headers and body:

```bash
npx hookdeck-cli listen 3000 zoho-flow --path /webhooks/zoho-flow
```

If the response is JSON and the Response Type is JSON or Auto, the keys in your response become variables for later steps after the first successful test.

## Rotating the Secret

Update the value on the connection (or the action), and accept both the old and new values in your handler for the switch-over. Flow sends one value at a time.
