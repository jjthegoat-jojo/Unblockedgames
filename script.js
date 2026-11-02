const FAVORITES_KEY = 'jords_favorite_ids';
const CUSTOM_COLUMNS_KEY = 'jords_custom_columns';
const COLUMN_ASSIGNMENTS_KEY = 'jords_column_assignments';

// Strict sandbox blocks window.open, target="_blank", and window.top.location redirects
const STRICT_SANDBOX =
  'allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock';
const DEFAULT_ALLOW =
  'fullscreen; autoplay; accelerometer; clipboard-read; clipboard-write; encrypted-media; gyroscope; gamepad';

const BUILTIN_COLUMN_ORDER = [
  'Favorites',
  'Sports',
  'Racing',
  'Action',
  'Skill',
  'Obby',
  'Puzzle',
  'Simulation',
  'Arcade'
];

let allGames = [];
let assetPrefix = '.';
let favoriteIds = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
let customColumns = loadJsonStorage(CUSTOM_COLUMNS_KEY, []);
let columnOverrides = loadJsonStorage(COLUMN_ASSIGNMENTS_KEY, {});
let expandedColumns = new Set();

let activeCategory = 'All';
let layoutMode = 'columns';
let searchQuery = '';
let organizerQuery = '';
let currentGame = null;
let wideMode = false;

// DOM Elements
const catalogSection = document.getElementById('catalogSection');
const playerSection = document.getElementById('playerSection');
const mainContainer = document.querySelector('.main-container');
const columnsBoard = document.getElementById('columnsBoard');
const gamesGrid = document.getElementById('gamesGrid');
const relatedGrid = document.getElementById('relatedGrid');
const categoryFilterBar = document.getElementById('categoryFilterBar');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const emptyState = document.getElementById('emptyState');
const emptyStateMsg = document.getElementById('emptyStateMsg');
const catalogHeading = document.getElementById('catalogHeading');
const gameCountLabel = document.getElementById('gameCountLabel');
const searchInput = document.getElementById('searchInput');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const randomGameBtn = document.getElementById('randomGameBtn');

// Side Organizer Elements
const sideOrganizer = document.getElementById('sideOrganizer');
const organizerTree = document.getElementById('organizerTree');
const organizerTotalCount = document.getElementById('organizerTotalCount');
const organizerSearchInput = document.getElementById('organizerSearchInput');
const toggleOrganizerMobileBtn = document.getElementById('toggleOrganizerMobileBtn');

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
const assignColumnSelect = document.getElementById('assignColumnSelect');

// Add Column Modal Elements
const addColumnModal = document.getElementById('addColumnModal');
const openAddColumnModalBtn = document.getElementById('openAddColumnModalBtn');
const closeColModalBtn = document.getElementById('closeColModalBtn');
const cancelColModalBtn = document.getElementById('cancelColModalBtn');
const addColumnForm = document.getElementById('addColumnForm');
const columnNameInput = document.getElementById('columnNameInput');
const columnGameFilterInput = document.getElementById('columnGameFilterInput');
const columnGameChecklist = document.getElementById('columnGameChecklist');
const toastBanner = document.getElementById('toastBanner');

let checklistSelectedIds = new Set();

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setVisible(el, visible) {
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  el.hidden = !visible;
}

function resolveLocalUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || /^(https?:|data:|blob:|\/\/)/i.test(url)) {
    return url;
  }
  const clean = url.replace(/^\.?\//, '');
  if (clean.startsWith('public/')) {
    return `./${clean}`;
  }
  return `${assetPrefix}/${clean}`;
}

function normalizeGameSrc(rawUrl) {
  const resolved = resolveLocalUrl(rawUrl);
  if (/\.games\.playgama\.(com|net|ai)\//i.test(resolved)) {
    return resolved.replace(/([?&])platform_id=playgama\b/i, '$1platform_id=mock');
  }
  return resolved;
}

let toastTimer = null;
function showToast(message) {
  if (!toastBanner) return;
  toastBanner.textContent = message;
  setVisible(toastBanner, true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    setVisible(toastBanner, false);
  }, 2600);
}

function getGameColumn(game) {
  if (columnOverrides[game.id]) {
    return columnOverrides[game.id];
  }
  return game.category || 'Arcade';
}

