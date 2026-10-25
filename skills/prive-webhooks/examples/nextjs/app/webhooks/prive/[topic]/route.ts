// Generated with: prive-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest } from 'next/server';
import { receivePriveWebhook, TOPICS } from '../../../../lib/prive';

// One endpoint per topic: /webhooks/prive/billing-attempts-failed, etc.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ topic: string }> }
) {
  const { topic: slug } = await params;
  const topic = Object.hasOwn(TOPICS, slug) ? TOPICS[slug] : undefined;
  if (!topic) {
    return Response.json({ error: 'Unknown topic' }, { status: 404 });
  }
  return receivePriveWebhook(request, topic);
}
