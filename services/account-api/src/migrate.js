import { readFile } from 'node:fs/promises';
import { configuration } from './config.js';
import { createPool, transaction } from './db.js';
import { seedContent } from './app.js';
const config = configuration();
const pool = createPool(config);
try {
  await transaction(pool, async db => {
    for (const filename of ['001-existing-portal.sql', '002-google-citizen-auth.sql']) {
      await db.query(await readFile(new URL('../sql/' + filename, import.meta.url), 'utf8'));
    }
  });
  await seedContent(pool);
  console.log('Portal and Google identity schemas checked; existing users and MFA preserved, with no default password.');
} finally { await pool.end(); }
