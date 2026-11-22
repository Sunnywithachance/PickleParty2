const home = document.querySelector('#home');
const page = document.querySelector('#page');
const dialog = document.querySelector('#dialog');
const dialogTitle = document.querySelector('#dialog-title');
const dialogDescription = document.querySelector('#dialog-description');
const dialogBody = document.querySelector('#dialog-body');
const voteStatus = document.querySelector('#vote-status');
const cards = Array.from(home.querySelectorAll('.card'));
const categories = new Map(cards.map(card => [
  card.dataset.category, {
    label: card.querySelector('h3').innerText.replace(/\s+/g, ' ').trim(),
    sprite: card.querySelector('.mascot').classList[1],
    icon: card.querySelector('.medal').textContent
  }
]));
let currentRoute = 0;
let voteStatusTimer;
let leaderboardTimer;
let deleting = false;
let deletedEntry;

async function api(path, body, method = 'POST') {
  const response = await fetch(path, body === undefined ? {} : {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error ?? 'The party site is temporarily unavailable.'), {
      status: response.status,
      alreadyCounted: data.alreadyCounted === true
    });
  }
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const displayNumber = number => '#' + String(number).padStart(3, '0');
const entryName = entry => entry.name || 'Unnamed Pickle';
const ownerLabel = ownerName => `${ownerName}’s Pickle`;
const pickleIcon = '<img class="pickle-icon" src="/assets/pickle.png" alt="" width="360" height="360">';
const mascot = sprite => `<span class="mascot ${sprite}" aria-hidden="true"></span>`;
const back = (href, label) => `<a class="back-link" href="#${href}">‹ ${label}</a>`;
const link = (href, label, style = 'lime-button') => `<a class="${style}" href="#${href}">${label}</a>`;
const heading = (title, intro = '') => `<header class="page-title"><h1 tabindex="-1">${title}</h1>${intro ? `<p>${intro}</p>` : ''}</header>`;
const statusBox = message => `<p class="sheet notice" role="status">${escapeHtml(message)}</p>`;