function getAllColumnNames() {
  const dynamicCats = [...new Set(allGames.map((g) => getGameColumn(g)))];
  const ordered = [...BUILTIN_COLUMN_ORDER];
  customColumns.forEach((col) => {
    if (!ordered.includes(col)) ordered.push(col);
  });
  dynamicCats.forEach((cat) => {
    if (!ordered.includes(cat)) ordered.push(cat);
  });
  return ordered;
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
}

function saveColumnState() {
  localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(customColumns));
  localStorage.setItem(COLUMN_ASSIGNMENTS_KEY, JSON.stringify(columnOverrides));
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
  renderAll();
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

function syncAssignColumnDropdown() {
  if (!assignColumnSelect || !currentGame) return;
  const cols = getAllColumnNames().filter((c) => c !== 'Favorites');
  assignColumnSelect.innerHTML = '';
  const currentCol = getGameColumn(currentGame);
  cols.forEach((col) => {
    const opt = document.createElement('option');
    opt.value = col;
    opt.textContent = `Column: ${col}`;
    if (col === currentCol) opt.selected = true;
    assignColumnSelect.appendChild(opt);
  });
}

function createIframeElement(iframeValue, title) {
  const trimmed = String(iframeValue || '').trim();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('title', title || 'Embedded Game');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.setAttribute('sandbox', STRICT_SANDBOX);
  iframe.setAttribute('allow', DEFAULT_ALLOW);

  if (trimmed.toLowerCase().startsWith('<iframe')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/html');
    const parsed = doc.querySelector('iframe');
    if (parsed) {
      const rawSrc = (parsed.getAttribute('src') || '').trim();
      const rawSrcdoc = parsed.getAttribute('srcdoc');
      const allow = parsed.getAttribute('allow');
      if (allow) iframe.setAttribute('allow', allow);
      if (rawSrc && rawSrc.toLowerCase() !== 'about:blank') {
        iframe.src = normalizeGameSrc(rawSrc);
        return iframe;
      }
      if (rawSrcdoc) {
        iframe.srcdoc = rawSrcdoc;
        return iframe;
      }
    }
  }

  iframe.src = normalizeGameSrc(trimmed);
  return iframe;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createMiniFallback(title, className = 'org-item-fallback') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = String(title || 'G').slice(0, 2).toUpperCase();
  return span;
}

function createThumbnailNode(game) {
  const fallback = document.createElement('div');
  fallback.className = 'thumb-fallback';
  fallback.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="4"></rect>
      <path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" stroke-linecap="round"></path>
    </svg>
    <span style="font-weight:600;font-size:0.86rem;">${escapeHtml(game.title)}</span>
  `;

  if (!game.thumbnail) {
    return fallback;
  }

  const wrapper = document.createDocumentFragment();
  const img = document.createElement('img');
  img.className = 'card-thumb-img';
  img.src = resolveLocalUrl(game.thumbnail);
  img.alt = `${game.title} cover`;
  img.referrerPolicy = 'no-referrer';
  img.loading = 'lazy';
  setVisible(fallback, false);

  img.addEventListener('error', () => {
    setVisible(img, false);
    setVisible(fallback, true);
  });

  wrapper.appendChild(img);
  wrapper.appendChild(fallback);
  return wrapper;
}

function renderFilterBar() {
  if (!categoryFilterBar) return;
  const cols = getAllColumnNames();
  categoryFilterBar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `filter-tab${activeCategory === 'All' ? ' active' : ''}`;
  allBtn.textContent = 'All Columns';
  allBtn.addEventListener('click', () => {
    activeCategory = 'All';
    renderCatalog();
  });
  categoryFilterBar.appendChild(allBtn);

  cols.forEach((colName) => {
    const count =
      colName === 'Favorites'
        ? allGames.filter((g) => favoriteIds.has(g.id)).length
        : allGames.filter((g) => getGameColumn(g) === colName).length;
    if (count === 0 && !customColumns.includes(colName) && colName !== 'Favorites') return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-tab${activeCategory === colName ? ' active' : ''}`;
    btn.textContent = `${colName} (${count})`;
    btn.addEventListener('click', () => {
      activeCategory = colName;
      renderCatalog();
    });
    categoryFilterBar.appendChild(btn);
  });

  document.querySelectorAll('[data-nav-cat]').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('data-nav-cat') === activeCategory && !currentGame);
  });
}

