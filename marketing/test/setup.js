// NOTE: importing '@testing-library/jest-dom/vitest' directly doesn't work
// reliably in this repo's npm workspaces setup — that subpath is only
// hoisted to the shared root node_modules, so its internal `expect.extend`
// call resolves a *different* hoisted `vitest` (and thus a different
// `expect`/chai instance) than the one actually running this workspace's
// tests, silently registering matchers nowhere useful. Importing the raw
// matcher functions and extending our own locally-resolved `expect`
// sidesteps that cross-workspace module duplication.
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
