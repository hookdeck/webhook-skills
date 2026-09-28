// Generated with: circleci-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');

// CircleCI's Secret token is a plain string you type into the webhook form. It
// is used as UTF-8 bytes directly -- no prefix, no base64.
const TEST_SECRET = 'circleci_test_signing_secret';
const WRONG_SECRET = 'not_the_signing_secret';

process.env.CIRCLECI_WEBHOOK_SECRET = TEST_SECRET;

const request = require('supertest');
const { app, verifyCircleCISignature, extractVcsInfo } = require('../src');

// --- Fixtures ---------------------------------------------------------------

// workflow-completed, GitHub OAuth pipeline (carries `pipeline.vcs`).
// Straight from CircleCI's outbound webhooks reference.
const WORKFLOW_COMPLETED = {
  id: '3888f21b-eaa7-38e3-8f3d-75a63bba8895',
  type: 'workflow-completed',
  happened_at: '2021-09-01T22:49:34.317Z',
  webhook: { id: 'cf8c4fdd-0587-4da1-b4ca-4846e9640af9', name: 'Sample Webhook' },
  project: {
    id: '84996744-a854-4f5e-aea3-04e2851dc1d2',
    name: 'webhook-service',
    slug: 'github/circleci/webhook-service',
  },
  organization: { id: 'f22b6566-597d-46d5-ba74-99ef5bb3d85c', name: 'circleci' },
  workflow: {
    id: 'fda08377-fe7e-46b1-8992-3a7aaecac9c3',
    name: 'build-test-deploy',
    created_at: '2021-09-01T22:49:03.616Z',
    stopped_at: '2021-09-01T22:49:34.170Z',
    url: 'https://app.circleci.com/pipelines/github/circleci/webhook-service/130/workflows/fda08377-fe7e-46b1-8992-3a7aaecac9c3',
    status: 'success',
  },
  pipeline: {
    id: '1285fe1d-d3a6-44fc-8886-8979558254c4',
    number: 130,
    created_at: '2021-09-01T22:49:03.544Z',
    trigger: { type: 'webhook' },
    vcs: {
      provider_name: 'github',
      origin_repository_url: 'https://github.com/circleci/webhook-service',
      target_repository_url: 'https://github.com/circleci/webhook-service',
      revision: '1dc6aa69429bff4806ad6afe58d3d8f57e25973e',
      commit: {
        subject: 'Description of change',
        body: 'More details about the change',
        author: { name: 'Author Name', email: 'author.email@example.com' },
        authored_at: '2021-09-01T22:48:53Z',
        committer: { name: 'Committer Name', email: 'committer.email@example.com' },
        committed_at: '2021-09-01T22:48:53Z',
      },
      branch: 'main',
    },
  },
};

// job-completed adds `job` -- and its `workflow` has NO `status`.
const JOB_COMPLETED = {
  ...WORKFLOW_COMPLETED,
  id: '8bd71c28-4969-3677-8940-3e3a61c46660',
  type: 'job-completed',
  workflow: (() => {
    const { status, ...rest } = WORKFLOW_COMPLETED.workflow;
    return rest;
  })(),
  job: {
    id: '8b91f9a8-7975-4e60-916c-f0152ccbc937',
    name: 'test',
    started_at: '2021-09-01T22:49:28.841Z',
    stopped_at: '2021-09-01T22:49:34.170Z',
    status: 'success',
    number: 136,
  },
};