function buildColumnRow(game) {
  const row = document.createElement('div');
  row.className = 'col-game-row';

  const mainBtn = document.createElement('button');
  mainBtn.type = 'button';
  mainBtn.className = 'col-game-main-btn';

  if (game.thumbnail) {
    const img = document.createElement('img');
    img.className = 'col-game-thumb';
    img.src = resolveLocalUrl(game.thumbnail);
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.replaceWith(createMiniFallback(game.title, 'col-game-fallback'));
    });
    mainBtn.appendChild(img);
  } else {
    mainBtn.appendChild(createMiniFallback(game.title, 'col-game-fallback'));
  }

  const info = document.createElement('div');
  info.className = 'col-game-info';
  const nameEl = document.createElement('div');
  nameEl.className = 'col-game-name';
  nameEl.textContent = game.title;
  const subEl = document.createElement('div');
  subEl.className = 'col-game-sub';
  subEl.textContent = game.controls || 'Keyboard / Mouse';
  info.appendChild(nameEl);
  info.appendChild(subEl);
  mainBtn.appendChild(info);

  mainBtn.addEventListener('click', () => openGame(game.id));

  const isFav = favoriteIds.has(game.id);
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `fav-star-btn${isFav ? ' favorited' : ''}`;
  favBtn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Save to favorites');
  favBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linejoin="round"></polygon>
    </svg>
  `;
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(game.id);
  });

  row.appendChild(mainBtn);
  row.appendChild(favBtn);
  return row;
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

  const isFav = favoriteIds.has(game.id);
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `fav-star-btn${isFav ? ' favorited' : ''}`;
  favBtn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Save to favorites');
  favBtn.innerHTML = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linejoin="round"></polygon>
    </svg>
  `;
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(game.id);
  });

  topRow.appendChild(titleBtn);
  topRow.appendChild(favBtn);

  const metaLine = document.createElement('div');
  metaLine.className = 'unboxed-meta';
  metaLine.textContent = `${getGameColumn(game)} · ${game.controls || 'Keyboard / Mouse'}`;

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
  }

  article.appendChild(thumbBtn);
  article.appendChild(body);
  return article;
}

function getSearchMatchedGames() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return allGames;
  return allGames.filter((g) => {
    const col = getGameColumn(g);
    return `${g.title} ${col} ${g.controls} ${g.description}`.toLowerCase().includes(q);
  });
}

function deleteCustomColumn(colName) {
  customColumns = customColumns.filter((c) => c !== colName);
  Object.keys(columnOverrides).forEach((gameId) => {
    if (columnOverrides[gameId] === colName) {
      delete columnOverrides[gameId];
    }
  });
  if (activeCategory === colName) activeCategory = 'All';
  saveColumnState();
  renderAll();
  showToast(`Removed column "${colName}"`);
}

