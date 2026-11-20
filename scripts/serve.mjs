import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadEnvFile } from 'node:process';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import worker from '../dist/server/index.js';

try {
  loadEnvFile(new URL('../.env.local', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const db = new DatabaseSync(process.env.PICKLE_DB ?? 'pickle-party.sqlite');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('BEGIN IMMEDIATE');
try {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY)');
  const applied = db.prepare('SELECT 1 FROM local_migrations WHERE tag = ?');
  const record = db.prepare('INSERT INTO local_migrations (tag) VALUES (?)');
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pickles'").get() && !applied.get('0000_party')) {
    record.run('0000_party');
  }
  for (const { tag } of journal.entries) {
    if (applied.get(tag)) continue;
    db.exec(readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8'));
    record.run(tag);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

const env = {
  PICKLE_DELETE_CODE: process.env.PICKLE_DELETE_CODE,
  DB: {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return {
            first: () => statement.get(...values),
            all: () => ({ results: statement.all(...values) }),
            run: () => ({ meta: statement.run(...values) })
          };
        },
        all: () => ({ results: statement.all() })
      };
    }
  }
};

const port = Number(process.env.PORT ?? 8787);
const host = process.env.PICKLE_HOST ?? '127.0.0.1';
createServer(async (incoming, outgoing) => {
  try {
    const method = incoming.method;
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const request = new Request(new URL(incoming.url, `http://${incoming.headers.host}`), {
      method,
      headers: incoming.headers,
      ...(hasBody && { body: Readable.toWeb(incoming), duplex: 'half' })
    });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
}).listen(port, host, () => console.log(`Pickle Party listening on http://${host}:${port}`));
