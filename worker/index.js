const categories = new Set([
  'best-tasting', 'worst-tasting', 'most-unique', 'worst-looking', 'worst-smelling'
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function parseNumber(value) {
  return typeof value === 'string' && /^[0-9]{1,7}$/.test(value) ? Number(value) : 0;
}

function voterSession(request, url) {
  const existing = request.headers.get('cookie')?.match(/(?:^|;\s*)pickle_voter=([^;]+)/)?.[1];
  if (uuid.test(existing ?? '')) return { id: existing, headers: {} };
  const id = crypto.randomUUID();
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return { id, headers: {
    'set-cookie': `pickle_voter=${id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`
  } };
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const { method } = request;
  const db = env.DB;
  if (method === 'GET' && pathname === '/api/ballot') {
    const voter = voterSession(request, url);
    const { results } = await db.prepare('SELECT category, pickle_number FROM votes WHERE voter = ?')
      .bind(voter.id).all();
    return json({ votes: results }, 200, voter.headers);
  }

  if (method === 'GET' && pathname === '/api/results') {
    const { results } = await db.prepare(`
      SELECT category, pickles.number, pickles.name, COUNT(*) AS votes
      FROM votes JOIN pickles ON pickles.number = votes.pickle_number
      GROUP BY category, pickles.number ORDER BY category, votes DESC, pickles.number
    `).all();
    return json({ totals: results });
  }

  if (method === 'GET' && pathname === '/api/pickles') {
    if (!url.searchParams.has('number')) {
      const query = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
      const page = Number(url.searchParams.get('page') ?? 1);
      if (!Number.isInteger(page) || page < 1 || page > 1000000) {
        return json({ error: 'Choose a valid page.' }, 400);
      }
      const size = 10;
      const { results } = await db.prepare(`
        SELECT number, name FROM pickles
        WHERE ? = '' OR number = ? OR instr(lower(COALESCE(name, '')), lower(?)) > 0
        ORDER BY number LIMIT ? OFFSET ?
      `).bind(query, parseNumber(query), query, size + 1, (page - 1) * size).all();
      return json({ entries: results.slice(0, size), hasNext: results.length > size });
    }
    const number = parseNumber(url.searchParams.get('number'));
    if (!number) return json({ error: 'Enter a valid pickle number.' }, 400);
    const entry = await db.prepare('SELECT number, name FROM pickles WHERE number = ?').bind(number).first();
    return entry ? json(entry) : json({ error: `Pickle #${number} has not been registered yet.` }, 404);
  }

  if (method === 'POST' && (pathname === '/api/pickles' || pathname === '/api/votes')) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || !request.headers.get('content-type')?.startsWith('application/json')) {
      return json({ error: 'Submit this form from the party site.' }, 403);
    }
    const body = await request.json().catch(() => null);
    const number = parseNumber(body?.number);
    if (!number) return json({ error: 'Enter a valid pickle number.' }, 400);

    if (pathname === '/api/pickles') {
      if (body.name !== undefined && typeof body.name !== 'string') {
        return json({ error: 'Enter a valid pickle name.' }, 400);
      }
      const name = body.name?.trim() || null;
      if (name && name.length > 60) return json({ error: 'Keep the pickle name to 60 characters.' }, 400);
      const result = await db.prepare('INSERT INTO pickles (number, name) VALUES (?, ?) ON CONFLICT DO NOTHING')
        .bind(number, name).run();
      if (!result.meta.changes) return json({ error: `Pickle #${number} is already registered.` }, 409);
      return json({ number, name }, 201);
    }

    const category = body.category;
    if (!categories.has(category)) return json({ error: 'Choose a voting category.' }, 400);
    const voter = voterSession(request, url);
    const result = await db.prepare(`
      INSERT INTO votes (voter, category, pickle_number)
      SELECT ?, ?, number FROM pickles WHERE number = ?
      ON CONFLICT (voter, category) DO UPDATE SET pickle_number = excluded.pickle_number
    `).bind(voter.id, category, number).run();
    if (!result.meta.changes) {
      return json({ error: `Pickle #${number} has not been registered yet.` }, 404, voter.headers);
    }
    return json({ number, category }, 200, voter.headers);
  }

  return json({ error: 'Page not found.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        console.error('Pickle Party database request failed', error);
        return json({ error: 'Something went wrong. Please try again.' }, 500);
      }
    }

    const asset = assets[url.pathname];
    if (!asset || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return new Response('Page not found', { status: 404 });
    }
    return new Response(request.method === 'HEAD' ? null : asset.body(), {
      headers: { 'content-type': asset.type, 'cache-control': asset.cache }
    });
  }
};
