# Setting Up Worldline Webhooks

The two platforms are configured in different places. Use the section for yours.

## Prerequisites

- A Worldline Connect account (Configuration Center access) **or** a Worldline Direct account (Merchant Portal access)
- A public **HTTPS** URL for your handler that serves both `GET` and `POST` on the same path (for example `/webhooks/worldline`) and doesn't redirect

## Worldline Connect

### Get your webhooks key

1. In the **Configuration Center**, open **webhooks keys** and choose **request webhooks key**.
2. Store the **key id** as `WORLDLINE_WEBHOOK_KEY_ID` and the **secret key** as `WORLDLINE_WEBHOOK_SECRET`.

This key is separate from your REST API key. The docs explain why: "For security it's best to have 'separate keys for separate things' … the webhooks key does not expire, but the REST API key does." Webhooks keys belong to the **account**, not to a merchant ID: "Since webhooks keys are defined per account they are used to sign the messages of all our listed merchant IDs. You do not need to create a webhooks key per merchant ID."

### Register your endpoint

1. Select the **merchant ID**, then open its **webhooks** page and choose **add endpoint**.
2. Enter the HTTPS URL and choose **all** event types or a subset (see [overview.md](overview.md#worldline-connect-event-types)).
3. **Connect immediately sends a GET to the URL** with a random string in `X-GCS-Webhooks-Endpoint-Verification`. Your handler must return that string, and nothing else, as a `text/plain` body. All three examples do this.
4. If the GET fails, the endpoint is still added, but as **deactivated**. Fix the handler, then use the endpoint's **activate** action, which sends the verification GET again. "The endpoint will start receiving messages a couple of minutes after it has been successfully activated."

Limits: "You can add up a maximum of five endpoints per merchant ID. You can only have one endpoint subscribed to a specific event." Also: "Webhooks can take up to 10 minutes to react to changes you made in the Configuration Center."

### Rotate the webhooks key

Connect can hold more than one webhooks key, and "the messages will be signed with the key that has been added first, so the oldest key is what we'll use." To rotate:

1. Request a new key. Put it in `WORLDLINE_WEBHOOK_KEY_ID` / `WORLDLINE_WEBHOOK_SECRET`, and move the old one to `WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS` / `WORLDLINE_WEBHOOK_SECRET_PREVIOUS`.
2. Deploy. Messages keep arriving signed with the **old** key, and the handler finds it by `X-GCS-KeyId`.
3. Delete the old key in the Configuration Center. Messages switch to the new key.
4. Remove the `_PREVIOUS` variables.

### Send a test webhook

**Configuration Center → Webhooks → Actions → Test** sends a real, signed POST with a dummy event. "When testing a webhook through the Configuration Center, the id property will have the prefix TEST." The examples acknowledge `TEST…` ids with 200 and skip processing. Do the same in any handler that writes to production state.

### Add a custom header (optional, defence in depth)

Integration Dashboards → **webhooks header** adds a secret HTTP header to every webhook request. Set `WORLDLINE_CUSTOM_HEADER_NAME` / `WORLDLINE_CUSTOM_HEADER_VALUE` and the examples will check it, in constant time, **after** the HMAC. Constraints from the docs:

- The name "must use the X- prefix (mandatory)", and it can't override `X-GCS-*` headers.
- The value can be at most 256 characters.
- It applies to **all** webhook requests from your account, not to one endpoint.
- It can take up to 10 minutes to propagate.

Worldline introduced these headers to "replace IP whitelist functionality that was lost during cloud migration". If an old integration's IP allowlist stopped working, that's the reason.

### Source IPs

**Connect** publishes no IP list. The Connect FAQ says: "Please do not use IP whitelisting restrictions, as our setup uses dynamic IP addresses." If your firewall must restrict by source, allow the DNS name **`webhooks-incoming-ipadresses.connect.worldline-solutions.com`** (spelled that way in the docs) and re-resolve it about every 10 minutes. This domain is documented for Connect only.

**Direct** is different: its webhooks page asks you "to whitelist our IP range as described in our Firewall documentation", and links to its [firewall configuration page](https://docs.direct.worldline-solutions.com/en/security-and-risk-management/security/firewall-configuration), which lists Worldline's ranges (webhooks among the covered uses; the page calls the lists non-exhaustive). An allowlist there is an extra layer. The HMAC check stays the primary authentication on both platforms.

## Worldline Direct

### Get your webhooks key

1. In the **Merchant Portal**, go to **Developer → Webhooks**.
2. Click **Generate webhooks keys**, or enter your own Webhook ID and Secret Webhook Key.
3. Copy the secret **at once: it is shown for 60 seconds only**. Store the id as `WORLDLINE_WEBHOOK_KEY_ID` and the secret as `WORLDLINE_WEBHOOK_SECRET`.

Generating a new pair "will create a new pair and revoke the existing one immediately". Direct has no overlap window, so deploy the new secret straight away. The Back Office and the Merchant Portal share one key/secret data set, synced in real time.

### Register your endpoint

You can set endpoint URLs in two places:

- **Merchant Portal:** up to five fixed URLs on the same Webhooks page.
- **Per transaction:** `feedbacks.webhooksUrls` on `CreateHostedCheckout` / `CreatePayment`, an array of up to five strings. Sending it overrides the portal URLs. `feedbacks.webhookUrl` (singular) is deprecated.

Group-level configuration exists through the e-Portal. Transaction-level URLs override PSPID and group URLs, and PSPID credentials override group credentials. **Worldline sends nothing until there is both a URL and a valid key/secret pair.**

Direct documents **no GET verification handshake**. The examples answer one anyway, which does no harm.

### Test your setup

- **`ValidateWebhookCredentials`**: send `{ "key": "<webhooks key id>", "secret": "<base64 HMAC-SHA256 of the empty string under your webhooks secret>" }`. Docs: "Use exclusively hashing algorithm HMAC 256 for your test." Compute the value with:
  ```bash
  printf '' | openssl dgst -sha256 -hmac "$WORLDLINE_WEBHOOK_SECRET" -binary | base64
  ```
- **`SendTestWebhook`**: send `{ "url": "https://…/webhooks/worldline" }`. `url` is optional; leave it out and Worldline uses the URL configured in your account. Worldline POSTs a dummy event to the URL and returns `204` if your endpoint answered 2xx. The test message has type `payment.test`, which is not in the event table. The examples treat it as an unknown type and acknowledge it with `200`.

`ValidateWebhookCredentials` works because the signature covers only the body, so an empty body has a valid signature too. Your handler still has to reject an empty POST (`400`), because a correctly signed empty body is not an event.

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 worldline --path /webhooks/worldline
# FastAPI
npx hookdeck-cli listen 8000 worldline --path /webhooks/worldline
```

Register the printed HTTPS URL as your endpoint, then send a test event (Connect: Configuration Center → Test; Direct: `SendTestWebhook`).

## Using Hookdeck in Front

1. Create a Hookdeck source of type **`WORLDLINE`** and give it your webhooks secret key.
2. Point the Worldline endpoint URL at the Hookdeck source URL, and point a Hookdeck destination at your handler.

What Hookdeck does and doesn't do here:

- Hookdeck verifies `X-GCS-Signature` (HMAC-SHA256, base64) against **one** stored secret. It doesn't use `X-GCS-KeyId` to pick the secret. Keep the Hookdeck source secret on the key Worldline is currently signing with (the oldest on Connect). When you delete that key in the Configuration Center, update the source secret at the same time. On Direct, regenerating revokes the old pair immediately, so update the source straight away. Your own handler can still look the secret up by `X-GCS-KeyId`, as the examples do.
- Hookdeck answers the Connect verification GET itself for `WORLDLINE` sources: it echoes `X-GCS-Webhooks-Endpoint-Verification` as `text/plain`, so the endpoint activates without your handler seeing the GET. Your handler's GET route is only needed when Worldline calls it directly. A generic (non-`WORLDLINE`) source can opt in by adding `?x-hookdeck-provider=worldline` to its URL.

## Frameworks with CSRF Protection

Worldline sends no CSRF token. The Connect FAQ addresses this directly ("My web framework expects CSRF tokens, but webhooks does not send these"). Exempt the webhook route from CSRF middleware (Django `@csrf_exempt`, Rails `skip_forgery_protection`, Laravel `VerifyCsrfToken::$except`, and so on). The HMAC check is what authenticates the request.