function renderCatalog() {
  renderFilterBar();
  const matched = getSearchMatchedGames();

  const filtered =
    activeCategory === 'All'
      ? matched
      : activeCategory === 'Favorites'
        ? matched.filter((g) => favoriteIds.has(g.id))
        : matched.filter((g) => getGameColumn(g) === activeCategory);

  if (catalogHeading) {
    catalogHeading.textContent = activeCategory === 'All' ? 'All Game Columns' : `${activeCategory} Column`;
  }
  if (gameCountLabel) {
    gameCountLabel.textContent = `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}`;
  }

  if (filtered.length === 0 && (activeCategory !== 'All' || !customColumns.length)) {
    setVisible(emptyState, true);
    setVisible(columnsBoard, false);
    setVisible(gamesGrid, false);
    if (emptyStateMsg) {
      emptyStateMsg.textContent =
        activeCategory === 'Favorites' && favoriteIds.size === 0
          ? 'No favorites saved yet. Click the star on any game to pin it to your Favorites column.'
          : 'No games match your current search or column selection.';
    }
    return;
  }

  setVisible(emptyState, false);

  if (layoutMode === 'columns') {
    setVisible(columnsBoard, true);
    setVisible(gamesGrid, false);
    if (!columnsBoard) return;
    columnsBoard.innerHTML = '';

    const colNames = activeCategory === 'All' ? getAllColumnNames() : [activeCategory];

    colNames.forEach((colName) => {
      const colGames =
        colName === 'Favorites'
          ? matched.filter((g) => favoriteIds.has(g.id))
          : matched.filter((g) => getGameColumn(g) === colName);

      const isCustom = customColumns.includes(colName);
      if (colGames.length === 0 && !isCustom) return;

      const colEl = document.createElement('section');
      colEl.className = 'game-column';

      const header = document.createElement('div');
      header.className = 'column-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'column-title-group';
      titleGroup.innerHTML = `
        <h2 class="column-title">${escapeHtml(colName)}</h2>
        <span class="unboxed-meta">${colGames.length}</span>
      `;
      header.appendChild(titleGroup);

      const actions = document.createElement('div');
      actions.className = 'column-header-actions';

      if (colName !== 'Favorites') {
        const addToColBtn = document.createElement('button');
        addToColBtn.type = 'button';
        addToColBtn.className = 'column-del-btn';
        addToColBtn.textContent = '+ Games';
        addToColBtn.title = `Add games to ${colName}`;
        addToColBtn.addEventListener('click', () => openColumnModalFor(colName));
        actions.appendChild(addToColBtn);
      }

      if (isCustom) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'column-del-btn';
        delBtn.textContent = 'Remove';
        delBtn.addEventListener('click', () => deleteCustomColumn(colName));
        actions.appendChild(delBtn);
      }

      if (actions.childNodes.length > 0) {
        header.appendChild(actions);
      }

      const listEl = document.createElement('div');
      listEl.className = 'column-items';

      if (colGames.length === 0) {
        const emptyNote = document.createElement('p');
        emptyNote.className = 'unboxed-meta';
        emptyNote.style.padding = '12px 6px';
        emptyNote.textContent = 'Empty column — open any game and select this column to place games here.';
        listEl.appendChild(emptyNote);
      } else {
        const isExpanded = expandedColumns.has(colName) || activeCategory === colName || searchQuery.trim().length > 0;
        const limit = isExpanded ? colGames.length : 24;
        colGames.slice(0, limit).forEach((g) => {
          listEl.appendChild(buildColumnRow(g));
        });

        if (colGames.length > limit) {
          const moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'col-more-btn';
          moreBtn.textContent = `Show all ${colGames.length} in ${colName}`;
          moreBtn.addEventListener('click', () => {
            expandedColumns.add(colName);
            renderCatalog();
          });
          listEl.appendChild(moreBtn);
        }
      }

      colEl.appendChild(header);
      colEl.appendChild(listEl);
      columnsBoard.appendChild(colEl);
    });
  } else {
    setVisible(columnsBoard, false);
    setVisible(gamesGrid, true);
    if (!gamesGrid) return;
    gamesGrid.innerHTML = '';
    const limit = searchQuery.trim() || activeCategory !== 'All' ? filtered.length : 80;
    filtered.slice(0, limit).forEach((g) => {
      gamesGrid.appendChild(buildGameCard(g, false));
    });
    if (filtered.length > limit) {
      const moreWrap = document.createElement('div');
      moreWrap.style.gridColumn = '1 / -1';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'col-more-btn';
      btn.textContent = `Load remaining ${filtered.length - limit} games`;
      btn.addEventListener('click', () => {
        filtered.slice(limit).forEach((g) => gamesGrid.insertBefore(buildGameCard(g, false), moreWrap));
        moreWrap.remove();
      });
      moreWrap.appendChild(btn);
      gamesGrid.appendChild(moreWrap);
    }
  }
}

