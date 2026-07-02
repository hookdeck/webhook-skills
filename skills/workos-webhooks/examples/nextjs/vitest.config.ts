import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Set before modules load — the route constructs the WorkOS client at
    // import time, so these must exist before the test file is imported.
    env: {
      WORKOS_API_KEY: 'sk_test_fake_key',
      WORKOS_WEBHOOK_SECRET: 'wh_test_secret',
    },
  },
});
