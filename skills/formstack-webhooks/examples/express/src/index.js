// Generated with: formstack-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Header carrying the HMAC digest. `X-FS-Signature` is the DEFAULT, but the WebHook's
// "Custom HMAC Header" field overrides it — the Formstack help article: "If left blank,
// X-FS-Signature will be used as the HMAC header." So never hardcode it.
// Lowercase: Express lowercases incoming header names.
const DEFAULT_SIGNATURE_HEADER = 'x-fs-signature';

function signatureHeaderName() {
  return (process.env.FORMSTACK_SIGNATURE_HEADER || DEFAULT_SIGNATURE_HEADER).toLowerCase();
}

/**
 * Verify a Formstack WebHook delivery.
 *
 * Formstack computes HMAC-SHA256 over the RAW request body bytes, keyed with the
 * per-WebHook "HMAC Key", rendered as LOWERCASE HEX. Nothing else is signed — no
 * timestamp, no nonce, no URL, no method.
 *
 * NOT FastSpring. FastSpring (fastspring.com, unrelated company) uses the same
 * `X-FS-Signature` header name with a BASE64 digest and an `events[]` envelope.
 * If you write `.digest('base64')` here, you have the wrong provider.
 *
 * Fails CLOSED: a missing key or missing header is a rejection, never an accept.
 * Signing is optional and off by default in Formstack, which makes "no secret, accept
 * anyway" tempting — it would let anyone who knows the URL post fake submissions.
 *
 * @param {Buffer|string} rawBody         Raw, unparsed request body
 * @param {string|undefined} signatureHeader  Value of the HMAC header
 * @param {string|undefined} hmacKey      The WebHook's HMAC Key
 * @returns {boolean}
 */
