import pg from 'pg';

export function createPool(config) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  const url = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL is required');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (loopback && config.nodeEnv !== 'test') throw new Error('Loopback database is limited to tests');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('sslrootcert');
  const pool = new pg.Pool({ connectionString: url.href, ssl: loopback ? false : { rejectUnauthorized: true },
    max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000, statement_timeout: 10000,
    query_timeout: 12000, application_name: 'cybersuraksha-account-api' });
  pool.on('error', () => { console.error('database_idle_connection_failed'); });
  return pool;
}

export async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
