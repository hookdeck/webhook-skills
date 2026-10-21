// Generated with: microsoft-dynamics-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

// Dynamics 365 (Dataverse) webhooks are registered with the Plug-in Registration Tool.
//
//   1. They are NOT signed. There is no signature header, HMAC or timestamp.
//      Register the webhook with the HttpHeader authentication option
//      (e.g. `X-Webhook-Secret: <hex>`) and compare it in constant time.
//   2. The body is a serialized RemoteExecutionContext. The event is `MessageName`
//      (Create, Update, Delete) and the table is `PrimaryEntityName`.

const WEBHOOK_PATH = '/webhooks/microsoft-dynamics';
const DEFAULT_HEADER = 'X-Webhook-Secret';

// MessageName values this handler covers.
const EVENTS = {
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
};

const app = express();

/**
 * Compare the shared secret from the HttpHeader authentication option in constant time.
 *
 * @param {unknown} headerValue - value of the configured header
 * @returns {boolean} true when it matches DYNAMICS_WEBHOOK_SECRET
 * @throws {Error} when DYNAMICS_WEBHOOK_SECRET is not configured (fail closed)
 */
function verifyDynamicsSecret(headerValue) {
  const expected = process.env.DYNAMICS_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('DYNAMICS_WEBHOOK_SECRET is not set');
  }
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Dataverse serializes attributes as [{ key, value }, ...]. Flatten to an object.
 */
function flattenAttributes(entity) {
  const out = {};
  if (entity && Array.isArray(entity.Attributes)) {
    for (const { key, value } of entity.Attributes) out[key] = value;
  }
  return out;
}

/**
 * Find the Target entity in InputParameters ([{ key, value }, ...]).
 * Returns undefined when absent (e.g. payloads over 256 KB drop InputParameters).
 */
function getTarget(context) {
  if (!Array.isArray(context.InputParameters)) return undefined;
  const entry = context.InputParameters.find((p) => p && p.key === 'Target');
  return entry ? entry.value : undefined;
}

/**
 * Dataverse has no delivery ID, so build a dedupe key from OperationId and the
 * registered step (OwningExtension.Id).
 */
function dedupeKey(context) {
  if (!context.OperationId) return null;
  const stepId = (context.OwningExtension && context.OwningExtension.Id) || '';
  return `${context.OperationId}:${stepId}`;
}

// --- Event handlers ---------------------------------------------------------

async function handleCreate(context) {
  const attrs = flattenAttributes(getTarget(context));
  console.log(`${context.PrimaryEntityName} created: ${context.PrimaryEntityId} ${attrs.fullname ?? attrs.name ?? ''}`);
  // TODO: create the record in your system.
}

async function handleUpdate(context) {
  const attrs = flattenAttributes(getTarget(context));
  console.log(`${context.PrimaryEntityName} updated: ${context.PrimaryEntityId} changed=${Object.keys(attrs).join(',') || 'n/a'}`);
  // TODO: sync the change. Update carries only the changed attributes, so upsert
  // on PrimaryEntityId or re-fetch the row from the Web API.
}

async function handleDelete(context) {
  console.log(`${context.PrimaryEntityName} deleted: ${context.PrimaryEntityId}`);
  // TODO: remove or archive the record.
}

/**
 * Dispatch on MessageName.
 *
 * @returns {Promise<boolean>} whether the event was recognised
 */
async function dispatch(context) {
  switch (context.MessageName) {
    case EVENTS.CREATE:
      await handleCreate(context);
      return true;
    case EVENTS.UPDATE:
      await handleUpdate(context);
      return true;
    case EVENTS.DELETE:
      await handleDelete(context);
      return true;
    default:
      // A step for a message this app doesn't handle. Acknowledge it.
      console.warn(`Unhandled Dataverse message: ${context.MessageName}`);
      return false;
  }
}

// --- Route ------------------------------------------------------------------

/**
 * Check the shared-secret header BEFORE the body is read.
 */
function requireDynamicsSecret(req, res, next) {
  const headerName = process.env.DYNAMICS_WEBHOOK_HEADER || DEFAULT_HEADER;
  let ok;
  try {
    // req.get() is case-insensitive.
    ok = verifyDynamicsSecret(req.get(headerName));
  } catch (err) {
    console.error(`Dynamics webhook misconfigured: ${err.message}`);
    return res.status(500).send('Webhook secret not configured');
  }
  if (!ok) {
    console.error(`Dynamics webhook rejected: ${headerName} missing or wrong`);
    return res.status(401).send('Invalid webhook secret');
  }
  return next();
}

// Raw body for any content type; we parse JSON ourselves after the secret check.
app.post(
  WEBHOOK_PATH,
  requireDynamicsSecret,
  express.raw({ type: '*/*' }),
  async (req, res) => {
    let context;
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      context = JSON.parse(text);
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    if (!context || typeof context !== 'object' || typeof context.MessageName !== 'string') {
      return res.status(400).send('Missing MessageName');
    }

    console.log(
      `Dynamics webhook: ${context.MessageName} ${context.PrimaryEntityName ?? 'n/a'} key=${dedupeKey(context)}` +
        (req.get('x-ms-dynamics-msg-size-exceeded') ? ' (payload over 256 KB: InputParameters removed)' : '')
    );

    try {
      await dispatch(context);
    } catch (err) {
      console.error(`Dynamics webhook processing failed: ${err.message}`);
      // Non-2xx fails a synchronous step; 502/503/504 are retried once.
      return res.status(500).send('Processing failed');
    }

    return res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, EVENTS, verifyDynamicsSecret, flattenAttributes, getTarget, dedupeKey, dispatch };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  if (!process.env.DYNAMICS_WEBHOOK_SECRET) {
    console.warn('DYNAMICS_WEBHOOK_SECRET is not set: every delivery will get a 500 (fail closed).');
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
