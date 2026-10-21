// Generated with: gravity-forms-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import {
  dedupeKey,
  fieldValues,
  parseEntry,
  verifyGravityFormsSecret,
  type GravityFormsEntry,
} from '../../../lib/gravity-forms';

// Gravity Forms has no event types: every delivery is a form submission.
// Use a database or cache in production; a Set is enough to show the idea.
// Map the entry `id` in the feed's Select Fields mode to be able to deduplicate.
const processed = new Set<string>();

function handleSubmission(entry: GravityFormsEntry) {
  console.log(
    `Form submission: form ${entry.form_id ?? '(unmapped)'}, entry ${entry.id ?? '(unmapped)'}`,
    fieldValues(entry)
  );
  // TODO: route on entry.form_id, save the entry, notify your team, etc.
}

export async function POST(request: NextRequest) {
  const secret = process.env.GRAVITY_FORMS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GRAVITY_FORMS_WEBHOOK_SECRET is not set; rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Authenticate before reading the body
  const headerName = process.env.GRAVITY_FORMS_WEBHOOK_HEADER || 'x-webhook-secret';
  if (!verifyGravityFormsSecret(request.headers.get(headerName), secret)) {
    return NextResponse.json(
      { error: 'Invalid or missing webhook secret header' },
      { status: 401 }
    );
  }

  let entry: GravityFormsEntry;
  try {
    entry = parseEntry(await request.text(), request.headers.get('content-type'));
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const key = dedupeKey(entry);
  if (key && processed.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleSubmission(entry);
  } catch (err) {
    console.error('Error handling Gravity Forms submission:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  if (key) processed.add(key);
  return NextResponse.json({ received: true });
}
