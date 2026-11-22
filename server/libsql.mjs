import { createClient } from '@libsql/client/web';

export function connectTurso(environment = process.env) {
  const url = environment.TURSO_DATABASE_URL?.trim();
  const authToken = environment.TURSO_AUTH_TOKEN?.trim();
  const hasDatabaseUrl = Boolean(url && url !== 'libsql://your-actual-database-url');
  const hasAuthToken = Boolean(authToken && authToken !== 'your-secret-token');
  if (!hasDatabaseUrl && !hasAuthToken) return null;
  if (!hasDatabaseUrl || !hasAuthToken) {
    throw new Error('Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to their real values.');
  }
  return createClient({ url, authToken });
}

export function databaseBinding(client) {
  return {
    prepare(sql) {
      const bind = (...args) => ({
        async first() {
          const { rows } = await client.execute({ sql, args });
          return rows[0];
        },
        async all() {
          const { rows } = await client.execute({ sql, args });
          return { results: rows };
        },
        async run() {
          const { rowsAffected } = await client.execute({ sql, args });
          return { meta: { changes: rowsAffected } };
        }
      });
      return { bind, all: bind().all };
    }
  };
}
