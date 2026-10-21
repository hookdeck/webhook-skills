// Generated with: fillout-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Fillout does NOT sign webhooks: there is no signature header and no HMAC.
// Authentication is the custom header you add in Fillout under
// Integrate > Webhook > Advanced > Headers:  Authorization: Bearer <token>
// Compare the WHOLE header value against `Bearer ${FILLOUT_WEBHOOK_TOKEN}`.
function verifyFilloutAuth(authorizationHeader, token) {
  if (!token) return false; // fail closed when the token is not configured
  if (typeof authorizationHeader !== 'string') return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers
  const a = crypto.createHash('sha256').update(authorizationHeader).digest();
  const b = crypto.createHash('sha256').update(`Bearer ${token}`).digest();
  return crypto.timingSafeEqual(a, b);
}

// Fillout has no event types; every delivery is a form submission. The body is
// either the full submission (Simple mode / API-created webhooks: submissionId,
// submissionTime, questions[], calculations[], urlParameters[], ...) or, in
// Advanced mode, a flat object of the keys you mapped in the Body section.
function parseFilloutPayload(body) {
  const submission =
    body.submission && typeof body.submission === 'object' ? body.submission : body;
  if (Array.isArray(submission.questions)) {
    return { kind: 'submission', submission };
  }
  return { kind: 'mapped', fields: body };
}

// Look answers up by question id: the question `name` is its text and changes
// when someone edits the form.
function answersById(questions) {
  return Object.fromEntries(questions.map((q) => [q.id, q.value]));
}

// Retry integration, resubmits and edits all resend the same submissionId.
// Use a database or cache in production; a Set is enough to show the idea.
const processed = new Set();

function dedupeKey(payload) {
  if (payload.kind === 'submission') {
    const { submissionId, lastUpdatedAt } = payload.submission;
    return submissionId ? `${submissionId}:${lastUpdatedAt || ''}` : null;
  }
  return payload.fields.submissionId ? String(payload.fields.submissionId) : null;
}

function handleSubmission(submission) {
  const answers = answersById(submission.questions);
  console.log(
    `Form submission ${submission.submissionId} at ${submission.submissionTime}:`,
    answers
  );

  for (const booking of submission.scheduling || []) {
    const { fullName, email, eventStartTime } = booking.value || {};
    console.log(`Booking by ${fullName} <${email}> starting ${eventStartTime}`);
  }
  for (const payment of submission.payments || []) {
    console.log(`Payment ${payment.value?.paymentId} received`);
  }
  if (submission.quiz) {
    console.log(`Quiz score ${submission.quiz.score}/${submission.quiz.maxScore}`);
  }
  // TODO: save the submission, notify your team, etc.
}

function handleMappedFields(fields) {
  console.log('Form submission (Advanced mode mapped body):', fields);
  // TODO: read the keys you mapped in Fillout's Body section
}

// express.raw so we authenticate before parsing and can return 400 on bad JSON
app.post('/webhooks/fillout', express.raw({ type: '*/*' }), (req, res) => {
  const token = process.env.FILLOUT_WEBHOOK_TOKEN;
  if (!token) {
    console.error('FILLOUT_WEBHOOK_TOKEN is not set; rejecting webhook');
    return res.status(500).json({ error: 'Webhook token not configured' });
  }

  if (!verifyFilloutAuth(req.headers.authorization, token)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  let body;
  try {
    body = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  const payload = parseFilloutPayload(body);
  const key = dedupeKey(payload);
  if (key && processed.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    if (payload.kind === 'submission') {
      handleSubmission(payload.submission);
    } else {
      handleMappedFields(payload.fields);
    }
  } catch (err) {
    console.error('Error handling Fillout submission:', err);
    return res.status(500).json({ error: 'Processing failed' });
  }

  if (key) processed.add(key);
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Fillout webhook server listening on port ${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/webhooks/fillout`);
  });
}

module.exports = { app, verifyFilloutAuth, parseFilloutPayload, answersById, processed };
