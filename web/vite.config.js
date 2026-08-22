import { defineConfig } from 'vite';

// NOTE: intentionally not using @vitejs/plugin-react here. The repo-wide
// dependency graph hoists vite@5.x to the workspace root (pulled in by
// server's vitest@^2.1.5), which breaks @vitejs/plugin-react@6.x's peer
// resolution of "vite" for every frontend workspace (confirmed this also
// breaks `npm run build -w admin` — pre-existing, not introduced here).
// Fixing it for real requires touching root package.json or server/,
// which are out of scope for this workspace. Vite's built-in esbuild JSX
// transform below covers our build/test needs (automatic runtime, no
// per-file React import) without that dependency; the only real
// trade-off is no Fast Refresh in `vite dev`, which isn't exercised by
// this build (no live dev server against a real Shopify shop per scope).
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    css: false,
    // This monorepo's npm workspace hoisting is not deterministic across
    // installs (siblings admin/marketing pin their own react versions
    // independently, and a concurrent edit to one can tip whether npm
    // hoists a shared react/react-dom to the root or nests a duplicate
    // physical copy inside web/node_modules). By default Vitest
    // externalizes CJS deps like @testing-library/react — its internal
    // require('react') then bypasses Vite's resolver/dedupe entirely and
    // can land on a different physical react copy than our own source
    // files resolve to, causing "Invalid hook call" / null dispatcher
    // errors. Forcing these through Vite's transform pipeline makes our
    // resolve.dedupe above actually apply to them too, regardless of how
    // npm happened to lay out node_modules on a given install.
    server: {
      deps: {
        inline: [/@testing-library\//],
      },
    },
  },
});
