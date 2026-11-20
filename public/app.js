const home = document.querySelector('#home');
const page = document.querySelector('#page');
const dialog = document.querySelector('#dialog');
const dialogTitle = document.querySelector('#dialog-title');
const dialogDescription = document.querySelector('#dialog-description');
const dialogBody = document.querySelector('#dialog-body');
const cards = Array.from(home.querySelectorAll('.card'));
const categories = new Map(cards.map(card => [
  card.dataset.category, {
    label: card.querySelector('h3').innerText.replace(/\s+/g, ' ').trim(),
    sprite: card.querySelector('.mascot').classList[1],
    icon: card.querySelector('.medal').textContent
  }
]));
const savedVotes = new Map();
let currentRoute = 0;
let casting = false;

async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'The party site is temporarily unavailable.');
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const displayNumber = number => '#' + String(number).padStart(3, '0');
const entryName = entry => entry.name || 'Unnamed Pickle';
const jar = (number = 0) => `<span class="jar" aria-hidden="true" style="--jar-hue:${[0, -6, 26, -29, 55, 238][number % 6]}deg"></span>`;
const mascot = sprite => `<span class="mascot ${sprite}" aria-hidden="true"></span>`;
const back = (href, label) => `<a class="back-link" href="#${href}">‹ ${label}</a>`;
const link = (href, label, style = 'lime-button') => `<a class="${style}" href="#${href}">${label}</a>`;
const heading = (title, intro = '') => `<header class="page-title"><h1 tabindex="-1">${title}</h1>${intro ? `<p>${intro}</p>` : ''}</header>`;
const statusBox = message => `<p class="sheet notice" role="status">${escapeHtml(message)}</p>`;

function renderPage(markup) {
  page.innerHTML = `<div class="page-inner">${markup}</div>`;
}
function renderHomeVotes() {
  for (const card of cards) {
    const category = card.dataset.category;
    const button = card.querySelector('button');
    const number = savedVotes.get(category);
    button.toggleAttribute('data-voted', Boolean(number));
    if (number) {
      button.textContent = `Voted ${displayNumber(number)}`;
      button.setAttribute('aria-label', `Change ${categories.get(category).label} vote for Pickle ${displayNumber(number)}`);
    }
  }
}

const ballotReady = api('/api/ballot').then(({ votes }) => {
  for (const vote of votes) savedVotes.set(vote.category, vote.pickle_number);
  renderHomeVotes();
}).catch(() => {});

function registerPage() {
  renderPage(`${back('top', 'Back to Home')}
    ${heading('Register a <em>Pickle</em>', 'Enter the number you received at the door to add your pickle to the competition.')}
    <div class="split">${jar()}<form class="sheet signup" id="signup">
      <label for="entry-number">Entry Number</label>
      <input class="field" id="entry-number" name="number" inputmode="numeric" pattern="[0-9]+" maxlength="7" autocomplete="off" placeholder="Enter your assigned number" required>
      <label for="entry-name">Pickle Name <span>(optional)</span></label>
      <input class="field" id="entry-name" name="name" maxlength="60" placeholder="e.g. Spicy Boi">
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
      <section class="sheet split">${jar(number)}
        <div><strong>${displayNumber(number)}</strong><h2>${escapeHtml(entryName(entry))}</h2><p>✓ Registered and in voting</p>
        ${link(`vote?q=${number}`, 'Vote for this Pickle', 'purple-button')}</div>
      </section>
      <section class="sheet category-links"><h2>Vote in these categories</h2>${categoryLinks}</section>
    </div>`);
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
  renderPage(`${back('top', 'Back to Home')}${heading('Pick a <em>Category</em>', 'One vote per category. Everyone can vote.')}<div class="category-grid">${choices}</div>`);
}

