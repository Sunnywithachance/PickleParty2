import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { connectTurso } from '../server/libsql.mjs';

const migrationsDirectory = new URL('../drizzle/', import.meta.url);

export async function migrateDatabase(client) {
  const { entries } = JSON.parse(await readFile(new URL('meta/_journal.json', migrationsDirectory), 'utf8'));
  const migrations = await Promise.all(entries.map(async ({ tag }) => {
    const sql = await readFile(new URL(`${tag}.sql`, migrationsDirectory), 'utf8');
    return { tag, statements: sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean) };
  }));

  const transaction = await client.transaction('write');
  try {
    // Use the local migration ledger too, so importing a prepared SQLite file preserves its history.
    await transaction.execute('CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY)');
    const { rows } = await transaction.execute('SELECT tag FROM local_migrations');
    const applied = new Set(rows.map(row => row.tag));
    const statements = migrations.filter(({ tag }) => !applied.has(tag)).flatMap(({ tag, statements }) => [
      ...statements,
      { sql: 'INSERT INTO local_migrations (tag) VALUES (?)', args: [tag] }
    ]);
    if (statements.length) await transaction.batch(statements);
    await transaction.commit();
  } finally {
    transaction.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = connectTurso();
  if (!client) {
    console.log('No Turso database configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable registration and voting.');
  } else {
    try {
      await migrateDatabase(client);
      console.log('Pickle Party database is ready.');
    } catch (error) {
      console.error('Could not prepare the Pickle Party database:', error.code ?? error.name);
      process.exitCode = 1;
    } finally {
      client.close();
    }
  }
}