function renderOrganizer() {
  if (!organizerTree) return;
  const q = organizerQuery.trim().toLowerCase();

  const matchingGames = allGames.filter((g) => {
    if (!q) return true;
    return `${g.title} ${getGameColumn(g)}`.toLowerCase().includes(q);
  });

  if (organizerTotalCount) {
    organizerTotalCount.textContent = `${matchingGames.length} games`;
  }

  const openGroups = new Set();
  organizerTree.querySelectorAll('details.org-group').forEach((det) => {
    const name = det.getAttribute('data-group');
    if (name && det.open) openGroups.add(name);
  });

  organizerTree.innerHTML = '';
  const groupsToBuild = getAllColumnNames();

  groupsToBuild.forEach((groupName, idx) => {
    const items =
      groupName === 'Favorites'
        ? matchingGames.filter((g) => favoriteIds.has(g.id))
        : matchingGames.filter((g) => getGameColumn(g) === groupName);

    if (items.length === 0 && !customColumns.includes(groupName)) return;

    const details = document.createElement('details');
    details.className = 'org-group';
    details.setAttribute('data-group', groupName);

    const hasActiveGame = currentGame && items.some((i) => i.id === currentGame.id);
    const shouldOpen = q.length > 0 || hasActiveGame || openGroups.has(groupName) || (openGroups.size === 0 && idx < 3);

    const summary = document.createElement('summary');
    summary.className = 'org-summary';
    summary.innerHTML = `
      <span class="org-summary-left">
        <svg class="org-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(groupName)}</span>
      </span>
      <span class="unboxed-meta">${items.length}</span>
    `;

    const list = document.createElement('div');
    list.className = 'org-list';

    let populated = false;
    function populateList() {
      if (populated) return;
      populated = true;
      items.forEach((game) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = currentGame && currentGame.id === game.id;
        btn.className = `org-item-btn${isActive ? ' active' : ''}`;
        btn.title = game.title;

        if (game.thumbnail) {
          const miniImg = document.createElement('img');
          miniImg.className = 'org-item-thumb';
          miniImg.src = resolveLocalUrl(game.thumbnail);
          miniImg.alt = '';
          miniImg.referrerPolicy = 'no-referrer';
          miniImg.loading = 'lazy';
          miniImg.addEventListener('error', () => {
            miniImg.replaceWith(createMiniFallback(game.title));
          });
          btn.appendChild(miniImg);
        } else {
          btn.appendChild(createMiniFallback(game.title));
        }

        const label = document.createElement('span');
        label.className = 'org-item-title';
        label.textContent = game.title;
        btn.appendChild(label);

        btn.addEventListener('click', () => {
          openGame(game.id);
          sideOrganizer?.classList.remove('mobile-open');
        });

        list.appendChild(btn);
      });
    }

    details.addEventListener('toggle', () => {
      if (details.open) populateList();
    });

    details.appendChild(summary);
    details.appendChild(list);
    if (shouldOpen) {
      details.open = true;
      populateList();
    }
    organizerTree.appendChild(details);
  });
}

function renderAll() {
  renderCatalog();
  renderOrganizer();
}

