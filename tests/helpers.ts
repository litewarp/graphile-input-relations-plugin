import * as fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export async function withPgPool<T>(
  cb: (pool: pg.Pool) => Promise<T>
): Promise<T> {
  const pool = new pg.Pool({
    connectionString: process.env['TEST_DATABASE_URL'],
  });
  try {
    return await cb(pool);
  } finally {
    await pool.end();
  }
}

export async function withPgClient<T>(
  cb: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  return await withPgPool(async (pool) => {
    const client = await pool.connect();
    try {
      return await cb(client);
    } finally {
      client.release();
    }
  });
}

export async function withTransaction<T>(
  cb: (client: pg.PoolClient) => Promise<T>,
  closeCommand = 'rollback'
): Promise<T> {
  return await withPgClient(async (client) => {
    await client.query('begin');
    try {
      return await cb(client);
    } finally {
      await client.query(closeCommand);
    }
  });
}

export function getFixturesForSqlSchema(sqlSchema: string) {
  return fs.existsSync(
    path.resolve(__dirname, 'schemas', sqlSchema, 'fixtures', 'queries')
  )
    ? fs
        .readdirSync(
          path.resolve(__dirname, 'schemas', sqlSchema, 'fixtures', 'queries')
        )
        .sort()
    : [];
}

export function readFixtureForSqlSchema(sqlSchema: string, fixture: string) {
  return fs.promises.readFile(
    path.resolve(
      __dirname,
      'schemas',
      sqlSchema,
      'fixtures',
      'queries',
      fixture
    ),
    'utf8'
  );
}
