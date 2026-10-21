// Generated with: azure-logic-apps-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Receiver for outbound calls from an Azure Logic Apps (or Power Automate) HTTP action.
//
// Logic Apps does NOT sign requests. There is no signature header and no HMAC.
// You authenticate the call with a credential the workflow sends:
//
//   Basic authentication : Authorization: Basic base64(username:password)
//   Raw authentication   : Authorization: <whatever you typed in "Value">
//   Custom header        : any header you add under the action's "Headers"
//
// This handler supports Basic (AZURE_LOGIC_APPS_USERNAME / _PASSWORD) and a shared
// secret in a header (AZURE_LOGIC_APPS_SHARED_SECRET, header name from
// AZURE_LOGIC_APPS_SECRET_HEADER). For Raw authentication, set the header name to
// "Authorization" and the secret to the full Raw "Value". Every configured method must
// pass; if nothing is configured the handler fails closed.
//
// There are no event types: the payload is whatever the action's "Body" contains.

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const DEFAULT_SECRET_HEADER = 'x-logic-apps-secret';

function getConfig() {
  return {
    username: process.env.AZURE_LOGIC_APPS_USERNAME || '',
    password: process.env.AZURE_LOGIC_APPS_PASSWORD || '',
    sharedSecret: process.env.AZURE_LOGIC_APPS_SHARED_SECRET || '',
    secretHeader: (process.env.AZURE_LOGIC_APPS_SECRET_HEADER || DEFAULT_SECRET_HEADER).toLowerCase(),
  };
}

// Constant-time string compare. Hashing first gives equal-length buffers, so
// timingSafeEqual never throws and the comparison doesn't leak the secret's length.
function safeEqual(received, expected) {
  const a = crypto.createHash('sha256').update(String(received), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// Verify `Authorization: Basic base64(username:password)`.
function verifyBasicAuth(authorizationHeader, username, password) {
  if (!authorizationHeader) return false;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorizationHeader);
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // the username can't contain ':', the password can
  if (sep === -1) return false;

  // Evaluate both compares so a wrong username takes as long as a wrong password.
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

// Verify a shared secret sent in a header (custom header, or Authorization for Raw auth).
function verifySharedSecret(headerValue, secret) {
  if (!headerValue || !secret) return false;
  return safeEqual(headerValue, secret);
}

// Returns null when the request is authenticated, otherwise { status, error }.
function authenticate(headers, config = getConfig()) {
  const basicConfigured = Boolean(config.username && config.password);
  const secretConfigured = Boolean(config.sharedSecret);

  if (!basicConfigured && !secretConfigured) {
    return { status: 500, error: 'No Azure Logic Apps credentials configured' };
  }
  if (basicConfigured && !verifyBasicAuth(headers.authorization, config.username, config.password)) {
    return { status: 401, error: 'Invalid Basic authentication', basic: true };
  }
  if (secretConfigured && !verifySharedSecret(headers[config.secretHeader], config.sharedSecret)) {
    return { status: 401, error: 'Invalid shared secret' };
  }
  return null;
}

// Logic Apps sends whatever the action's Body is: JSON by default, but it can be text,
// form-urlencoded or multipart. Take the raw bytes and decide how to parse after auth.
app.post(
  '/webhooks/azure-logic-apps',
  express.raw({ type: '*/*', limit: '10mb' }),
  (req, res) => {
    const failure = authenticate(req.headers);
    if (failure) {
      if (failure.basic) res.set('WWW-Authenticate', 'Basic realm="azure-logic-apps"');
      return res.status(failure.status).json({ error: failure.error });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const contentType = req.headers['content-type'] || '';

    let payload = rawBody;
    if (contentType.includes('json') && rawBody.length > 0) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    // There's no event type or delivery id from Logic Apps. If you need either, have the
    // workflow put them in the Body or Headers (e.g. "@{workflow()['run']['name']}").
    console.log('Received Azure Logic Apps workflow call', {
      method: req.method,
      contentType,
      payload,
    });

    // Return 200, not 202: a 202 makes a stateful workflow's HTTP action follow the
    // async polling pattern and poll the Location header.
    return res.status(200).json({ received: true });
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, authenticate, verifyBasicAuth, verifySharedSecret, safeEqual };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/azure-logic-apps`);
  });
}
