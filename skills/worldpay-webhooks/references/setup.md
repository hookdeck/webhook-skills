# Setting Up Worldpay Webhooks

## Prerequisites

- An Access Worldpay merchant account and a named **Worldpay Implementation Manager**
- A public HTTPS endpoint, such as `https://example.com/webhooks/worldpay`, whose certificate chains to a trusted public CA

## How Do I Register a Webhook Endpoint?

You don't, at least not yourself. Access Worldpay event webhooks are provisioned by Worldpay: "Contact your Worldpay Implementation Manager to add your webhook URL and enable or disable the events based on your requirement."

Send your Implementation Manager:

1. The endpoint URL, one per environment (Try and Live).
2. The events you want. List them as `classification` + `type` pairs, such as `payment` `authorized`, `payment` `settled` and `payout` `refused`. See [overview.md](overview.md#event-types).
3. A request to **enable the `Event-Signature` header** (next section).

Hosted Payment Pages (HPP) webhooks are the exception: you configure those yourself in the Worldpay dashboard. Keep them separate from Access events.

## How Do I Get the Signing Secret?

Signing is **opt-in**: "you should request an Event-Signature header to be sent with your event." Until you ask, Worldpay sends your events **unsigned**.

- "Contact your Worldpay Implementation Manager to enable the `Event-Signature` header and receive the `shared secret`."
- From the Account Payouts version of the same page: "The signature key is unique per merchant and we share it on a secure channel."
- The secret is a **dedicated signing key**. It is **not** the API username and password you use to call the Access Worldpay REST APIs.
- Note the **keyId** the secret belongs to. It is the first field of each `Event-Signature` entry (`{keyId}/SHA256/{hex}`); the docs' example uses `1`. If you aren't told it, read it from the header of the first signed delivery.

Store it as `WORLDPAY_WEBHOOK_SECRET_<keyId>`:

```bash
WORLDPAY_WEBHOOK_SECRET_1=the-shared-secret-from-worldpay
```

### What Happens During Key Renewal?

"Due to our security policies, the key we use for generating HMAC signatures is subject to periodic renewal." While a renewal is running, every request carries **two** signatures, one per key, comma-separated and in no fixed order. When Worldpay sends you the new key, add it under its own keyId, keep the old one until the renewal is complete, and then remove the old one:

```bash
WORLDPAY_WEBHOOK_SECRET_1=old-key
WORLDPAY_WEBHOOK_SECRET_2=new-key
```

The example handlers try every entry and look up the secret by keyId, so deliveries keep verifying through the renewal.

## What Else Protects the Endpoint? (Defence in Depth)

Worldpay documents two controls besides the HMAC. Both are real and published on docs.worldpay.com. They matter most before signing is enabled.

### Source IP Allowlist (at your WAF)

From [Network access](https://docs.worldpay.com/access/products/events): "The webhooks originate from the following set of IP addresses and the HTTPS port; 443. Ensure your Web Application Firewall(WAF) allows the webhooks to be received for the following addresses. The full set of IP's must be whitelisted for each of your environments."

The 33 addresses listed on 2026-11-25:

```
34.246.73.11    52.215.22.123   52.31.61.0      18.130.125.132  35.176.91.145
52.56.235.128   18.185.7.67     18.185.134.117  18.185.158.215  52.48.6.187
34.243.65.63    3.255.13.18     3.251.36.74     63.32.208.6     52.19.45.138
3.11.50.124     3.11.213.43     3.14.190.43     3.121.172.32    3.125.11.252
3.126.98.120    3.139.153.185   3.139.255.63    13.200.51.10    13.200.56.25
13.232.151.127  34.236.63.10    34.253.172.98   35.170.209.108  35.177.246.6
52.4.68.25      52.51.12.88     108.129.30.203
```

- Configure this **in your WAF or load balancer**, not in application code. Worldpay can add addresses, and a list hardcoded in your code turns that into a silent outage. Re-check the page periodically.
- **Behind Hookdeck**, Hookdeck terminates Worldpay's connection, so allowlist **Hookdeck's** egress IPs at your origin instead of Worldpay's.

### Client Certificate (mTLS) Check (at your reverse proxy)

From [the certificate page](https://docs.worldpay.com/access/products/events/certificate), Worldpay presents a client certificate that you can validate in your reverse proxy:

- "The Subject Common Name of the client certificate - this always contains `Payment Status Event Sender`." In the Try environment it reads `Payment Status Event Sender (secure-test)`.
- "The root of the signing chain - this has the Common Name `UKDC1-PC-PKI02`. The root may occasionally change, and you are notified of any changes."

The page publishes the trust chain inline as PEM. The PEM blocks are FIS-operated CAs (subject `FISGLOBAL RSA PROD SUB CA2`, issuer `FISGLOBAL ROOT CA`, O=`Fidelity National Information Services`), even though the text names the root `UKDC1-PC-PKI02`. Load the PEM from that page as your `ssl_client_certificate`, run `openssl s_client` / `openssl x509` on the chain you actually receive, and **match on the subject CN and the issuer, not a pinned fingerprint**, because the root rotates. The docs' nginx sample follows this pattern:

```nginx
ssl_client_certificate /etc/nginx/worldpay-events-ca.pem;  # PEM from the certificate page
ssl_verify_client on;
ssl_verify_depth 3;

location /webhooks/worldpay {
    if ($ssl_client_s_dn !~ "Payment Status Event Sender") { return 403; }
    if ($ssl_client_i_dn !~ "UKDC1-PC-PKI02") { return 403; }
    proxy_pass http://app;
}
```

Some third-party guides say the client certificate is "issued by Sectigo CA, CN: webhooks.worldpay.com". That is wrong: Sectigo issues the *server* certificate for docs.worldpay.com. Use the names above.

### Your Endpoint's Own TLS Chain

"The webhook destination (URL) must use an encrypted connection (`https`) and a have certificate signed by a trusted certificate authority. Every certificate within the chain, including the root, must be using a certificate signing algorithm of SHA-256 or better." And: "Support for certificate chains involving any certs with the SHA-1 certificate signing algorithm ends March 2026."

## How Do I Use Hookdeck in Front of Worldpay?

1. In Hookdeck, create a source of type **`WORLDPAY`**. Once Worldpay enables `Event-Signature` for your account, set the shared secret on the source.
2. Give your Implementation Manager the Hookdeck source URL as the webhook URL.
3. Point a connection at your handler. Hookdeck verifies `Event-Signature` and rejects bad signatures before delivery, so your handler mostly sees verified traffic. The original `Event-Signature` header is forwarded, so you can still verify it in your handler as defence in depth.
4. **WPG XML:** Hookdeck's ingestion edge answers WPG `<paymentService>` notifications on a `WORLDPAY` source with `200` and the body `[OK]`, so you don't have to. A custom response configured on the source, or `x-hookdeck-response`, takes precedence over that. Hookdeck can't authenticate WPG notifications, because their trust comes from the TLS client certificate and reverse DNS, which a proxy in the middle can't check.

For local testing:

```bash
npx hookdeck-cli listen 3000 worldpay --path /webhooks/worldpay   # FastAPI: 8000
```

## What About WPG (Corporate Gateway) XML Notifications?

The facts in this section come from **Hookdeck's own ingestion edge and source-type definition**. Worldpay's WPG doc pages (`docs.worldpay.com/apis/wpg/...`) render client-side and returned 403 to automated fetches, so nothing here is quoted from them.

- An unsigned `text/xml` POST whose root element is `<paymentService>` (DTD `paymentService_v1`). It may be preceded by a BOM, an XML declaration and a DOCTYPE.
- **No `Event-Signature`.** Authentication happens at the channel level, with a TLS client certificate and/or reverse DNS. Don't write an HMAC verifier for it.
- **Acknowledgement:** Worldpay treats the notification as delivered only when the endpoint returns HTTP `200` with the **literal body `[OK]`**. Anything else counts as a failure. Worldpay retries for up to 7 days and eventually flags the endpoint as failing. If you receive WPG notifications directly, without Hookdeck, this is the most common integration bug.
- Access JSON events, in contrast, accept the `200` and ignore the body.

Use the WPG documentation in your Worldpay merchant portal for element names and journal types.

## Test (Try) vs Live

Access Worldpay has a Try environment (`try.access.worldpay.com`) and a Live environment. Ask your Implementation Manager to configure each one separately, with its own URL, events and signing secret, and allowlist the source IPs for each environment.
