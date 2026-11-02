const FAVORITES_KEY = 'vp_favorite_ids';
const CUSTOM_GAMES_KEY = 'vp_custom_games';

let baseGames = [];
let allGames = [];
let favoriteIds = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
let activeCategory = 'All';
let searchQuery = '';
let currentGame = null;
let wideMode = false;

// DOM Elements
const catalogSection = document.getElementById('catalogSection');
const playerSection = document.getElementById('playerSection');
const mainContainer = document.querySelector('.main-container');
const gamesGrid = document.getElementById('gamesGrid');
const relatedGrid = document.getElementById('relatedGrid');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const emptyState = document.getElementById('emptyState');
const emptyStateMsg = document.getElementById('emptyStateMsg');
const catalogHeading = document.getElementById('catalogHeading');
const gameCountLabel = document.getElementById('gameCountLabel');
const searchInput = document.getElementById('searchInput');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

// Player Elements
const iframeStage = document.getElementById('iframeStage');
const iframeMount = document.getElementById('iframeMount');
const activeGameTitle = document.getElementById('activeGameTitle');
const activeGameMeta = document.getElementById('activeGameMeta');
const activeGameDesc = document.getElementById('activeGameDesc');
const backToCatalogBtn = document.getElementById('backToCatalogBtn');
const reloadIframeBtn = document.getElementById('reloadIframeBtn');
const theaterToggleBtn = document.getElementById('theaterToggleBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const playerFavBtn = document.getElementById('playerFavBtn');
const playerFavLabel = document.getElementById('playerFavLabel');

// Modal Elements
const addGameModal = document.getElementById('addGameModal');
const openAddModalBtn = document.getElementById('openAddModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const addGameForm = document.getElementById('addGameForm');
const jsonViewPane = document.getElementById('jsonViewPane');
const jsonCodePreview = document.getElementById('jsonCodePreview');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const resetCustomBtn = document.getElementById('resetCustomBtn');
const toastBanner = document.getElementById('toastBanner');

let toastTimer = null;
function showToast(message) {
  if (!toastBanner) return;
  toastBanner.textContent = message;
  toastBanner.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastBanner.classList.add('hidden');
  }, 2600);
}

function getCustomGames() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_GAMES_KEY) || '[]');
  } catch {
    return [];
  }
}

function mergeCatalog() {
  allGames = [...baseGames, ...getCustomGames()];
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
}

function toggleFavorite(gameId) {
  if (favoriteIds.has(gameId)) {
    favoriteIds.delete(gameId);
    showToast('Removed from Favorites');
  } else {
    favoriteIds.add(gameId);
    showToast('Saved to Favorites');
  }
  saveFavorites();
  renderCatalog();
  if (currentGame && currentGame.id === gameId) {
    syncPlayerFavoriteButton();
  }
}

function syncPlayerFavoriteButton() {
  if (!currentGame || !playerFavBtn || !playerFavLabel) return;
  const isFav = favoriteIds.has(currentGame.id);
  playerFavBtn.setAttribute('aria-pressed', String(isFav));
  playerFavLabel.textContent = isFav ? 'Saved' : 'Save';
}

/**
 * Safely parses an iframe HTML snippet or raw URL from games.json into a clean <iframe> element.
 */
function createIframeElement(iframeValue, title) {
  const trimmed = String(iframeValue || '').trim();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('title', title || 'Embedded Game');
  iframe.setAttribute('referrerpolicy', 'no-referrer');

  if (trimmed.toLowerCase().startsWith('<iframe')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/html');
    const parsed = doc.querySelector('iframe');
    if (parsed && parsed.getAttribute('src')) {
      iframe.src = parsed.getAttribute('src') || '';
      const allow = parsed.getAttribute('allow');
      if (allow) iframe.setAttribute('allow', allow);
      return iframe;
    }
  }

  iframe.src = trimmed;
  return iframe;
}

