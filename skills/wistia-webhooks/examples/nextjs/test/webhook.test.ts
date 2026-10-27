import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The secret_key entered in Wistia is used as-is (UTF-8 bytes)
const SECRET = 'wistia_test_secret_key';
process.env.WISTIA_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/wistia/route';

// Wistia's real algorithm: lowercase hex HMAC-SHA256 of the raw POST body
function sign(rawBody: string | Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

let counter = 0;
function delivery(events: Array<{ type: string; payload: unknown }>) {
  return {
    hook: { uuid: 'a4ab9eb6-ab82-4dae-86f2-29f744f7d031' },
    events: events.map((e) => ({
      uuid: `evt-${Date.now()}-${counter++}`,
      metadata: { account_id: '0sxav1wj8o' },
      generated_at: '2024-03-31T21:56:45Z',
      ...e,
    })),
  };
}

const media = {
  duration: 40.207,
  id: 'vpe2p82q64',
  name: 'Lenny Delivers Video!',
  thumbnail: { url: 'https://embed-ssl.wistia.com/deliveries/e96ea382701bc172657d90bf269211beddbf6f7f.jpg?image_crop_resized=200x120' },
  url: 'https://harper.wistia.com/medias/vpe2p82q64',
};

function post(body: string | Buffer, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/wistia', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })
  );
}

describe('Wistia webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a media.ready delivery with a valid signature', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const res = await post(body, { 'x-wistia-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith('Media ready:', 'vpe2p82q64');
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.created', payload: { media } }]));
    const res = await post(body, { 'x-wistia-signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('handles every event in a batched delivery', async () => {
    const body = JSON.stringify(delivery([
      { type: 'media.created', payload: { media } },
      { type: 'viewing_session.play', payload: { visitor: { id: 'v1' }, viewing_session: { id: 's1' }, media } },
      { type: 'viewing_session.percent_watched', payload: { percent_watched: 25, viewing_session: { id: 's1' }, media } },
    ]));
    const res = await post(body, { 'x-wistia-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Media created:', 'vpe2p82q64');
    expect(logSpy).toHaveBeenCalledWith('Play:', 's1', 'vpe2p82q64');
    expect(logSpy).toHaveBeenCalledWith('Percent watched:', 25, 'vpe2p82q64');
  });

  it('handles live_event.registration', async () => {
    const body = JSON.stringify(delivery([
      { type: 'live_event.registration', payload: { live_event: { id: 'abc123xyz' }, registration: { fields: { email: 'lenny@wistia.com' } } } },
    ]));
    const res = await post(body, { 'x-wistia-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Live event registration:', 'abc123xyz');
  });

  it('ignores a redelivered event uuid', async () => {
    const body = JSON.stringify({
      hook: { uuid: 'h' },
      events: [{ uuid: 'dup-1', type: 'media.deleted', payload: { media: { id: 'f5diqltruh' } }, generated_at: '2024-03-30T15:57:05Z' }],
    });
    const headers = { 'x-wistia-signature': sign(body) };
    expect((await post(body, headers)).status).toBe(200);
    expect((await post(body, headers)).status).toBe(200);
    expect(logSpy.mock.calls.filter((c) => c[0] === 'Media deleted:')).toHaveLength(1);
  });

  it('accepts unknown event types without failing', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.something_new', payload: {} }]));
    const res = await post(body, { 'x-wistia-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies the body for any content type', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const res = await post(body, { 'content-type': 'text/plain', 'x-wistia-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not a decoded string', async () => {
    const body = '{"hook":{"uuid":"h"},"events":[],"note":"café"}';
    const raw = Buffer.from(body, 'utf8');
    const res = await post(raw, { 'x-wistia-signature': sign(raw) });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header with 401', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    expect((await post(body)).status).toBe(401);
  });

  it('rejects an empty signature header with 401', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    expect((await post(body, { 'x-wistia-signature': '' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    expect((await post(body, { 'x-wistia-signature': sign(body, 'other_secret') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const signature = sign(body);
    const tampered = body.replace('vpe2p82q64', 'zzzzzzzzzz');
    expect((await post(tampered, { 'x-wistia-signature': signature })).status).toBe(401);
  });

  it('rejects malformed signatures (prefix, wrong length, non-hex)', async () => {
    const body = JSON.stringify(delivery([{ type: 'media.ready', payload: { media } }]));
    const good = sign(body);
    for (const bad of [`sha256=${good}`, good.slice(0, 62), `${good}00`, 'z'.repeat(64)]) {
      expect((await post(body, { 'x-wistia-signature': bad })).status).toBe(401);
    }
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, { 'x-wistia-signature': sign(body) })).status).toBe(400);
  });

  it('returns 400 for a validly signed body without an events array', async () => {
    const body = JSON.stringify({ hook: { uuid: 'h' } });
    expect((await post(body, { 'x-wistia-signature': sign(body) })).status).toBe(400);
  });
});