// GitLab / GitHub App pipelines carry trigger_parameters and NO vcs.
const GITLAB_PIPELINE = {
  id: '5678fe1d-d3a6-44fc-8886-8979558254c4',
  number: 42,
  created_at: '2026-09-28T10:00:00.000Z',
  trigger: { type: 'gitlab' },
  // trigger_parameters verbatim from CircleCI's "workflow-completed for GitLab
  // and GitHub App" sample in the outbound webhooks reference.
  trigger_parameters: {
    gitlab: {
      web_url: 'https://gitlab.com/circleci/hello-world',
      commit_author_name: 'Commit Author',
      user_id: '9534789',
      user_name: 'User name',
      user_username: 'username',
      branch: 'main',
      commit_title: 'Update README.md',
      commit_message: 'Update README.md',
      repo_url: 'git@gitlab.com:circleci/hello-world.git',
      user_avatar: 'https://secure.gravatar.com/avatar',
      type: 'push',
      project_id: '33852820',
      ref: 'refs/heads/main',
      repo_name: 'hello-world',
      commit_author_email: 'committer.email@example.com',
      checkout_sha: '850a1519f25d14e968649cc420d1bd381715c05c',
      commit_timestamp: '2022-04-13T11:10:16+00:00',
      commit_sha: '850a1519f25d14e968649cc420d1bd381715c05c',
    },
    git: {
      tag: '',
      checkout_sha: '850a1519f25d14e968649cc420d1bd381715c05c',
      ref: 'refs/heads/main',
      branch: 'main',
      checkout_url: 'git@gitlab.com:circleci/hello-world.git',
    },
    circleci: {
      event_time: '2022-04-13T11:10:18.349Z',
      actor_id: '6a19122c-40e0-4d56-a875-aac6ccc27700',
      event_type: 'push',
      trigger_type: 'gitlab',
    },
  },
};

const JSON_TYPE = 'application/json';

