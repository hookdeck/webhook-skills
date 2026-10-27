import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/pinata/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'webhook' (Standard Webhooks names, what Pinata sends) or 'svix' (Svix names for the same values)
function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string>; contentType?: string; prefix?: string } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'webhook';
  const headers = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/pinata', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

// Bodies follow Pinata's event catalog (https://event-types.pinata.cloud/). The two CAR-import events name
// the event `event` instead of `event_type`.
const events: Record<string, Record<string, unknown>> = {
  "ipfs.private.file_added": {"event_type": "ipfs.private.file_added", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
  "ipfs.private.file_updated": {"event_type": "ipfs.private.file_updated", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "previous_attributes": {"name": "old-pinata.png"}}},
  "ipfs.private.file_deleted": {"event_type": "ipfs.private.file_deleted", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
  "ipfs.public.file_added": {"event_type": "ipfs.public.file_added", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "source": "direct_upload"}},
  "ipfs.public.file_updated": {"event_type": "ipfs.public.file_updated", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "previous_attributes": {"name": "old-pinata.png"}}},
  "ipfs.public.file_deleted": {"event_type": "ipfs.public.file_deleted", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
  "ipfs.public.car_import_succeeded": {"event": "ipfs.public.car_import_succeeded", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mimetype": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
  "ipfs.public.car_import_failed": {"event": "ipfs.public.car_import_failed", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"error": "invalid CAR", "file_id": "11111111-1111-1111-1111-111111111111"}},
  "ipfs.public.pin_by_cid_added": {"event_type": "ipfs.public.pin_by_cid_added", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "date_queued": "2025-02-05T17:15:20.839Z", "group_id": "11111111-1111-1111-1111-111111111111", "host_nodes": ["/ip4/123.456.78.90/tcp/4001/ipfs/QmAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQr"], "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "name": "my awesome file", "status": "prechecking"}}},
  "ipfs.public.pin_by_cid_succeeded": {"event_type": "ipfs.public.pin_by_cid_succeeded", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"new_file": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "date_queued": "2025-02-05T17:15:20.839Z", "group_id": "11111111-1111-1111-1111-111111111111", "host_nodes": ["/ip4/123.456.78.90/tcp/4001/ipfs/QmAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQr"], "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "name": "my awesome file", "status": "prechecking"}}},
  "ipfs.public.pin_by_cid_failed": {"event_type": "ipfs.public.pin_by_cid_failed", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "date_queued": "2025-02-05T17:15:20.839Z", "group_id": "11111111-1111-1111-1111-111111111111", "host_nodes": ["/ip4/123.456.78.90/tcp/4001/ipfs/QmAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQr"], "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "name": "my awesome file", "status": "expired"}}},
};

describe('Pinata webhook handler', () => {
  beforeEach(() => {
    process.env.PINATA_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, body) => {
    const res = await send(JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'ipfs.public.something_new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('ipfs.public.something_new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify(events['ipfs.public.file_added']), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(JSON.stringify(events['ipfs.public.file_added']), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'ipfs.public.file_added' });
  });

  test('rejects an invalid signature sent with svix-* headers', async () => {
    const res = await send('{"event_type":"ipfs.public.file_added"}', { prefix: 'svix', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'ipfs.public.file_added' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await send('{}', { headers: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"event_type":"ipfs.public.file_added"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"ipfs.public.file_added"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"ipfs.public.file_deleted"}', msgId, timestamp);
    const res = await send('{"event_type":"ipfs.public.file_added"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"ipfs.public.file_added"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.PINATA_WEBHOOK_SECRET;
    const res = await send('{"event_type":"ipfs.public.file_added"}');
    expect(res.status).toBe(500);
  });
});
