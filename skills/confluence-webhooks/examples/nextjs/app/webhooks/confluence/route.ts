// Generated with: confluence-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const secret = process.env.CONFLUENCE_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse('CONFLUENCE_WEBHOOK_SECRET is not set', { status: 500 });
  }

  const signature = request.headers.get('x-hub-signature');
  if (!signature) {
    return new NextResponse('Missing X-Hub-Signature header', { status: 400 });
  }

  // Raw text body: the signature covers the exact bytes sent, whatever the content type.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, signature, secret)) {
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let payload: { event?: string; [key: string]: any };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // The event name is in the body's "event" field.
  switch (payload.event) {
    case 'page_created':
      console.log('Page created:', payload.page?.id);
      break;
    case 'page_updated':
      console.log('Page updated:', payload.page?.id);
      break;
    case 'page_removed':
      console.log('Page removed (trashed):', payload.page?.id);
      break;
    case 'blog_created':
      console.log('Blog post created:', payload.blog?.id);
      break;
    case 'comment_created':
      console.log('Comment created:', payload.comment?.id);
      break;
    case 'space_created':
      console.log('Space created:', payload.space?.key);
      break;
    default:
      console.log('Unhandled event:', payload.event);
  }

  return NextResponse.json({ received: true });
}
