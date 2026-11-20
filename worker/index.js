const categories = new Set([
  'best-tasting', 'worst-tasting', 'most-unique', 'worst-looking', 'worst-smelling'
]);
const voteToken = /^[0-9a-f]{32}$/;
const deleteCode = /^[0-9]{4}$/;
const deleteWindowSeconds = 5 * 60;
let deleteWindowEnds = 0;
let deleteAttempts = 0;

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function parseNumber(value) {
  return typeof value === 'string' && /^[0-9]{1,7}$/.test(value) ? Number(value) : 0;
}

async function deletePickle(env, number, code) {
  if (!deleteCode.test(env.PICKLE_DELETE_CODE ?? '')) {
    return json({ error: 'The host needs to set a four-digit deletion code first.' }, 503);
  }
  if (typeof code !== 'string' || !deleteCode.test(code)) {
    return json({ error: 'Enter exactly four digits.' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= deleteWindowEnds) {
    deleteWindowEnds = now + deleteWindowSeconds;
    deleteAttempts = 0;
  }
  if (deleteAttempts >= 10) {
    return json({ error: 'Too many deletion attempts. Try again in a few minutes.' }, 429, {
      'retry-after': String(deleteWindowEnds - now)
    });
  }
  deleteAttempts++;

  let difference = 0;
  for (let index = 0; index < 4; index++) {
    difference |= code.charCodeAt(index) ^ env.PICKLE_DELETE_CODE.charCodeAt(index);
  }
  if (difference) return json({ error: 'That deletion code is incorrect.' }, 403);

  const result = await env.DB.prepare('DELETE FROM pickles WHERE entry_number = ?').bind(number).run();
  if (!result.meta.changes) return json({ error: 'This pickle has already been removed.' }, 404);
  return json({ number });
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const { method } = request;
  const db = env.DB;
  if (method === 'GET' && pathname === '/api/results') {
    const { results } = await db.prepare(`
      SELECT votes.category, pickles.entry_number AS number, pickles.pickle_name AS name,
        pickles.pickle_nickname AS nickname, COUNT(*) AS votes
      FROM votes JOIN pickles ON pickles.id = votes.pickle_id
      GROUP BY votes.category, pickles.id ORDER BY votes.category, COUNT(*) DESC, pickles.entry_number
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
        SELECT id, entry_number AS number, pickle_name AS name FROM pickles
        WHERE ? = '' OR entry_number = ? OR instr(lower(COALESCE(pickle_name, '')), lower(?)) > 0
        ORDER BY entry_number LIMIT ? OFFSET ?
      `).bind(query, parseNumber(query), query, size + 1, (page - 1) * size).all();
      return json({ entries: results.slice(0, size), hasNext: results.length > size });
    }
    const number = parseNumber(url.searchParams.get('number'));
    if (!number) return json({ error: 'Enter a valid pickle number.' }, 400);
    const entry = await db.prepare('SELECT entry_number AS number, pickle_name AS name, pickle_nickname AS nickname FROM pickles WHERE entry_number = ?')
      .bind(number).first();
    return entry ? json(entry) : json({ error: `Pickle #${number} has not been registered yet.` }, 404);
  }

  const deleting = method === 'DELETE' && pathname === '/api/pickles';
  if (deleting || (method === 'POST' && (pathname === '/api/pickles' || pathname === '/api/votes'))) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || !request.headers.get('content-type')?.startsWith('application/json')) {
      return json({ error: 'Submit this form from the party site.' }, 403);
    }
    const body = await request.json().catch(() => null);
    const number = parseNumber(body?.number);
    if (!number) return json({ error: 'Enter a valid pickle number.' }, 400);

    if (deleting) return deletePickle(env, number, body.code);

    if (pathname === '/api/pickles') {
      if (body.name !== undefined && typeof body.name !== 'string') {
        return json({ error: 'Enter a valid pickle name.' }, 400);
      }
      if (body.nickname !== undefined && typeof body.nickname !== 'string') {
        return json({ error: 'Enter a valid pickle nickname.' }, 400);
      }
      const name = body.name?.trim() || null;
      const nickname = body.nickname?.trim() || null;
      if (name && name.length > 60) return json({ error: 'Keep the pickle name to 60 characters.' }, 400);
      if (nickname && nickname.length > 60) return json({ error: 'Keep the pickle nickname to 60 characters.' }, 400);
      const result = await db.prepare(`
        INSERT INTO pickles (entry_number, pickle_name, pickle_nickname) VALUES (?, ?, ?)
        ON CONFLICT (entry_number) DO NOTHING
      `).bind(number, name, nickname).run();
      if (!result.meta.changes) return json({ error: `Pickle #${number} is already registered.` }, 409);
      return json({ number, name, nickname }, 201);
    }

    const { category, voteId, pickleId = null } = body;
    if (!categories.has(category)) return json({ error: 'Choose a voting category.' }, 400);
    if (pickleId !== null && (!Number.isSafeInteger(pickleId) || pickleId < 1)) {
      return json({ error: 'Choose a valid pickle entry.' }, 400);
    }
    if (voteId !== undefined && (typeof voteId !== 'string' || !voteToken.test(voteId))) {
      return json({ error: 'The vote reference is invalid.' }, 400);
    }
    const submission = voteId ?? crypto.randomUUID().replaceAll('-', '');
    // Resolving the entry and inserting its vote share one atomic SQLite statement.
    const result = await db.prepare(`
      INSERT INTO votes (id, category, pickle_id)
      SELECT ?, ?, id FROM pickles WHERE entry_number = ? AND (? IS NULL OR id = ?)
      ON CONFLICT (id) DO NOTHING
    `).bind(submission, category, number, pickleId, pickleId).run();
    if (!result.meta.changes) {
      const prior = await db.prepare(`
        SELECT votes.category, votes.pickle_id, pickles.entry_number
        FROM votes JOIN pickles ON pickles.id = votes.pickle_id
        WHERE votes.id = ?
      `).bind(submission).first();
      if (!prior) return json({ error: `Pickle #${number} is no longer on this ballot. Refresh to see the current entries.` }, 404);
      if (prior.entry_number === number && prior.category === category && (pickleId === null || prior.pickle_id === pickleId)) {
        return json({ error: 'This vote was already counted.', alreadyCounted: true }, 409);
      }
      return json({ error: 'This vote reference was already used.' }, 409);
    }
    return json({ number, category }, 201);
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
