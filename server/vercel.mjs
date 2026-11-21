import { connectTurso, databaseBinding } from './libsql.mjs';
import { fetchApi } from '../worker/index.js';

let db;

export default {
  async fetch(request) {
    try {
      if (!db) {
        const client = connectTurso();
        if (!client) throw new Error('The Turso environment variables are missing.');
        db = databaseBinding(client);
      }
    } catch (error) {
      console.error('Pickle Party database configuration failed', error.code ?? error.name);
      return Response.json({ error: 'The party database is not connected. Ask the host to finish setup.' }, {
        status: 503, headers: { 'cache-control': 'no-store' }
      });
    }
    return fetchApi(request, { DB: db, PICKLE_DELETE_CODE: process.env.PICKLE_DELETE_CODE });
  }
};
