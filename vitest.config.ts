import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
    },
  },
  test: {
    include: [
      'src/**/*.test.ts',
      'scripts/**/*.test.ts',
      'packages/*/tests/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
    ],
    // Vitest defaults to 5s, which several cases here sit just under: the
    // vault suite does real AES round-trips (~9s alone) and the overview
    // case writes 710 files (~1.2s alone). They passed only while the suite
    // stayed small enough not to compete with them, so adding any test file
    // elsewhere made unrelated cases fail on a timeout that said nothing
    // about what they assert. None of them is a performance test.
    testTimeout: 30_000,
  },

})