/** Sign exactly as CircleCI does: HMAC-SHA256 hex over the RAW BODY ONLY. */
function sign(body, secret = TEST_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/** Build the `circleci-signature` header value for a body. */
function signatureHeader(body, secret = TEST_SECRET) {
  return `v1=${sign(body, secret)}`;
}

/** Give each delivery a fresh event id so the dedupe cache doesn't interfere. */
function freshBody(event, overrides = {}) {
  return JSON.stringify({ ...event, id: crypto.randomUUID(), ...overrides });
}

/** POST a signed delivery through the real Express stack. */
function post(body, { signature, eventType } = {}) {
  const req = request(app).post('/webhooks/circleci').set('Content-Type', JSON_TYPE);

  const sig = signature === undefined ? signatureHeader(body) : signature;
  if (sig !== null) req.set('circleci-signature', sig);

  let type = eventType;
  if (type === undefined) {
    try {
      type = JSON.parse(body).type;
    } catch {
      type = undefined;
    }
  }
  if (type) req.set('circleci-event-type', type);

  return req.send(body);
}

// --- Documented known-answer vectors ----------------------------------------
//
// From CircleCI's "Validate webhooks" guide. These pin the algorithm itself,
// independently of any framework body handling.

describe('documented test vectors', () => {
  const VECTORS = [
    ['hello world', 'secret', '734cc62f32841568f45715aeb9f4d7891324e6d948e4c6c60c0621cdac48623a'],
    ['lalala', 'another-secret', 'daa220016c8f29a8b214fbfc3671aeec2145cfb1e6790184ffb38b6d0425fa00'],
    [
      'an-important-request-payload',
      'hunter123',
      '9be2242094a9a8c00c64306f382a7f9d691de910b4a266f67bd314ef18ac49fa',
    ],
    ['foo', 'secret', '773ba44693c7553d6ee20f61ea5d2757a9a4f4a44d2841ae4e95b52e4cd62db4'],
  ];

  it.each(VECTORS)('body %p with secret %p produces the documented v1 digest', (body, secret, expected) => {
    expect(crypto.createHmac('sha256', secret).update(body).digest('hex')).toBe(expected);
    expect(verifyCircleCISignature(Buffer.from(body), `v1=${expected}`, secret)).toBe(true);
  });

  it('rejects each documented vector under a different secret', () => {
    for (const [body, secret, expected] of VECTORS) {
      expect(verifyCircleCISignature(Buffer.from(body), `v1=${expected}`, `${secret}x`)).toBe(false);
    }
  });

  it('produces a 64-character lowercase hex digest, not base64', () => {
    const digest = sign('hello world', 'secret');
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

// --- Signature verification -------------------------------------------------

describe('signature verification', () => {
  it('accepts a correctly signed workflow-completed delivery', async () => {
    const body = freshBody(WORKFLOW_COMPLETED);
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a correctly signed job-completed delivery', async () => {
    const body = freshBody(JOB_COMPLETED);
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = freshBody(WORKFLOW_COMPLETED);
    const res = await post(body, { signature: signatureHeader(body, WRONG_SECRET) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('rejects a tampered body', async () => {
    const body = freshBody(WORKFLOW_COMPLETED);
    const signature = signatureHeader(body);
    // Flip "success" to "failed" after signing -- the classic forgery.
    const tampered = JSON.stringify({
      ...JSON.parse(body),
      workflow: { ...WORKFLOW_COMPLETED.workflow, status: 'failed' },
    });

    const res = await post(tampered, { signature });
    expect(res.status).toBe(400);
  });

  it('rejects a delivery with no circleci-signature header', async () => {
    // CircleCI's Secret token is OPTIONAL in the UI, so unsigned deliveries are
    // possible. They must be refused, never trusted.
    const res = await post(freshBody(WORKFLOW_COMPLETED), { signature: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing signature header');
  });

  it('fails closed when no secret is configured', () => {
    const body = JSON.stringify(WORKFLOW_COMPLETED);
    expect(verifyCircleCISignature(Buffer.from(body), signatureHeader(body), undefined)).toBe(false);
    expect(verifyCircleCISignature(Buffer.from(body), signatureHeader(body), '')).toBe(false);
  });

  it('returns 500 (not 200) when CIRCLECI_WEBHOOK_SECRET is unset', async () => {
    const saved = process.env.CIRCLECI_WEBHOOK_SECRET;
    delete process.env.CIRCLECI_WEBHOOK_SECRET;
    try {
      const res = await post(freshBody(WORKFLOW_COMPLETED));
      // 500 makes CircleCI retry once the secret is set; a 200 would silently
      // swallow real events.
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook secret not configured');
    } finally {
      process.env.CIRCLECI_WEBHOOK_SECRET = saved;
    }
  });

  it('does not throw on a wrong-length signature', () => {
    // crypto.timingSafeEqual throws on mismatched lengths; the length guard
    // must run first or this becomes a 500 that CircleCI retries.
    const body = JSON.stringify(WORKFLOW_COMPLETED);
    expect(() => verifyCircleCISignature(Buffer.from(body), 'v1=short', TEST_SECRET)).not.toThrow();
    expect(verifyCircleCISignature(Buffer.from(body), 'v1=short', TEST_SECRET)).toBe(false);
  });

  it('rejects a base64 digest (CircleCI uses hex)', () => {
    const body = JSON.stringify(WORKFLOW_COMPLETED);
    const b64 = crypto.createHmac('sha256', TEST_SECRET).update(body).digest('base64');
    expect(verifyCircleCISignature(Buffer.from(body), `v1=${b64}`, TEST_SECRET)).toBe(false);
  });

  it('rejects a digest computed over timestamp.body (no prefix is signed)', () => {
    // CircleCI signs the RAW BODY ALONE -- no timestamp, no id, no delimiter.
    const body = JSON.stringify(WORKFLOW_COMPLETED);
    const ts = Math.floor(Date.now() / 1000);
    const prefixed = crypto.createHmac('sha256', TEST_SECRET).update(`${ts}.${body}`).digest('hex');
    expect(verifyCircleCISignature(Buffer.from(body), `v1=${prefixed}`, TEST_SECRET)).toBe(false);
  });

  it('rejects a secret that was base64-decoded before use', () => {
    // The secret is used as UTF-8 bytes DIRECTLY. Base64-decoding it first (the
    // habit picked up from whsec_-style providers) is a bug. Uses a secret that
    // happens to be valid base64 so the wrong path actually runs.
    const b64Secret = 'Y2lyY2xlY2ktc2VjcmV0'; // base64 of "circleci-secret"
    const body = JSON.stringify(WORKFLOW_COMPLETED);

    const correct = crypto.createHmac('sha256', b64Secret).update(body).digest('hex');
    const wrong = crypto
      .createHmac('sha256', Buffer.from(b64Secret, 'base64'))
      .update(body)
      .digest('hex');

    expect(correct).not.toBe(wrong);
    expect(verifyCircleCISignature(Buffer.from(body), `v1=${correct}`, b64Secret)).toBe(true);
    expect(verifyCircleCISignature(Buffer.from(body), `v1=${wrong}`, b64Secret)).toBe(false);
  });

  it('handles non-ASCII bodies (multi-byte UTF-8)', () => {
    const body = JSON.stringify({
      ...WORKFLOW_COMPLETED,
      pipeline: {
        ...WORKFLOW_COMPLETED.pipeline,
        vcs: {
          ...WORKFLOW_COMPLETED.pipeline.vcs,
          commit: { ...WORKFLOW_COMPLETED.pipeline.vcs.commit, subject: 'fix: émoji 👋 support' },
        },
      },
    });
    const raw = Buffer.from(body, 'utf8');
    expect(verifyCircleCISignature(raw, signatureHeader(body), TEST_SECRET)).toBe(true);
  });
});

// --- Versioned signature list -----------------------------------------------

describe('circleci-signature versioned list', () => {
  const body = JSON.stringify(WORKFLOW_COMPLETED);

  it('accepts v1=<valid>,v2=garbage', () => {
    // "Only check the latest signature type" -- unknown versions are ignored,
    // not tripped over.
    const header = `v1=${sign(body)},v2=garbage`;
    expect(verifyCircleCISignature(Buffer.from(body), header, TEST_SECRET)).toBe(true);
  });

  it('accepts v1 wherever it appears in the list', () => {
    const header = `v0=deadbeef,v1=${sign(body)},v2=garbage,v3=more-garbage`;
    expect(verifyCircleCISignature(Buffer.from(body), header, TEST_SECRET)).toBe(true);
  });

  it('rejects v2=<valid-sha256> alone with no v1 entry (downgrade attack)', () => {
    // v2/v3 do not exist yet and their algorithm is unknown. Falling back to
    // one is exactly the downgrade the docs warn against.
    const header = `v2=${sign(body)}`;
    expect(verifyCircleCISignature(Buffer.from(body), header, TEST_SECRET)).toBe(false);
  });

  it('rejects when only unknown versions are present', () => {
    const valid = sign(body);
    expect(
      verifyCircleCISignature(Buffer.from(body), `v2=${valid},v3=${valid}`, TEST_SECRET)
    ).toBe(false);
  });

  it('tolerates whitespace around the comma-separated pairs', () => {
    const header = ` v1 = ${sign(body)} , v2 = garbage `;
    expect(verifyCircleCISignature(Buffer.from(body), header, TEST_SECRET)).toBe(true);
  });

  it('splits each pair on the FIRST = only', () => {
    // A naive split('=')[1] would truncate a value containing '='. The digest
    // is hex so this cannot happen today, but the list format is open-ended.
    const header = `v1=${sign(body)}`;
    const parsed = header.slice(header.indexOf('=') + 1);
    expect(parsed).toBe(sign(body));
    expect(verifyCircleCISignature(Buffer.from(body), `v1=a=b,v1=${sign(body)}`, TEST_SECRET)).toBe(
      false
    ); // first v1 wins, and it is wrong
  });

  it('rejects a malformed header with no = at all', () => {
    expect(verifyCircleCISignature(Buffer.from(body), 'garbage', TEST_SECRET)).toBe(false);
    expect(verifyCircleCISignature(Buffer.from(body), 'v1', TEST_SECRET)).toBe(false);
    expect(verifyCircleCISignature(Buffer.from(body), '', TEST_SECRET)).toBe(false);
  });

  it('rejects an empty v1 value', () => {
    expect(verifyCircleCISignature(Buffer.from(body), 'v1=', TEST_SECRET)).toBe(false);
  });
});

// --- Raw body ---------------------------------------------------------------

describe('raw body', () => {
  it('rejects a re-serialized body that differs byte-for-byte', () => {
    // Pretty-printing is semantically identical and cryptographically different.
    // This is why express.json() must never run ahead of the webhook route.
    const compact = JSON.stringify(WORKFLOW_COMPLETED);
    const pretty = JSON.stringify(WORKFLOW_COMPLETED, null, 2);
    expect(verifyCircleCISignature(Buffer.from(pretty), signatureHeader(compact), TEST_SECRET)).toBe(
      false
    );
  });

  it('verifies a pretty-printed body when that is what was actually signed', () => {
    const pretty = JSON.stringify(WORKFLOW_COMPLETED, null, 2);
    expect(verifyCircleCISignature(Buffer.from(pretty), signatureHeader(pretty), TEST_SECRET)).toBe(
      true
    );
  });

  it('rejects a body with a trailing newline added after signing', () => {
    const body = JSON.stringify(WORKFLOW_COMPLETED);
    expect(
      verifyCircleCISignature(Buffer.from(`${body}\n`), signatureHeader(body), TEST_SECRET)
    ).toBe(false);
  });
});

// --- No timestamp, no replay window -----------------------------------------

describe('no replay window', () => {
  it('accepts a delivery whose happened_at is years old', async () => {
    // CircleCI's scheme signs no timestamp and documents no tolerance.
    // happened_at is EVENT time; a legitimate (undocumented-timing) retry carries the
    // original value. Rejecting on it silently drops real deliveries.
    const body = freshBody(WORKFLOW_COMPLETED, { happened_at: '2019-01-01T00:00:00.000Z' });
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

// --- Deduplication ----------------------------------------------------------

describe('deduplication', () => {
  it('ignores a repeated delivery of the same payload id', async () => {
    // "Webhook requests may be duplicated." There is no delivery-id header, so
    // the payload `id` is the dedupe key.
    const body = freshBody(WORKFLOW_COMPLETED);

    const first = await post(body);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    const second = await post(body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

// --- Payload shapes ---------------------------------------------------------

describe('payload shapes', () => {
  it('reads branch and commit from pipeline.vcs (GitHub OAuth / Bitbucket Cloud)', () => {
    const info = extractVcsInfo(WORKFLOW_COMPLETED.pipeline);

    expect(info.source).toBe('vcs');
    expect(info.provider).toBe('github');
    expect(info.branch).toBe('main');
    expect(info.revision).toBe('1dc6aa69429bff4806ad6afe58d3d8f57e25973e');
    expect(info.subject).toBe('Description of change');
    expect(info.authorName).toBe('Author Name');
  });

  it('reads branch and commit from trigger_parameters (GitLab / GitHub App)', () => {
    // These pipelines have NO `pipeline.vcs` at all -- a handler doing
    // pipeline.vcs.branch throws on them.
    expect(GITLAB_PIPELINE.vcs).toBeUndefined();

    const info = extractVcsInfo(GITLAB_PIPELINE);
    expect(info.source).toBe('trigger_parameters');
    expect(info.provider).toBe('gitlab');
    expect(info.branch).toBe('main');
    expect(info.tag).toBeNull(); // documented as "" on branch builds
    expect(info.revision).toBe('850a1519f25d14e968649cc420d1bd381715c05c');
    expect(info.subject).toBe('Update README.md');
    expect(info.authorName).toBe('Commit Author');
    expect(info.repositoryUrl).toBe('https://gitlab.com/circleci/hello-world');
  });

  it('does not throw on a pipeline with neither vcs nor trigger_parameters', () => {
    expect(() => extractVcsInfo({})).not.toThrow();
    expect(() => extractVcsInfo(undefined)).not.toThrow();
    expect(extractVcsInfo({}).branch).toBeNull();
  });

  it('job-completed payloads carry no workflow.status', () => {
    // Workflow status belongs to workflow-level webhooks only.
    expect(JOB_COMPLETED.workflow.status).toBeUndefined();
    expect(JOB_COMPLETED.job.status).toBe('success');
  });

  it('accepts unknown extra fields (payloads are "open maps")', async () => {
    const body = freshBody(WORKFLOW_COMPLETED, {
      some_future_field: { nested: true },
      workflow: { ...WORKFLOW_COMPLETED.workflow, brand_new_key: 'value' },
    });
    const res = await post(body);

    expect(res.status).toBe(200);
  });

  it('acknowledges the community-observed abbreviated ping payload', async () => {
    // header `circleci-event-type: ping`, body with only type/id/happened_at/
    // webhook -- no project, organization, workflow or pipeline. Community
    // observation, NOT documented by CircleCI.
    const body = JSON.stringify({
      type: 'ping',
      id: crypto.randomUUID(),
      happened_at: '2022-09-19T15:59:36.507435Z',
      webhook: { id: 'd4ab06bc-eb79-463d-8aa4-47d066382d3b', name: 'fly.io' },
    });

    const res = await post(body, { eventType: 'ping' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('acknowledges an unknown event type without throwing', async () => {
    const body = freshBody(WORKFLOW_COMPLETED, { type: 'something-new' });
    const res = await post(body, { eventType: 'something-new' });

    expect(res.status).toBe(200);
  });

  it('returns 400 on a verified but unparseable body', async () => {
    const body = 'not json at all';
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });
});
