import { build } from 'esbuild';

// pg and nodemailer include CommonJS modules. Provide their Node helpers inside
// the ESM bundle required by the function runtime.
await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist/index.mjs',
  banner: { js: 'import{createRequire as ___cr}from"node:module";import{fileURLToPath as ___f}from"node:url";import{dirname as ___d}from"node:path";const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);' },
});