function openGame(gameId, updateHash = true) {
  const found = allGames.find((g) => g.id === gameId);
  if (!found) return;
  currentGame = found;

  setVisible(catalogSection, false);
  setVisible(playerSection, true);
  renderOrganizer();

  const col = getGameColumn(found);
  if (activeGameTitle) activeGameTitle.textContent = found.title;
  if (activeGameMeta) activeGameMeta.textContent = `${col} · ${found.controls || 'Keyboard / Mouse'}`;
  if (activeGameDesc) activeGameDesc.textContent = found.description || '';
  syncPlayerFavoriteButton();
  syncAssignColumnDropdown();

  mountCurrentIframe();

  if (relatedGrid) {
    const sameCol = allGames.filter((g) => g.id !== found.id && getGameColumn(g) === col).slice(0, 6);
    const others = sameCol.length > 0 ? sameCol : allGames.filter((g) => g.id !== found.id).slice(0, 6);
    relatedGrid.innerHTML = '';
    setVisible(relatedGrid.parentElement, others.length > 0);
    others.forEach((g) => relatedGrid.appendChild(buildGameCard(g, true)));
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
  setVisible(playerSection, false);
  setVisible(catalogSection, true);
  if (wideMode) {
    wideMode = false;
    mainContainer?.classList.remove('wide-mode');
    iframeStage?.classList.remove('wide-stage');
    if (theaterToggleBtn) theaterToggleBtn.textContent = 'Wide View';
  }
  renderAll();
  if (updateHash) {
    window.history.pushState(null, '', '#all');
  }
}

// Event Listeners
searchInput?.addEventListener('input', (e) => {
  searchQuery = e.target.value || '';
  renderCatalog();
});

organizerSearchInput?.addEventListener('input', (e) => {
  organizerQuery = e.target.value || '';
  renderOrganizer();
});

toggleOrganizerMobileBtn?.addEventListener('click', () => {
  sideOrganizer?.classList.toggle('mobile-open');
});

document.querySelectorAll('[data-layout]').forEach((btn) => {
  btn.addEventListener('click', () => {
    layoutMode = btn.getAttribute('data-layout') || 'columns';
    document.querySelectorAll('[data-layout]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-layout') === layoutMode);
    });
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

randomGameBtn?.addEventListener('click', () => {
  if (!allGames.length) return;
  const pick = allGames[Math.floor(Math.random() * allGames.length)];
  openGame(pick.id);
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

assignColumnSelect?.addEventListener('change', (e) => {
  if (!currentGame) return;
  const targetCol = e.target.value;
  columnOverrides[currentGame.id] = targetCol;
  saveColumnState();
  if (activeGameMeta) {
    activeGameMeta.textContent = `${targetCol} · ${currentGame.controls || 'Keyboard / Mouse'}`;
  }
  renderAll();
  showToast(`Moved "${currentGame.title}" to ${targetCol}`);
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

// Add Column Modal
function renderColumnChecklist(filterText = '') {
  if (!columnGameChecklist) return;
  const q = filterText.trim().toLowerCase();
  const subset = allGames
    .filter((g) => !q || g.title.toLowerCase().includes(q))
    .slice(0, 60);

  columnGameChecklist.innerHTML = '';
  subset.forEach((g) => {
    const label = document.createElement('label');
    label.className = 'checklist-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checklistSelectedIds.has(g.id);
    cb.addEventListener('change', () => {
      if (cb.checked) checklistSelectedIds.add(g.id);
      else checklistSelectedIds.delete(g.id);
    });
    const span = document.createElement('span');
    span.textContent = `${g.title} (${getGameColumn(g)})`;
    label.appendChild(cb);
    label.appendChild(span);
    columnGameChecklist.appendChild(label);
  });
}

const colModalTitleEl = document.getElementById('colModalTitle');
const colModalSubmitBtn = addColumnForm?.querySelector('button[type="submit"]');

function openColumnModalFor(presetColName = '') {
  checklistSelectedIds = new Set();
  const isExisting = Boolean(presetColName);
  if (isExisting) {
    allGames.forEach((g) => {
      if (getGameColumn(g) === presetColName) {
        checklistSelectedIds.add(g.id);
      }
    });
  }
  if (columnNameInput) {
    columnNameInput.value = presetColName;
    columnNameInput.readOnly = isExisting;
  }
  if (colModalTitleEl) {
    colModalTitleEl.textContent = isExisting ? `Organize "${presetColName}" Column` : 'Create New Column';
  }
  if (colModalSubmitBtn) {
    colModalSubmitBtn.textContent = isExisting ? 'Save Column' : 'Create Column';
  }
  if (columnGameFilterInput) columnGameFilterInput.value = '';
  renderColumnChecklist('');
  setVisible(addColumnModal, true);
  if (isExisting) {
    columnGameFilterInput?.focus();
  } else {
    columnNameInput?.focus();
  }
}

openAddColumnModalBtn?.addEventListener('click', () => {
  openColumnModalFor('');
});

columnGameFilterInput?.addEventListener('input', (e) => {
  renderColumnChecklist(e.target.value || '');
});

function hideColModal() {
  setVisible(addColumnModal, false);
}

closeColModalBtn?.addEventListener('click', hideColModal);
cancelColModalBtn?.addEventListener('click', hideColModal);
addColumnModal?.addEventListener('click', (e) => {
  if (e.target === addColumnModal) hideColModal();
});

addColumnForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const rawName = (columnNameInput?.value || '').trim();
  if (!rawName) return;

  const existedBefore = customColumns.includes(rawName) || BUILTIN_COLUMN_ORDER.includes(rawName);
  if (!existedBefore) {
    customColumns.push(rawName);
  }
  Object.keys(columnOverrides).forEach((gameId) => {
    if (columnOverrides[gameId] === rawName && !checklistSelectedIds.has(gameId)) {
      delete columnOverrides[gameId];
    }
  });
  checklistSelectedIds.forEach((gameId) => {
    columnOverrides[gameId] = rawName;
  });

  saveColumnState();
  hideColModal();
  layoutMode = 'columns';
  renderAll();
  showToast(existedBefore ? `Updated column "${rawName}"` : `Created column "${rawName}"`);
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

async function fetchGamesCatalog() {
  try {
    const res = await fetch('./games.json');
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json') || contentType.includes('text')) {
        assetPrefix = '.';
        return await res.json();
      }
    }
  } catch {
    // Fall through to ./public/games.json for raw unbuilt GitHub Pages deployments
  }

  const fallbackRes = await fetch('./public/games.json');
  if (!fallbackRes.ok) {
    throw new Error(`HTTP ${fallbackRes.status}`);
  }
  assetPrefix = './public';
  return await fallbackRes.json();
}

async function init() {
  setVisible(loadingState, true);
  setVisible(errorState, false);
  try {
    allGames = await fetchGamesCatalog();
    setVisible(loadingState, false);
    renderAll();
    handleHashRoute();
  } catch {
    setVisible(loadingState, false);
    setVisible(errorState, true);
  }
}

init();