function verifyFormstackWebhook(rawBody, signatureHeader, hmacKey) {
  if (!signatureHeader || !hmacKey) return false;

  // Formstack sends `sha256=<hex>`. Strip the prefix case-insensitively (a bare digest is
  // tolerated too), trim, and normalise case before comparing.
  const received = signatureHeader.trim().replace(/^sha256=/i, '').trim().toLowerCase();
  const expected = crypto.createHmac('sha256', hmacKey).update(rawBody).digest('hex');

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Guard the length first — timingSafeEqual throws on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Stash the exact bytes before any parser touches them.
 *
 * THIS IS THE WHOLE BALLGAME for Formstack. The default content type is
 * `application/x-www-form-urlencoded` and the digest covers the RAW urlencoded bytes,
 * not a re-encoded form of the parsed dict. Re-encoding reorders keys and re-escapes
 * characters, and the digest will never match.
 */
const saveRawBody = (req, res, buf) => {
  req.rawBody = buf;
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Formstack WebHook endpoint.
 *
 * BOTH parsers are mounted because the content type is chosen per WebHook
 * (`contentType`: `urlencoded` — the default — or `json`), and one endpoint is commonly
 * pointed at several forms configured by different people. Each parser is a no-op when
 * the request's content type doesn't match, so chaining them covers both.
 */
// The limit is raised from body-parser's 100kb default because a WebHook set to
// `fileTransferType: base64encode` inlines uploaded files in the body. At the default a
// delivery like that is rejected with a 413 before this handler ever runs, which reads as
// a Formstack delivery failure rather than a limit you chose. Size it to your largest
// expected upload.
const BODY_LIMIT = process.env.FORMSTACK_BODY_LIMIT || '10mb';

app.post(
  '/webhooks/formstack',
  express.urlencoded({ extended: true, limit: BODY_LIMIT, verify: saveRawBody }),
  express.json({ limit: BODY_LIMIT, verify: saveRawBody }),
  (req, res) => {
    const rawBody = req.rawBody;

    // No parser claimed the request, so we never captured the bytes the HMAC covers.
    // Without them verification is impossible — reject rather than guess.
    if (!Buffer.isBuffer(rawBody)) {
      console.error('Unsupported content type — expected urlencoded or JSON');
      return res.status(400).send('Unsupported content type');
    }

    const headerName = signatureHeaderName();
    const signature = req.headers[headerName];

    if (!signature) {
      console.error(`Missing ${headerName} header`);
      return res.status(400).send('Missing signature header');
    }

    const hmacKey = process.env.FORMSTACK_HMAC_KEY;

    // FAIL CLOSED on misconfiguration. 500 (not 400) so the operator can tell
    // "my server is misconfigured" apart from "someone sent a bad signature".
    if (!hmacKey) {
      console.error('FORMSTACK_HMAC_KEY is not set — refusing to accept unverified webhooks');
      return res.status(500).send('Webhook secret not configured');
    }

    // 1. Verify BEFORE using the parsed body. The HMAC is the only credential Formstack
    //    sends (the WebHook Shared Secret is a separate, weaker, bearer-style token).
    if (!verifyFormstackWebhook(rawBody, signature, hmacKey)) {
      console.error('Formstack webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // 2. The parsed body is safe to use now. It is a FLAT map of field key -> value,
    //    where the keys are the FORM'S OWN field labels (or IDs, depending on the
    //    WebHook's `postDataFieldKeys` setting), so the schema differs per form and
    //    cannot be hardcoded. Read everything defensively.
    const fields = req.body && typeof req.body === 'object' ? req.body : {};

    // There is NO event type in a Formstack webhook — no event header, no event body
    // field, no event names. A WebHook fires on exactly one thing: a form submission.
    // The discriminator is the FORM.
    const formId = fields.FormID !== undefined ? String(fields.FormID) : undefined;
    const uniqueId = fields.UniqueID !== undefined ? String(fields.UniqueID) : undefined;

    console.log(`✓ Verified Formstack submission (FormID=${formId}, UniqueID=${uniqueId})`);

    // 3. Acknowledge quickly. Formstack publishes no retry policy or delivery timeout,
    //    so assume nothing and get out of the way.
    res.status(200).json({ received: true });

    // 4. Do the real work after responding.
    //
    //    IDEMPOTENCY IS REQUIRED. Nothing but the body is signed — no timestamp, no
    //    nonce — so a captured delivery replays indefinitely and no staleness check is
    //    possible. Deduplicate on UniqueID, falling back to a hash of the raw body.
    const idempotencyKey =
      uniqueId || crypto.createHash('sha256').update(rawBody).digest('hex');

    setImmediate(() => {
      try {
        handleSubmission(formId, fields, idempotencyKey);
      } catch (err) {
        console.error(`Error handling submission ${idempotencyKey}:`, err);
      }
    });
  }
);

/**
 * Per-form handlers, keyed on FormID — NOT on an event type, because Formstack has none.
 *
 * Replace these IDs with your own forms'. Every key is optional: the payload shape is
 * whatever the form's fields are called, and a form editor can change it at any time.
 */
const FORM_HANDLERS = {
  // '1234567': handleContactForm,
  // '7654321': handleOrderForm,
};

function handleSubmission(formId, fields, idempotencyKey) {
  // TODO: check idempotencyKey against your store and return early if already processed.
  //   if (await store.has(idempotencyKey)) return;

  const handler = FORM_HANDLERS[formId];

  if (handler) {
    handler(fields, idempotencyKey);
    return;
  }

  // Default branch. A form you don't recognise is normal — someone may have pointed a
  // new form at this endpoint. Log it, don't fail, and never return non-2xx for it.
  const fieldKeys = Object.keys(fields).filter((k) => k !== 'FormID' && k !== 'UniqueID');
  console.log(`📝 Submission from form ${formId} with ${fieldKeys.length} field(s):`);
  for (const key of fieldKeys) {
    console.log(`   ${key} = ${formatValue(fields[key])}`);
  }

  // To find out exactly which fields a given form will send, ask Formstack:
  //   GET https://www.formstack.com/api/v2025/forms/{formId}/webhooks/openapi
  // It returns a generated OpenAPI schema for THAT form's webhook payload.
}

/**
 * Values are usually strings, but `extended: true` urlencoded parsing can produce nested
 * objects/arrays for bracketed keys, and JSON WebHooks can send anything.
 */
function formatValue(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Formstack webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/formstack`);
    console.log(`Reading signature from: ${signatureHeaderName()}`);
    if (!process.env.FORMSTACK_HMAC_KEY) {
      console.warn('⚠️  Warning: FORMSTACK_HMAC_KEY not set — every delivery will be rejected');
      console.warn('   Set an HMAC Key on the WebHook in Formstack first, or nothing is signed');
    }
  });
}

module.exports = { app, server, verifyFormstackWebhook };