function renderPage(markup) {
  page.innerHTML = `<div class="page-inner">${markup}</div>`;
}
function registerPage() {
  renderPage(`${back('top', 'Back to Home')}
    ${heading('Register a <em>Pickle</em>', 'Enter the number you received at the door to add your pickle to the competition.')}
    <div class="split">${pickleIcon}<form class="sheet signup" id="signup">
      <label for="entry-number">Number</label>
      <input class="field" id="entry-number" name="number" inputmode="numeric" pattern="[0-9]+" maxlength="7" autocomplete="off" placeholder="Enter your assigned number" required>
      <label for="entry-name">Pickle Name <span>(optional)</span></label>
      <input class="field" id="entry-name" name="name" maxlength="60" placeholder="e.g. Spicy Dill">
      <label for="entry-nickname">Pickle Nickname <span>(optional)</span></label>
      <input class="field" id="entry-nickname" name="nickname" maxlength="60" placeholder="e.g. Spicy Boi">
      <label for="entry-owner">Your Name <span>(optional)</span></label>
      <input class="field" id="entry-owner" name="ownerName" maxlength="60" autocomplete="given-name" placeholder="e.g. Sunny">
      <p class="feedback" id="signup-error" role="alert" hidden></p>
      <button class="hot-button" type="submit">Register Pickle</button>
    </form></div>`);

  const form = page.querySelector('#signup');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    const errorBox = form.querySelector('#signup-error');
    errorBox.hidden = true;
    button.disabled = true;
    try {
      const entry = await api('/api/pickles', Object.fromEntries(new FormData(form)));
      if (form.isConnected) location.hash = `registered/${entry.number}`;
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}

async function registeredPage(number, route) {
  const frame = back('top', 'Back to Home') + heading('Pickle <em>Registered!</em>');
  renderPage(frame + '<div id="confirmation"></div>');
  const content = page.querySelector('#confirmation');
  try {
    await api(`/api/pickles?number=${number}`);
  } catch (error) {
    if (currentRoute === route) renderPage(back('register', 'Back to Registration') + heading('Entry unavailable') + statusBox(error.message));
    return;
  }
  if (currentRoute !== route) return;
  content.innerHTML = `<div class="split">${mascot('chef')}
      <section class="sheet success-card">
        <h2>✓ Entry ${displayNumber(number)} is in the competition!</h2>
        <p>Your pickle is now registered and ready for voting.</p>
        <div class="button-row">${link(`entry/${number}`, 'View Entry', 'purple-button')}${link('register', 'Register Another')}</div>
      </section>
    </div>`;
}

async function entryPage(number, route) {
  const frame = `${back('entries', 'Back to Entries')}${heading(`Pickle <em>${displayNumber(number)}</em>`)}`;
  renderPage(frame + statusBox('Looking up the entry…'));
  try {
    const entry = await api(`/api/pickles?number=${number}`);
    if (currentRoute !== route) return;
    const categoryLinks = Array.from(categories, ([id, {label}]) => link(`vote/${id}?q=${number}`, label)).join('');
    renderPage(frame + `<div class="entry-detail">
      <section class="sheet split">${pickleIcon}
        <div><strong>${displayNumber(number)}</strong><h2>${escapeHtml(entryName(entry))}</h2>
        ${entry.nickname ? `<p class="entry-nickname">Nickname: ${escapeHtml(entry.nickname)}</p>` : ''}
        ${entry.ownerName ? `<p class="entry-owner">${escapeHtml(ownerLabel(entry.ownerName))}</p>` : ''}
        <p>✓ Registered and in voting</p>
        <div class="button-row">${link(`vote?q=${number}`, 'Vote for this Pickle', 'purple-button')}
          <button class="delete-entry" type="button">Delete Pickle</button></div></div>
      </section>
      <section class="sheet category-links"><h2>Vote in these categories</h2>${categoryLinks}</section>
    </div>`);
    page.querySelector('.delete-entry').addEventListener('click', () => openDeleteDialog(number, route));
  } catch (error) {
    if (currentRoute === route) renderPage(frame + statusBox(error.message));
  }
}

const categoryDescriptions = {
  'best-tasting': 'Which pickle tastes the best?',
  'worst-tasting': 'Which pickle was the hardest to finish?',
  'most-unique': 'Which pickle surprised you the most?',
  'worst-looking': 'Which pickle looked the least appetizing?',
  'worst-smelling': 'Which pickle had the most off-putting smell?'
};

function voteCategories(query) {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
  const choices = Array.from(categories, ([id, {label, sprite}]) =>
    `<a class="sheet category-card" href="#vote/${id}${suffix}">${mascot(sprite)}<span>${label}</span></a>`
  ).join('');
  renderPage(`${back('top', 'Back to Home')}${heading('Pick a <em>Category</em>', 'Everyone can vote on this computer.')}<div class="category-grid">${choices}</div>`);
}

function entryDirectoryTitle() {
  return `<header class="wordmark directory-title">
    <span class="hero-prop siren" aria-hidden="true">🚨</span>
    <span class="burst" aria-hidden="true"><i></i><i></i><i></i></span>
    <h1 tabindex="-1">Browse Pickle <em>Entries</em></h1>
    <span class="burst" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="hero-prop hero-pickle" aria-hidden="true"></span>
  </header>`;
}

function entryCards(entries) {
  return `<div class="directory-grid">${entries.map(entry => `
    <article class="sheet directory-card">
      <div class="directory-art">${pickleIcon}</div>
      <div class="directory-summary">
        <h3>${displayNumber(entry.number)}</h3>
        <p class="entry-name">${escapeHtml(entry.name || entry.nickname || 'Unnamed Pickle')}</p>
        ${entry.ownerName ? `<p class="directory-owner">${escapeHtml(ownerLabel(entry.ownerName))}</p>` : ''}
      </div>
      <a class="lime-button" href="#entry/${entry.number}" aria-label="View entry ${displayNumber(entry.number)}">View</a>
    </article>`).join('')}</div>`;
}

function ballotCards(entries) {
  return `<div class="entry-grid">${entries.map(entry => `<article class="sheet entry-card">
      <a href="#entry/${entry.number}" aria-label="View Entry ${displayNumber(entry.number)}">${pickleIcon}</a>
      <strong>${displayNumber(entry.number)}</strong><p class="entry-name">${escapeHtml(entryName(entry))}</p>
      <button type="button" class="lime-button" data-entry="${entry.number}" aria-label="Vote for entry ${displayNumber(entry.number)}">Vote</button>
    </article>`).join('')}</div>`;
}

function directoryPage({ category, query = '' } = {}) {
  if (!category) page.classList.add('page--entries');
  const title = category
    ? back('vote', 'Back to Vote') + heading(`Vote: <em>${categories.get(category).label}</em>`, `${categoryDescriptions[category]} Cast your vote!`)
    : entryDirectoryTitle();
  renderPage(`${title}
    <div class="${category ? '' : 'directory'}">
      ${!category && deletedEntry ? statusBox(`Pickle ${displayNumber(deletedEntry)} was deleted.`) : ''}
      <form class="filter" aria-label="Search entries">
        <span class="magnifier" aria-hidden="true"></span>
        <input type="search" name="q" aria-label="Search by entry number or name" maxlength="60" value="${escapeHtml(query)}" placeholder="Search by entry number or name…">
        <button class="lime-button" type="submit">Search</button>
      </form>
      <div id="listing" aria-live="polite"></div>
    </div>`);
  if (!category) deletedEntry = undefined;
  const filter = page.querySelector('.filter');
  const input = filter.querySelector('input');
  const listing = page.querySelector('#listing');
  let request = 0;
  let currentPage = 1;
  let debounce;

  async function load() {
    const requestId = ++request;
    const params = new URLSearchParams({ q: input.value.trim(), page: currentPage });
    if (!category) params.set('view', 'directory');
    try {
      const { entries, hasNext, total } = await api(`/api/pickles?${params}`);
      if (!listing.isConnected || requestId !== request) return;
      const count = category ? '' : `<div class="directory-results">
        <h2>Search Results</h2><span>${total} ${total === 1 ? 'Entry' : 'Entries'}</span>
      </div>`;
      const pagination = currentPage > 1 || hasNext
        ? `<nav class="pagination" aria-label="Pages">
          <button class="lime-button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
          <span>Page ${currentPage}</span>
          <button class="lime-button" data-page="${currentPage + 1}" ${!hasNext ? 'disabled' : ''}>Next</button>
          </nav>` : '';
      if (!entries.length) {
        const emptyMessage = currentPage > 1 ? 'No entries on this page.'
          : input.value.trim() ? 'No entries match your search.' : 'No pickles have been registered yet.';
        listing.innerHTML = count + statusBox(emptyMessage) + pagination;
        return;
      }
      listing.innerHTML = count + (category ? ballotCards(entries) : entryCards(entries)) + pagination;
      if (category) {
        for (const button of listing.querySelectorAll('[data-entry]')) {
          const entry = entries.find(candidate => candidate.number === Number(button.dataset.entry));
          button.addEventListener('click', () => castVote(category, entry));
        }
      }
    } catch (error) {
      if (requestId === request) listing.innerHTML = statusBox(error.message);
    }
  }

  filter.addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(debounce);
    currentPage = 1;
    void load();
  });
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    request++;
    currentPage = 1;
    debounce = setTimeout(load, 200);
  });
  listing.addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    currentPage = Number(button.dataset.page);
    void load();
  });
  listing.innerHTML = statusBox('Loading entries…');
  void load();
}

