import { defineConfig } from 'vite';

// NOTE: intentionally not using @vitejs/plugin-react here. This repo's npm
// workspaces hoist a single shared copy of @vitejs/plugin-react, but the
// root-level `vite` it resolves against gets hoisted from server/'s
// vitest@2.x devDependency (which pins vite ^5), not from this workspace's
// own vite@8.x — an ESM `exports` mismatch across workspaces that isn't
// caused by, or fixable from within, marketing/. Vite 8's built-in oxc
// transform already handles JSX (automatic runtime) for .jsx files without
// any plugin, which sidesteps that cross-workspace hoisting conflict
// entirely for this low-risk public site, at the cost of React Fast Refresh
// in `vite dev` (build/test are unaffected).
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    css: false,
  },
});