function createThumbnailNode(game) {
  const fallback = document.createElement('div');
  fallback.className = 'thumb-fallback';
  fallback.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="4"></rect>
      <path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" stroke-linecap="round"></path>
    </svg>
    <span style="font-weight:600;font-size:0.9rem;">${escapeHtml(game.title)}</span>
  `;

  if (!game.thumbnail) {
    return fallback;
  }

  const wrapper = document.createDocumentFragment();
  const img = document.createElement('img');
  img.className = 'card-thumb-img';
  img.src = game.thumbnail;
  img.alt = `${game.title} cover illustration`;
  img.referrerPolicy = 'no-referrer';
  img.loading = 'lazy';
  fallback.classList.add('hidden');

  img.addEventListener('error', () => {
    img.classList.add('hidden');
    fallback.classList.remove('hidden');
  });

  wrapper.appendChild(img);
  wrapper.appendChild(fallback);
  return wrapper;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildGameCard(game, compact = false) {
  const article = document.createElement('article');
  article.className = 'game-card';

  const thumbBtn = document.createElement('button');
  thumbBtn.type = 'button';
  thumbBtn.className = 'card-thumb-btn';
  thumbBtn.setAttribute('aria-label', `Play ${game.title}`);
  thumbBtn.appendChild(createThumbnailNode(game));
  thumbBtn.addEventListener('click', () => openGame(game.id));

  const body = document.createElement('div');
  body.className = 'card-body';

  const topRow = document.createElement('div');
  topRow.className = 'card-top-row';

  const titleBtn = document.createElement('button');
  titleBtn.type = 'button';
  titleBtn.className = 'card-title-btn';
  titleBtn.textContent = game.title;
  titleBtn.addEventListener('click', () => openGame(game.id));

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  const isFav = favoriteIds.has(game.id);
  favBtn.className = `fav-star-btn${isFav ? ' favorited' : ''}`;
  favBtn.setAttribute('aria-label', isFav ? `Remove ${game.title} from favorites` : `Save ${game.title} to favorites`);
  favBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linejoin="round"></polygon>
    </svg>
  `;
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(game.id);
  });

  topRow.appendChild(titleBtn);
  topRow.appendChild(favBtn);

  // Clean unboxed metadata with typographic separator
  const metaLine = document.createElement('div');
  metaLine.className = 'unboxed-meta';
  metaLine.textContent = `${game.category || 'Arcade'} · ${game.controls || 'Keyboard / Mouse'}`;

  body.appendChild(topRow);
  body.appendChild(metaLine);

  if (!compact) {
    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = game.description || '';
    body.appendChild(desc);

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'card-play-btn';
    playBtn.textContent = 'Play Now';
    playBtn.addEventListener('click', () => openGame(game.id));
    body.appendChild(playBtn);
  } else {
    body.style.padding = '14px';
  }

  article.appendChild(thumbBtn);
  article.appendChild(body);
  return article;
}

function getFilteredGames() {
  const q = searchQuery.trim().toLowerCase();
  return allGames.filter((g) => {
    const matchesCat =
      activeCategory === 'All'
        ? true
        : activeCategory === 'Favorites'
          ? favoriteIds.has(g.id)
          : g.category === activeCategory;
    if (!matchesCat) return false;
    if (!q) return true;
    const hay = `${g.title} ${g.category} ${g.controls} ${g.description}`.toLowerCase();
    return hay.includes(q);
  });
}

function syncActiveCategoryUI() {
  document.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-cat') === activeCategory);
  });
  document.querySelectorAll('[data-nav-cat]').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('data-nav-cat') === activeCategory && !currentGame);
  });
}