function showDialog(title, description, content) {
  dialogTitle.textContent = title;
  dialogDescription.textContent = description;
  dialogBody.innerHTML = content;
  if (!dialog.open) dialog.showModal();
}

function openDeleteDialog(number, route) {
  showDialog(`Delete Pickle ${displayNumber(number)}?`, 'Deleting this pickle permanently removes the entry and all its votes.',
    `<form class="signup" id="delete-pickle">
      <label for="delete-code">Four-digit deletion code</label>
      <input class="field" id="delete-code" name="code" type="password" inputmode="numeric"
        pattern="[0-9]{4}" maxlength="4" autocomplete="off" required>
      <p class="feedback" role="alert" hidden></p>
      <div class="button-row">
        <button class="hot-button" type="submit">Delete Pickle</button>
        <button class="purple-button" type="button" data-cancel>Cancel</button>
      </div>
    </form>`);
  const form = dialogBody.querySelector('#delete-pickle');
  const input = form.elements.code;
  const cancel = form.querySelector('[data-cancel]');
  const submit = form.querySelector('[type="submit"]');
  const feedback = form.querySelector('.feedback');
  input.focus();
  cancel.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (deleting) return;
    const code = input.value;
    input.value = '';
    feedback.hidden = true;
    submit.disabled = cancel.disabled = input.disabled = deleting = true;
    try {
      await api('/api/pickles', { number: String(number), code }, 'DELETE');
      if (currentRoute === route) {
        deletedEntry = number;
        location.hash = 'entries';
      }
    } catch (error) {
      feedback.textContent = error.message;
      feedback.hidden = false;
    } finally {
      submit.disabled = cancel.disabled = input.disabled = deleting = false;
      if (dialog.open && form.isConnected && !feedback.hidden) input.focus();
    }
  });
}

