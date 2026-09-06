import { build } from 'esbuild';

// Compile application TypeScript once during deployment, not in the live process.
// Node dependencies stay external so native modules and dynamic requires retain
// their package semantics. No frontend or source maps are served by this server.
await build({
  entryPoints: ['server.ts'], outfile: 'build/server.mjs', bundle: true,
  platform: 'node', target: 'node22', format: 'esm', packages: 'external',
  sourcemap: 'external', sourcesContent: false, logLevel: 'info',
});