function renderCatalog() {
  if (!gamesGrid) return;
  syncActiveCategoryUI();

  const filtered = getFilteredGames();
  if (catalogHeading) {
    catalogHeading.textContent = activeCategory === 'All' ? 'All Games' : activeCategory;
  }
  if (gameCountLabel) {
    gameCountLabel.textContent = `${filtered.length} ${filtered.length === 1 ? 'title' : 'titles'}`;
  }

  gamesGrid.innerHTML = '';
  if (filtered.length === 0) {
    emptyState?.classList.remove('hidden');
    if (emptyStateMsg) {
      emptyStateMsg.textContent =
        activeCategory === 'Favorites' && favoriteIds.size === 0
          ? 'You have not saved any favorite games yet. Click the star icon on any game to save it here.'
          : 'No games match your current search or category filter.';
    }
  } else {
    emptyState?.classList.add('hidden');
    filtered.forEach((game) => {
      gamesGrid.appendChild(buildGameCard(game, false));
    });
  }
}

function openGame(gameId, updateHash = true) {
  const found = allGames.find((g) => g.id === gameId);
  if (!found) return;
  currentGame = found;

  catalogSection?.classList.add('hidden');
  playerSection?.classList.remove('hidden');
  syncActiveCategoryUI();

  if (activeGameTitle) activeGameTitle.textContent = found.title;
  if (activeGameMeta) activeGameMeta.textContent = `${found.category} · ${found.controls || 'Keyboard / Mouse'}`;
  if (activeGameDesc) activeGameDesc.textContent = found.description || '';
  syncPlayerFavoriteButton();

  mountCurrentIframe();

  if (relatedGrid) {
    relatedGrid.innerHTML = '';
    allGames
      .filter((g) => g.id !== found.id)
      .slice(0, 4)
      .forEach((g) => relatedGrid.appendChild(buildGameCard(g, true)));
  }

  if (updateHash) {
    window.history.pushState(null, '', `#play=${encodeURIComponent(found.id)}`);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mountCurrentIframe() {
  if (!currentGame || !iframeMount) return;
  iframeMount.innerHTML = '';
  const iframeEl = createIframeElement(currentGame.iframe, currentGame.title);
  iframeMount.appendChild(iframeEl);
  iframeEl.addEventListener('load', () => {
    try {
      iframeEl.contentWindow?.focus();
    } catch {
      // Cross-origin iframes handle focus on click
    }
  });
}

function closeGame(updateHash = true) {
  currentGame = null;
  if (iframeMount) iframeMount.innerHTML = '';
  playerSection?.classList.add('hidden');
  catalogSection?.classList.remove('hidden');
  if (wideMode) {
    wideMode = false;
    mainContainer?.classList.remove('wide-mode');
    iframeStage?.classList.remove('wide-stage');
    if (theaterToggleBtn) theaterToggleBtn.textContent = 'Wide View';
  }
  renderCatalog();
  if (updateHash) {
    window.history.pushState(null, '', '#all');
  }
}

// Event Listeners
searchInput?.addEventListener('input', (e) => {
  searchQuery = e.target.value || '';
  renderCatalog();
});

document.querySelectorAll('[data-cat]').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeCategory = btn.getAttribute('data-cat') || 'All';
    renderCatalog();
  });
});

document.querySelectorAll('[data-nav-cat]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    activeCategory = link.getAttribute('data-nav-cat') || 'All';
    if (currentGame) closeGame(false);
    renderCatalog();
    window.history.pushState(null, '', `#${activeCategory.toLowerCase()}`);
  });
});

document.getElementById('brandLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  activeCategory = 'All';
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  closeGame(true);
});

clearFiltersBtn?.addEventListener('click', () => {
  activeCategory = 'All';
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  renderCatalog();
});

backToCatalogBtn?.addEventListener('click', () => closeGame(true));

reloadIframeBtn?.addEventListener('click', () => {
  mountCurrentIframe();
  showToast('Game reloaded');
});

playerFavBtn?.addEventListener('click', () => {
  if (currentGame) toggleFavorite(currentGame.id);
});

theaterToggleBtn?.addEventListener('click', () => {
  wideMode = !wideMode;
  mainContainer?.classList.toggle('wide-mode', wideMode);
  iframeStage?.classList.toggle('wide-stage', wideMode);
  if (theaterToggleBtn) theaterToggleBtn.textContent = wideMode ? 'Standard View' : 'Wide View';
});