async function castVote(category, entry) {
  const voteId = [...crypto.getRandomValues(new Uint8Array(16))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const route = currentRoute;
  const vote = { category, number: String(entry.number), pickleId: entry.id, voteId };
  let message = `✓ Vote counted for ${displayNumber(entry.number)}`;
  try {
    await api('/api/votes', vote).catch(error => {
      if (error.status && error.status < 500) throw error;
      return api('/api/votes', vote);
    });
  } catch (error) {
    if (!error.alreadyCounted) message = `Could not confirm vote. ${error.message}`;
  }
  if (currentRoute !== route) return;
  clearTimeout(voteStatusTimer);
  voteStatus.textContent = message;
  voteStatusTimer = setTimeout(() => { voteStatus.textContent = ''; }, 2200);
}

function updateLeaderboardCard(card, standings) {
  const list = card.querySelector('.leader-entries');
  const empty = card.querySelector('.leader-empty');
  const ranks = ['1st', '2nd', '3rd'];
  const existingRows = new Map(Array.from(list.children, row => [Number(row.dataset.number), row]));
  const rows = [];
  let rank = 0;

  for (const [index, entry] of standings.entries()) {
    if (entry.votes !== standings[index - 1]?.votes) rank = index + 1;
    if (rank > ranks.length) break;
    const tied = entry.votes === standings[index - 1]?.votes || entry.votes === standings[index + 1]?.votes;
    let row = existingRows.get(entry.number);
    if (!row) {
      row = document.createElement('li');
      row.className = 'leader-row';
      row.dataset.number = entry.number;
      row.innerHTML = `<a href="#entry/${entry.number}">
        <span class="leader-rank"></span>
        <span class="leader-entry"><strong></strong><span class="entry-name"></span></span>
        <span class="leader-votes"><strong></strong><span></span></span>
      </a>`;
    }
    row.toggleAttribute('data-first', rank === 1);
    const rankLabel = tied ? `Tied ${ranks[rank - 1]}` : ranks[rank - 1];
    const rankElement = row.querySelector('.leader-rank');
    if (rankElement.dataset.label !== rankLabel) {
      rankElement.dataset.label = rankLabel;
      rankElement.innerHTML = rank === 1 ? `<span aria-hidden="true">♛</span> ${rankLabel}` : rankLabel;
    }
    const number = row.querySelector('.leader-entry strong');
    if (!number.textContent) number.textContent = displayNumber(entry.number);
    const name = row.querySelector('.entry-name');
    const displayName = entry.nickname || entryName(entry);
    if (name.textContent !== displayName) {
      name.textContent = displayName;
      name.title = displayName;
    }
    const count = row.querySelector('.leader-votes strong');
    if (count.textContent !== String(entry.votes)) {
      count.textContent = entry.votes;
      row.querySelector('.leader-votes span').textContent = entry.votes === 1 ? 'vote' : 'votes';
    }
    rows.push(row);
    existingRows.delete(entry.number);
  }

  for (const row of existingRows.values()) row.remove();
  rows.forEach((row, index) => {
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
  });
  list.toggleAttribute('data-overflow', rows.length > 3);
  card.querySelector('.leader-more').hidden = rows.length <= 3;
  list.hidden = rows.length === 0;
  empty.hidden = rows.length > 0;
}

function leaderboard(route) {
  page.classList.add('page--leaderboard');
  const frame = `${back('top', 'Back to Home')}${heading(
    '<span aria-hidden="true">🏆</span> The Current <em>Leaders</em>',
    "See who's winning the pickle showdown."
  )}`;
  const categoryCards = Array.from(categories, ([id, {label, icon}]) => `
    <section class="leader-category" data-leader-category="${id}" aria-labelledby="leader-${id}">
      <h2 id="leader-${id}"><span class="leader-icon" aria-hidden="true">${icon}</span>${label}</h2>
      <ol class="leader-entries" role="list"></ol>
      <p class="leader-more" hidden>Scroll to see all tied entries</p>
      <p class="leader-empty" hidden>No votes yet — be the first!</p>
    </section>`).join('');
  renderPage(frame + `<div class="leader-list" hidden>${categoryCards}</div>
    <p class="leader-state" role="status">Loading the leaderboard…</p>`);
  const list = page.querySelector('.leader-list');
  const state = page.querySelector('.leader-state');
  const scorecards = Array.from(list.children);
  let pending = false;
  let previous;

  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const { totals } = await api('/api/results');
      if (route !== currentRoute) return;
      const snapshot = JSON.stringify(totals);
      if (snapshot !== previous) {
        for (const card of scorecards) {
          updateLeaderboardCard(card, totals.filter(row => row.category === card.dataset.leaderCategory));
        }
        previous = snapshot;
      }
      list.hidden = false;
      state.hidden = true;
    } catch {
      if (route !== currentRoute) return;
      state.textContent = previous === undefined
        ? 'Couldn’t load the leaderboard. Retrying…'
        : 'Live update unavailable. Showing the last totals while we retry.';
      state.hidden = false;
    } finally {
      pending = false;
    }
  }
  void refresh();
  leaderboardTimer = setInterval(refresh, 3000);
}

