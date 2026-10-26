// Generated with: teachfloor-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTeachfloorSignature } from '../../../lib/verify-teachfloor';

type JsonObject = Record<string, unknown>;

// The body is signed, not trusted: return {} for anything that isn't a plain object.
function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function handleEvent(body: JsonObject): void {
  const type = body.type;
  const data = asObject(body.data);

  switch (type) {
    case 'course.join': {
      const member = asObject(data.member);
      const course = asObject(data.course);
      console.log('Member joined course', { member: member.id, course: course.id });
      // TODO: provision access or add the member to your CRM
      break;
    }

    case 'course.completed': {
      const member = asObject(data.member);
      console.log('Course completed', { member: member.id, data: data.id });
      // TODO: issue a credential or notify the learner
      break;
    }

    case 'course.created':
    case 'course.updated':
      console.log(`Course event (${type})`, data.id);
      break;

    case 'module.created':
    case 'module.updated':
      console.log(`Module event (${type})`, data.id);
      break;

    case 'element.created':
    case 'element.updated':
    case 'element.deleted':
      console.log(`Element event (${type})`, data.id);
      break;

    case 'element.completed': {
      const member = asObject(data.member);
      const context = asObject(data.context);
      console.log('Element completed', { member: member.id, element: context.id, passed: data.passed });
      // TODO: update progress tracking
      break;
    }

    case 'member.login': {
      const member = asObject(data.member);
      console.log('Member logged in', member.id ?? data.id);
      break;
    }

    default:
      console.log(`Unhandled event: ${String(type)}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes received (any content type); the signature covers them.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyTeachfloorSignature(rawBody, request.headers.get('teachfloor-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(body as JsonObject);
  } catch (err) {
    console.error('Error handling Teachfloor event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
