import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    // These tests hit a real Postgres transaction lock deliberately —
    // running files in parallel workers would just add unrelated
    // connection contention, not more coverage.
    fileParallelism: false,
  },
})
