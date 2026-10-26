// Generated with: formio-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFormioRequest } from '../../../lib/verify-formio';

interface FormioPayload {
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  submission?: { _id?: string; data?: Record<string, unknown> };
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

// With the default "Match" request method, Form.io mirrors the operation that triggered the
// action: POST = create, PUT = update, DELETE = delete. There is no event field.
const OPERATIONS: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
  GET: 'read',
};

function handleSubmission(operation: string, payload: FormioPayload, query: URLSearchParams): void {
  // payload: { request, response, submission, params }. DELETE and GET may have no body.
  const submission = payload.submission || {};

  switch (operation) {
    case 'create':
      console.log(`Submission created: ${submission._id}`);
      // TODO: create the matching record in your system (submission.data)
      break;

    case 'update':
      console.log(`Submission updated: ${submission._id}`);
      // TODO: update the matching record
      break;

    case 'delete':
      console.log(`Submission deleted: ${submission._id || query.get('submissionId') || '(see params)'}`);
      // TODO: delete the matching record
      break;

    default:
      console.log(`Unhandled ${operation} request`);
  }
}

async function handler(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyFormioRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="formio-webhook"' } }
    );
  }

  // Read as text so any content type is accepted. GET and some DELETE requests are empty.
  const raw = await request.text();
  let payload: FormioPayload = {};
  if (raw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
    }
    payload = parsed as FormioPayload;
  }

  const operation = OPERATIONS[request.method];
  try {
    handleSubmission(operation, payload, request.nextUrl.searchParams);
  } catch (err) {
    console.error('Error handling Form.io webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, operation });
}

// The request method is chosen in the Webhook action ("Match" mirrors the form operation).
export {
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as GET,
  handler as DELETE,
};
