// Generated with: lessonly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLessonlyRequest } from '../../../lib/verify-lessonly';

// Lessonly sends one webhook, "lesson completed", with no event-type field. Fields
// follow the sample payload in Lessonly's Reporting Webhook article.
function handleLessonCompleted(payload: Record<string, unknown>): void {
  const user = (payload.user ?? {}) as Record<string, unknown>;
  const lesson = (payload.lesson ?? {}) as Record<string, unknown>;
  console.log(
    `Lesson completed: lesson ${lesson.id} by user ${user.id} at ${payload.completed_at}`
  );
  // Record the completion here. There is no event ID: key it on user.id,
  // lesson.id and completed_at so a retried request isn't counted twice.
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyLessonlyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleLessonCompleted(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling Lessonly webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
