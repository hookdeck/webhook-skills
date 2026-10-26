# How to Verify SAP SuccessFactors Webhook Requests

## How It Works

SAP SuccessFactors does not sign requests. There is no signature header, no HMAC, and no
timestamp. The REST connection sends HTTP Basic credentials:

```
Authorization: Basic base64(username:password)
```

Your endpoint authenticates the request by comparing that pair with the one you configured.

> Use Basic authentication on the Integration Center REST destination. Hookdeck never answers with a 401 challenge, so the credentials have to arrive with each request; if deliveries show as failed verification, they are not.

## What This Does and Doesn't Give You

A static shared credential authenticates the **sender, not the body**, and gives **no replay
protection**: anyone who captures one request can replay it. Use HTTPS, keep the credentials out of
logs, and rotate them (in Integration Center and in your environment) if they leak.

## Implementation

Parse and compare as follows (see the examples for the full handlers):

1. Match `Authorization` against `^basic +([^ ]+)$`, case-insensitive on the scheme.
2. Accept only the strict base64 alphabet and decode strictly (`validate=True` in Python; a
   canonical re-encode check in Node), so valid credentials followed by junk are rejected.
3. Split the decoded text on the **first** colon; the password may contain colons.
4. Compare the username and password **each in constant time** and evaluate **both** before
   deciding.

Node: hash both sides with SHA-256 (or check lengths) and use `crypto.timingSafeEqual` on
equal-length Buffers. Python: `hmac.compare_digest` on **bytes**; encode both sides first, because
passing `str` raises `TypeError` on non-ASCII input.

Missing or malformed header, or any mismatch, returns `401`. If either configured value is empty,
reject everything.

## Common Gotchas

- **Credentials not arriving.** Hookdeck never answers with a 401 challenge, so a client that only
  sends credentials after a `WWW-Authenticate` response never authenticates. The docs don't say
  whether SAP sends Basic preemptively; if deliveries show as failed verification, check this.
- **Read the body raw.** Use `express.raw({ type: '*/*' })`, `request.text()` or
  `await request.body()` so JSON, XML and any other content type works. Authenticate first, parse second.
- **GET and POST.** The sender picks the method; accept both and handle an empty body. Hookdeck's
  source pre-selects POST, so allow any other method on the source.
- **401 and 403 stop the integration** in Integration Center, even with Execute with Exceptions on.
  Retries happen only for `429`, `500`, `503` and `504`.
- **OAuth** is not covered by Hookdeck's source.

## Debugging 401s

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Env vars unset or empty, or the pair differs from Integration Center |
| 401 only for some passwords | Password contains characters your tooling mangles; check the first-colon split and UTF-8 handling |
| 401 with no `Authorization` header logged | Authentication Type isn't Basic, or the client waits for a challenge Hookdeck never sends |
| 401 after rotating | Updated one side only; change both together |
| 400 after authenticating | Content type says JSON but the body isn't valid JSON |
