# Setting Up eBay Webhooks

## Prerequisites

- An [eBay Developers Program](https://developer.ebay.com/) account with an
  application keyset (App ID / Client ID, Cert ID / Client Secret, Dev ID).
- A **public HTTPS** endpoint (for local development, use a tunnel — see below).
- A **verification token** you generate: **32–80 characters**, using only
  `A-Z a-z 0-9 _ -`. Keep it secret; you configure the same value on eBay and in
  your app (`EBAY_VERIFICATION_TOKEN`).

## There Are Two Configuration Paths

### 1. Marketplace Account Deletion (developer portal UI)

For `MARKETPLACE_ACCOUNT_DELETION` specifically, configure it in the eBay
**Developer Portal**:

1. Go to **Developer Portal → Application Keys**.
2. Next to your keyset, open **"Alerts and Notifications"**.
3. Choose **Marketplace Account Deletion/Closure Notifications**.
4. Enter:
   - **Notification Endpoint URL** — the exact HTTPS URL eBay will call (this is
     your `EBAY_ENDPOINT`).
   - **Verification token** — your 32–80 char token (`EBAY_VERIFICATION_TOKEN`).
5. Click **Save**. eBay immediately sends a **challenge** GET request to your
   endpoint (see below). Your server must be running and reachable, and must
   return the correct `challengeResponse`, or the save fails.

You may also **opt out** here if you do not store eBay user data — but you must
do one or the other.

### 2. Other topics (Notification API)

For all other topics, use the **Notification API** programmatically:

1. **`getTopics`** / **`getTopic`** — discover available topics and the OAuth
   scopes each requires.
2. **`createDestination`** (`POST /commerce/notification/v1/destination`) —
   register your endpoint. The body includes your endpoint URL and the
   `verificationToken`. eBay validates the endpoint with the challenge flow.
3. **`createSubscription`** (`POST /commerce/notification/v1/subscription`) —
   subscribe a destination to a topic.

## Endpoint Challenge Validation (happens on every save)

When you save a destination (either path above), eBay calls:

```
GET https://<your-endpoint>?challenge_code=<random_code>
```

Your endpoint must respond **HTTP 200** with `Content-Type: application/json`
and this body:

```json
{ "challengeResponse": "<hex>" }
```

where `<hex>` is the **SHA-256** hash, hex-encoded, of the concatenation:

```
challengeCode + verificationToken + endpoint
```

**The order is mandatory.** `endpoint` is the exact URL you registered (scheme +
host + path, e.g. `https://your-domain.com/webhooks/ebay`) — it must match
character-for-character. See [verification.md](verification.md) for the code.

## Get Your Public Key Credentials

Per-notification signatures are verified with a public key fetched from eBay's
[`getPublicKey`](https://developer.ebay.com/api-docs/commerce/notification/resources/public_key/methods/getPublicKey)
method:

```
GET https://api.ebay.com/commerce/notification/v1/public_key/{public_key_id}
```

This call requires an **application access token** (OAuth client-credentials
grant) built from your `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`. The
`{public_key_id}` is the `kid` from the `x-ebay-signature` header. **Cache the
returned key ~1 hour** keyed by `kid`; do not call `getPublicKey` on every
notification or you will hit rate limits.

## Sandbox vs Production

| | Base host |
|---|---|
| Sandbox | `api.sandbox.ebay.com` |
| Production | `api.ebay.com` |

Set `EBAY_ENV=sandbox` or `EBAY_ENV=production`. Use the matching keyset — a
production `kid` cannot be resolved against the sandbox host.

## Test It

- Save/re-save the destination to re-trigger the challenge.
- Fire test account-deletion notifications from the developer portal's
  Marketplace Account Deletion screen.
- Locally:

  In Hookdeck Event Gateway, create an **eBay** source with your keyset's Client
  ID and Client Secret and the same verification token you give eBay, then
  forward that source to your machine (`ebay` is the source's name):

  ```bash
  hookdeck listen 3000 ebay --path /webhooks/ebay
  ```

  Register the source URL as your eBay destination endpoint. The eBay source
  answers eBay's challenge itself, so the challenge route in this code isn't
  called in that setup; the tests cover it.
