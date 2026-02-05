import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST, GET } from '../app/webhooks/gitlab/route';
import { NextRequest } from 'next/server';

// Test token
const TEST_TOKEN = 'test_gitlab_webhook_token_1234567890';
process.env.GITLAB_WEBHOOK_TOKEN = TEST_TOKEN;

// Helper to create a NextRequest with headers and body
function createRequest(
  body: any,
  headers: Record<string, string> = {}
): NextRequest {
  const url = 'http://localhost:3000/webhooks/gitlab';

  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
}

describe('GitLab Webhook Handler', () => {
  describe('GET /webhooks/gitlab', () => {
    it('should return health status', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'ok' });
    });
  });

  describe('POST /webhooks/gitlab', () => {
    it('should reject requests without token', async () => {
      const request = createRequest({ object_kind: 'push' });
      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    });

    it('should reject requests with invalid token', async () => {
      const request = createRequest(
        { object_kind: 'push' },
        { 'X-Gitlab-Token': 'invalid_token' }
      );
      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    });

    it('should accept requests with valid token', async () => {
      const payload = {
        object_kind: 'push',
        project: {
          name: 'Test Project',
          path_with_namespace: 'namespace/test-project'
        }
      };

      const request = createRequest(payload, {
        'X-Gitlab-Token': TEST_TOKEN,
        'X-Gitlab-Event': 'Push Hook'
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        received: true,
        event: 'push',
        project: 'namespace/test-project'
      });
    });

    describe('Event Types', () => {
      const sendWebhook = async (payload: any, event = 'Test Hook') => {
        const request = createRequest(payload, {
          'X-Gitlab-Token': TEST_TOKEN,
          'X-Gitlab-Event': event,
          'X-Gitlab-Instance': 'gitlab.example.com',
          'X-Gitlab-Event-UUID': 'test-uuid-123'
        });
        return await POST(request);
      };

      it('should handle push events', async () => {
        const payload = {
          object_kind: 'push',
          ref: 'refs/heads/main',
          before: 'abcdef1234567890abcdef1234567890abcdef12',
          after: '1234567890abcdef1234567890abcdef12345678',
          total_commits_count: 3,
          user_name: 'John Doe',
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Push Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('push');
      });

      it('should handle tag push events', async () => {
        const payload = {
          object_kind: 'tag_push',
          ref: 'refs/tags/v1.0.0',
          before: '0000000000000000000000000000000000000000',
          after: '1234567890abcdef1234567890abcdef12345678',
          user_name: 'Jane Doe',
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Tag Push Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('tag_push');
      });

      it('should handle merge request events', async () => {
        const payload = {
          object_kind: 'merge_request',
          user_name: 'John Doe',
          object_attributes: {
            id: 1,
            iid: 42,
            title: 'Add new feature',
            state: 'opened',
            action: 'open',
            source_branch: 'feature-branch',
            target_branch: 'main',
            url: 'https://gitlab.com/test/merge_requests/42'
          },
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Merge Request Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('merge_request');
      });

      it('should handle issue events', async () => {
        const payload = {
          object_kind: 'issue',
          user_name: 'Jane Doe',
          object_attributes: {
            id: 1,
            iid: 123,
            title: 'Bug report',
            state: 'opened',
            action: 'open',
            url: 'https://gitlab.com/test/issues/123'
          },
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Issue Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('issue');
      });

      it('should handle work item events', async () => {
        const payload = {
          object_kind: 'work_item',
          user_name: 'Jane Doe',
          object_attributes: {
            id: 1,
            iid: 456,
            title: 'Task item',
            state: 'opened',
            action: 'open',
            url: 'https://gitlab.com/test/work_items/456'
          },
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Issue Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('work_item');
      });

      it('should handle pipeline events', async () => {
        const payload = {
          object_kind: 'pipeline',
          object_attributes: {
            id: 999,
            ref: 'main',
            tag: false,
            sha: '1234567890abcdef',
            before_sha: 'abcdef1234567890',
            status: 'success',
            detailed_status: 'passed',
            duration: 3600,
            created_at: '2024-01-01T00:00:00Z'
          },
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Pipeline Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('pipeline');
      });

      it('should handle job events', async () => {
        const payload = {
          object_kind: 'build',
          build_name: 'test-job',
          build_stage: 'test',
          build_status: 'success',
          build_duration: 120,
          project_name: 'Test Project'
        };

        const response = await sendWebhook(payload, 'Job Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('build');
      });

      it('should handle note events', async () => {
        const payload = {
          object_kind: 'note',
          user_name: 'John Doe',
          object_attributes: {
            noteable_type: 'MergeRequest',
            note: 'This looks good to me!'
          },
          merge_request: {
            iid: 42
          },
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Note Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('note');
      });

      it('should handle wiki page events', async () => {
        const payload = {
          object_kind: 'wiki_page',
          object_attributes: {
            title: 'API Documentation',
            action: 'create',
            slug: 'api-documentation'
          },
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Wiki Page Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('wiki_page');
      });

      it('should handle deployment events', async () => {
        const payload = {
          object_kind: 'deployment',
          status: 'success',
          environment: 'production',
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Deployment Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('deployment');
      });

      it('should handle release events', async () => {
        const payload = {
          object_kind: 'release',
          action: 'create',
          name: 'Version 1.0.0',
          tag: 'v1.0.0',
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Release Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('release');
      });

      it('should handle unknown events gracefully', async () => {
        const payload = {
          object_kind: 'unknown_event',
          project: {
            id: 1,
            name: 'Test Project',
            web_url: 'https://gitlab.com/test',
            git_ssh_url: 'git@gitlab.com:test.git',
            git_http_url: 'https://gitlab.com/test.git',
            namespace: 'namespace',
            path_with_namespace: 'namespace/test-project',
            default_branch: 'main'
          }
        };

        const response = await sendWebhook(payload, 'Unknown Hook');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.event).toBe('unknown_event');
      });
    });

    describe('Security', () => {
      it('should use timing-safe comparison for tokens', async () => {
        // This tests that different length tokens are handled properly
        const differentLengthToken = 'short';

        const request = createRequest(
          { object_kind: 'push' },
          { 'X-Gitlab-Token': differentLengthToken }
        );
        const response = await POST(request);

        expect(response.status).toBe(401);
        expect(await response.text()).toBe('Unauthorized');
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid JSON', async () => {
        const url = 'http://localhost:3000/webhooks/gitlab';
        const request = new NextRequest(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Gitlab-Token': TEST_TOKEN
          },
          body: 'invalid json'
        });

        const response = await POST(request);

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Invalid JSON');
      });
    });
  });
});