import { readFile } from 'node:fs/promises';
import { configuration } from './config.js';
import { createPool, transaction } from './db.js';
import { seedContent } from './app.js';
const config = configuration();
const pool = createPool(config);
try {
  const sql = await readFile(new URL('../sql/001-existing-portal.sql', import.meta.url), 'utf8');
  await transaction(pool, db => db.query(sql));
  await seedContent(pool);
  console.log('Existing portal schema checked and missing content seeded; no default password was created.');
} finally { await pool.end(); }