fullscreenBtn?.addEventListener('click', async () => {
  if (!iframeStage) return;
  try {
    if (!document.fullscreenElement) {
      await iframeStage.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    wideMode = true;
    mainContainer?.classList.add('wide-mode');
    iframeStage.classList.add('wide-stage');
    if (theaterToggleBtn) theaterToggleBtn.textContent = 'Standard View';
    showToast('Switched to expanded theater view');
  }
});

// Modal Controls
function setModalTab(tabName) {
  document.querySelectorAll('[data-modal-tab]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-modal-tab') === tabName);
  });
  if (tabName === 'json') {
    addGameForm?.classList.add('hidden');
    jsonViewPane?.classList.remove('hidden');
    if (jsonCodePreview) {
      jsonCodePreview.textContent = JSON.stringify(allGames, null, 2);
    }
  } else {
    jsonViewPane?.classList.add('hidden');
    addGameForm?.classList.remove('hidden');
  }
}

openAddModalBtn?.addEventListener('click', () => {
  setModalTab('add');
  addGameModal?.classList.remove('hidden');
});

function hideModal() {
  addGameModal?.classList.add('hidden');
}

closeModalBtn?.addEventListener('click', hideModal);
cancelModalBtn?.addEventListener('click', hideModal);
addGameModal?.addEventListener('click', (e) => {
  if (e.target === addGameModal) hideModal();
});

document.querySelectorAll('[data-modal-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setModalTab(btn.getAttribute('data-modal-tab') || 'add');
  });
});

addGameForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('gameTitleInput').value.trim();
  const category = document.getElementById('gameCategoryInput').value;
  const controls = document.getElementById('gameControlsInput').value.trim() || 'Keyboard / Mouse';
  const rawInput = document.getElementById('gameIframeInput').value.trim();
  const description = document.getElementById('gameDescInput').value.trim() || 'Custom iframe web game.';

  if (!title || !rawInput) return;

  const iframeMarkup = rawInput.toLowerCase().startsWith('<iframe')
    ? rawInput
    : `<iframe src="${rawInput.replace(/"/g, '&quot;')}" title="${title.replace(/"/g, '&quot;')}" width="100%" height="100%" frameborder="0" allowfullscreen loading="lazy"></iframe>`;

  const newEntry = {
    id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`,
    title,
    category,
    controls,
    description,
    thumbnail: '',
    iframe: iframeMarkup
  };

  const custom = getCustomGames();
  custom.push(newEntry);
  localStorage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(custom));
  mergeCatalog();
  addGameForm.reset();
  hideModal();
  renderCatalog();
  openGame(newEntry.id);
  showToast(`Added "${title}" to your library`);
});

downloadJsonBtn?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(allGames, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'games.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Downloaded games.json');
});

resetCustomBtn?.addEventListener('click', () => {
  localStorage.removeItem(CUSTOM_GAMES_KEY);
  mergeCatalog();
  if (jsonCodePreview) jsonCodePreview.textContent = JSON.stringify(allGames, null, 2);
  renderCatalog();
  showToast('Cleared custom games');
});

function handleHashRoute() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#play=')) {
    const id = decodeURIComponent(hash.slice('#play='.length));
    if (allGames.some((g) => g.id === id)) {
      openGame(id, false);
      return;
    }
  }
  if (currentGame) {
    closeGame(false);
  }
}

window.addEventListener('popstate', handleHashRoute);

async function init() {
  loadingState?.classList.remove('hidden');
  try {
    const res = await fetch('/games.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    baseGames = await res.json();
    mergeCatalog();
    loadingState?.classList.add('hidden');
    renderCatalog();
    handleHashRoute();
  } catch {
    loadingState?.classList.add('hidden');
    errorState?.classList.remove('hidden');
  }
}

init();
