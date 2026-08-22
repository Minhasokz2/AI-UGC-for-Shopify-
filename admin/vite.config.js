import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE on devDependency versions (package.json): vite/@vitejs/plugin-react/
// vitest here are pinned to 5.4.21 / 4.7.0 / 3.2.7 rather than each
// package's current latest major (vite 8 / plugin-react 6 / vitest 4).
// That's a deliberate compatibility choice, not a guess: server/package.json
// pins `vitest: "^2.1.5"`, whose own `vite-node`/`vitest` dependency range
// (`^5.0.0`) is what npm's workspace hoisting resolves at the repo root's
// node_modules/vite — and @vitejs/plugin-react has no per-workspace nested
// copy, so it always resolves that hoisted vite at runtime regardless of
// what this workspace's own package.json asks for. Pinning to the vite 5.x
// line (still current-and-supported, just not vite's newest major) is what
// npm actually resolves and dedupes against that hoisted copy, avoiding an
// `ERR_PACKAGE_PATH_NOT_EXPORTED` failure from @vitejs/plugin-react trying
// to import a vite@8-only subpath out of the hoisted vite@5. This is a
// workspace-hoisting fact, verified by reproducing the failure locally
// with the current-major versions — not owned by admin/ and not fixable
// from within admin/ alone, since fixing it for real means changing
// server/package.json's vitest pin, which is out of scope here.
//
// Separately: react/react-dom are pinned to 18.3.1, not each package's
// current latest major (19.2.8, what web/ and marketing/ declare) — verified
// that @shopify/polaris@13.9.5 lists `react`/`react-dom` peerDependencies as
// `^18.0.0` (no 19.x support), and empirically, when THIS workspace also
// requests react@19.2.8 (matching web/marketing's own — likely latent and
// pre-existing — mismatch against that same polaris peer range), `npm
// install` at the repo root resolves the three-workspace peer conflict by
// silently REWRITING web/package.json and marketing/package.json's react
// versions to 18.3.1 (an out-of-scope side effect on files this build must
// not touch). Pinning admin/'s own react to 18.3.1 up front — satisfying
// polaris's real peer requirement — avoids tipping npm's resolver into that
// rewrite path, verified by a clean `npm install` leaving every other
// workspace's package.json byte-for-byte unchanged.

export default defineConfig({
  plugins: [react()],
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
