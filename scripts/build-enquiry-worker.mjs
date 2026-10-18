import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tsxRequire = createRequire(require.resolve('tsx'));
const { build } = tsxRequire('esbuild');
await build({ entryPoints: ['scripts/enquiry-worker.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: '.worker/enquiry-worker.cjs', external: ['pg-native'] });
