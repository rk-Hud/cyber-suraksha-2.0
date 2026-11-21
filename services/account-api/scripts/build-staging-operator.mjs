import { build } from 'esbuild';

// Build separately from the citizen Function. Does not deploy or run migrations.
await build({
  entryPoints: ['src/index-staging-operator.js'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist-operator/index.mjs',
  banner: { js: 'import{createRequire as ___cr}from"node:module";import{fileURLToPath as ___f}from"node:url";import{dirname as ___d}from"node:path";const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);' },
});
