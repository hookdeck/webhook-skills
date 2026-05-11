import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Notion webhook signature.
 *
 * Notion sends `X-Notion-Signature: sha256=<hex>` where the hex is the
 * HMAC-SHA256 of the raw request body, keyed with the verification_token
 * captured during the one-time handshake.
 */
export function verifyNotionSignature(
  rawBody: string,
  signatureHeader: string | null,
  verificationToken: string | undefined
): boolean {
  if (!signatureHeader || !verificationToken) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', verificationToken)
    .update(rawBody)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Use raw text — re-serialising parsed JSON would change the bytes Notion
  // signed and break verification.
  const rawBody = await request.text();
  const signature = request.headers.get('x-notion-signature');
  const token = process.env.NOTION_VERIFICATION_TOKEN;

  // Handshake: the first delivery to a new subscription has no signature and
  // the body is { "verification_token": "secret_..." }. Surface it so the
  // developer can paste it into the Notion UI.
  if (!signature) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed.verification_token === 'string') {
        console.log(
          'Notion verification_token (paste this into the Notion UI):',
          parsed.verification_token
        );
        return NextResponse.json({ received: true });
      }
    } catch {
      // fall through to 400
    }
    return NextResponse.json(
      { error: 'Missing X-Notion-Signature' },
      { status: 400 }
    );
  }

  if (!verifyNotionSignature(rawBody, signature, token)) {
    console.error('Notion signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: {
    id?: string;
    type?: string;
    entity?: { id?: string; type?: string };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  console.log(`Received ${event.type} (id: ${event.id})`);

  switch (event.type) {
    case 'page.content_updated':
      console.log('Page content updated:', event.entity?.id);
      // TODO: re-index the page, sync content, etc.
      break;

    case 'page.properties_updated':
      console.log('Page properties updated:', event.entity?.id);
      // TODO: react to status changes, recompute derived fields, etc.
      break;

    case 'page.created':
      console.log('Page created:', event.entity?.id);
      break;

    case 'page.deleted':
      console.log('Page deleted:', event.entity?.id);
      break;

    case 'page.locked':
      console.log('Page locked:', event.entity?.id);
      break;

    case 'page.moved':
      console.log('Page moved:', event.entity?.id);
      break;

    case 'comment.created':
      console.log('Comment created:', event.entity?.id);
      break;

    case 'data_source.schema_updated':
      console.log('Data source schema updated:', event.entity?.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
