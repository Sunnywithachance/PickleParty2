import { createClient } from '@libsql/client/web';

export function connectTurso({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env) {
  if (!url && !authToken) return null;
  if (!url || !authToken) throw new Error('Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
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
