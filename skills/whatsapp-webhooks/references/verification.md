# How to Verify WhatsApp Webhook Signatures

WhatsApp webhooks are **Meta Graph API webhooks**: they use the same GET
verification handshake and the same `X-Hub-Signature-256` signature as every other
Meta product (Facebook Pages, Instagram, Messenger).

> **Canonical algorithm lives in the Meta reference.** The signature scheme, the
> manual Node.js/Python verifiers, the timing-safe comparison, and the generic
> gotchas + debugging table are documented once, canonically, in
> [facebook-webhooks → references/verification.md](https://github.com/hookdeck/webhook-skills/blob/main/skills/facebook-webhooks/references/verification.md).
> This file covers only what is **specific to WhatsApp**. (A short, copy-ready
> verifier is also inlined in [SKILL.md](../SKILL.md) so you never have to leave
> the skill to verify a request.)

## WhatsApp-specific details

- **Secrets** — the GET handshake matches your `WHATSAPP_VERIFY_TOKEN`; the POST
  signature is keyed on your Meta **app secret** (`WHATSAPP_APP_SECRET`). Two
  different values for two different steps.
- **The `whatsapp` npm SDK does not verify webhooks.** Meta's official `whatsapp`
  Node.js SDK is built for **sending** messages via the Cloud API — it exposes no
  webhook HMAC verification, so verify manually with the shared algorithm.
- **Dedupe by `wamid`.** Retries (up to **7 days**, decreasing frequency) are
  delivered to **every** subscribed app, and a single POST may batch up to 1000
  entries (payloads up to 3 MB). Dedupe on the `wamid...` message/event id.
- **Live mode + TLS.** Some WhatsApp webhooks only fire once the app is in **Live**
  mode, and Meta requires a valid TLS certificate on the callback URL.

## The GET handshake (WhatsApp env vars)

Identical to the shared Meta handshake — respond only when `hub.mode === "subscribe"`
**and** `hub.verify_token` matches your stored token, echoing back the raw
`hub.challenge` as plain text (no JSON, no quotes); otherwise return `403`.

```javascript
// Express
app.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge); // echo challenge as plain text
  }
  return res.sendStatus(403);
});
```

## WhatsApp-specific debugging

| Symptom | Likely cause |
|---------|--------------|
| Handshake never succeeds | Returning JSON instead of the raw `hub.challenge`, or verify token mismatch |
| Signature always invalid | Body parsed before verifying (unicode re-escaping), or using the verify token instead of the app secret — see the [canonical gotchas](https://github.com/hookdeck/webhook-skills/blob/main/skills/facebook-webhooks/references/verification.md#common-gotchas) |
| Works locally, fails in prod | App not in Live mode, or a proxy re-serialized the body |
| Intermittent duplicates | Normal — dedupe by the `wamid...` message/event id |