function hub() {
  const links = [
    ['register', '+', 'Register a Pickle', 'Add a new entry'],
    ['entries', '<span class="magnifier"></span>', 'Find an Entry', 'Look up a pickle by number or name'],
    ['vote', '✓', 'Vote', 'Cast your vote in each category'],
    ['results', '▥', 'Leaderboard', 'See the current category leaders']
  ];
  renderPage(`${back('top', 'Back to Home')}${heading('🏆 Contest <em>Hub</em>', 'Everything you need for the pickle competition.')}
    <div class="hub-grid">${links.map(([href, icon, title, detail]) =>
    `<a class="sheet hub-card" href="#${href}"><span class="tile-icon" aria-hidden="true">${icon}</span>
      <div><h2>${title}</h2><p>${detail}</p></div></a>`).join('')}</div>`);
}

function routePage() {
  currentRoute++;
  clearInterval(leaderboardTimer);
  clearTimeout(voteStatusTimer);
  voteStatus.textContent = '';
  if (dialog.open) dialog.close();
  const [path, search] = (location.hash.slice(1) || 'top').split('?');
  const [screen, subpage] = path.split('/');
  const query = new URLSearchParams(search).get('q')?.slice(0, 60);
  const isHome = screen === 'top';
  home.hidden = !isHome;
  page.hidden = isHome;
  page.className = 'page';
  const active = ['register', 'registered'].includes(screen) ? 'top' : screen === 'entry' ? 'entries' : screen;
  for (const navLink of document.querySelectorAll('.nav-links a, .hub-link')) {
    if (navLink.hash === `#${active}`) navLink.setAttribute('aria-current', 'location');
    else navLink.removeAttribute('aria-current');
  }
  const validNumber = /^[1-9][0-9]{0,6}$/.test(subpage ?? '');
  if (screen === 'register') registerPage();
  else if (screen === 'registered' && validNumber) void registeredPage(Number(subpage), currentRoute);
  else if (screen === 'entries') directoryPage({ query });
  else if (screen === 'entry' && validNumber) void entryPage(Number(subpage), currentRoute);
  else if (screen === 'vote' && categories.has(subpage)) directoryPage({ category: subpage, query });
  else if (screen === 'vote') voteCategories(query);
  else if (screen === 'results') leaderboard(currentRoute);
  else if (screen === 'hub') hub();
  else if (!isHome) renderPage(back('top', 'Back to Home') + heading('Page unavailable'));
  if (!isHome) page.querySelector('h1')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelector('#register').addEventListener('click', () => { location.hash = 'register'; });
for (const card of cards) {
  card.querySelector('button').addEventListener('click', () => { location.hash = `vote/${card.dataset.category}`; });
}

const search = document.querySelector('#search');
search.addEventListener('submit', async event => {
  event.preventDefault();
  const button = search.querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const number = search.elements.number.value;
    const route = currentRoute;
    const entry = await api(`/api/pickles?number=${encodeURIComponent(number)}`);
    if (currentRoute === route) location.hash = `entry/${entry.number}`;
  } catch (error) {
    if (!home.hidden) showDialog('Pickle lookup', error.message, '');
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#close-dialog').addEventListener('click', () => {
  if (!deleting) dialog.close();
});
dialog.addEventListener('cancel', event => {
  if (deleting) event.preventDefault();
});
window.addEventListener('hashchange', routePage);
routePage();