function entryRows(entries) {
  return `<div class="sheet entry-list"><table>
    <thead><tr><th scope="col">Entry #</th><th scope="col">Pickle Name</th><th scope="col">Actions</th></tr></thead>
    <tbody>${entries.map(entry => `<tr><td><strong class="entry-identifier">${jar(entry.number)}${displayNumber(entry.number)}</strong></td>
      <td class="entry-name">${escapeHtml(entryName(entry))}</td><td>${link(`entry/${entry.number}`, 'View')}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

function ballotCards(entries, category) {
  return `<div class="entry-grid">${entries.map(entry => {
    const selected = savedVotes.get(category) === entry.number;
    return `<article class="sheet entry-card" ${selected ? 'data-picked' : ''}>
      <a href="#entry/${entry.number}" aria-label="View Entry ${displayNumber(entry.number)}">${jar(entry.number)}</a>
      <strong>${displayNumber(entry.number)}</strong><p class="entry-name">${escapeHtml(entryName(entry))}</p>
      <button type="button" class="lime-button" data-entry="${entry.number}" aria-label="${selected ? 'Voted for' : 'Vote for'} entry ${displayNumber(entry.number)}">${selected ? '✓ Voted' : 'Vote'}</button>
    </article>`;
  }).join('')}</div>`;
}

function directoryPage({ category, query = '' } = {}) {
  const title = category ? `Vote: <em>${categories.get(category).label}</em>` : 'Pickle <em>Entries</em>';
  const intro = category ? `${categoryDescriptions[category]} Cast your vote!` : '';
  renderPage(`${category ? back('vote', 'Back to Vote') : back('top', 'Back to Home')}
    ${heading(title, intro)}
    <div class="${category ? '' : 'directory'}">
      <form class="filter" aria-label="Search entries">
        <span class="magnifier" aria-hidden="true"></span>
        <input type="search" name="q" aria-label="Search by entry number or name" maxlength="60" value="${escapeHtml(query)}" placeholder="Search by entry number or name…">
        <button class="lime-button" type="submit">Search</button>
      </form>
      <div id="listing" aria-live="polite"></div>
    </div>`);
  const filter = page.querySelector('.filter');
  const input = filter.querySelector('input');
  const listing = page.querySelector('#listing');
  let request = 0;
  let currentPage = 1;
  let debounce;

  async function load() {
    const requestId = ++request;
    const params = new URLSearchParams({ q: input.value.trim(), page: currentPage });
    try {
      const [{ entries, hasNext }] = await Promise.all([api(`/api/pickles?${params}`), ballotReady]);
      if (!listing.isConnected || requestId !== request) return;
      const pagination = currentPage > 1 || hasNext
        ? `<nav class="pagination" aria-label="Pages">
          <button class="lime-button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
          <span>Page ${currentPage}</span>
          <button class="lime-button" data-page="${currentPage + 1}" ${!hasNext ? 'disabled' : ''}>Next</button>
          </nav>` : '';
      if (!entries.length) {
        listing.innerHTML = statusBox(input.value.trim() ? 'No entries match your search.' : 'No pickles have been registered yet.') + pagination;
        return;
      }
      listing.innerHTML = (category ? ballotCards(entries, category) : entryRows(entries)) + pagination;
      if (category) {
        for (const button of listing.querySelectorAll('[data-entry]')) {
          const entry = entries.find(candidate => candidate.number === Number(button.dataset.entry));
          button.addEventListener('click', () => castVote(category, entry, load));
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

async function castVote(category, entry, refresh) {
  if (casting) return;
  casting = true;
  const label = categories.get(category).label;
  showDialog('Saving your vote…', `Voting for ${displayNumber(entry.number)} in ${label}.`, '');
  try {
    await ballotReady;
    const result = await api('/api/votes', { category, number: String(entry.number) });
    savedVotes.set(result.category, result.number);
    renderHomeVotes();
    showDialog('✓ Vote Cast!', `You voted for ${displayNumber(entry.number)}${entry.name ? ` ${entry.name}` : ''} in ${label}!`,
      `<div class="button-row"><button type="button" class="purple-button" data-close>Keep Voting</button>
       ${link(`entry/${entry.number}`, 'View Entry')}</div>`);
    dialogBody.querySelector('[data-close]').focus();
    dialogBody.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    void refresh();
  } catch (error) {
    showDialog('Vote could not be saved', error.message, '');
  } finally {
    casting = false;
  }
}

async function leaderboard(route) {
  const frame = `${back('top', 'Back to Home')}${heading('🏆 The Current <em>Leaders</em>', 'Top-voted pickles in each category.')}`;
  renderPage(frame + statusBox('Loading the leaderboard…'));
  try {
    const { totals } = await api('/api/results');
    if (route !== currentRoute) return;
    const leaders = Array.from(categories, ([id, {label}]) => {
      const ranked = totals.filter(row => row.category === id);
      const tiedLeaders = ranked.filter(row => row.votes === ranked[0]?.votes);
      const entries = tiedLeaders.map(row => `<a href="#entry/${row.number}">${jar(row.number)}<strong>${displayNumber(row.number)}</strong>
        <span class="entry-name">${escapeHtml(entryName(row))}</span><small>${row.votes} ${row.votes === 1 ? 'vote' : 'votes'}</small></a>`).join('');
      return `<section class="sheet leader-card"><h2>${label}</h2>${entries || '<p>No votes yet</p>'}</section>`;
    }).join('');
    renderPage(frame + `<div class="leader-grid">${leaders}</div>`);
  } catch (error) {
    if (route === currentRoute) renderPage(frame + statusBox(error.message));
  }
}

function hub() {
  const links = [
    ['register', '+', 'Register a Pickle', 'Add a new entry'],
    ['entries', '⌕', 'Find an Entry', 'Look up a pickle by number or name'],
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
  else if (screen === 'results') void leaderboard(currentRoute);
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
  if (!casting) dialog.close();
});
dialog.addEventListener('cancel', event => {
  if (casting) event.preventDefault();
});
window.addEventListener('hashchange', routePage);
routePage();
