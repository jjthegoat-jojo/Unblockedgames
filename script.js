import firebaseConfig from './firebase-applet-config.json';
import { INLINE_GAMES_CATALOG, PLAYGAMA_TRENDING_SLUGS } from './catalogFallback.js';

if (typeof window !== 'undefined') {
  window.__JORDS_BOOTED__ = true;
}

// Non-blocking optional Firebase runtime (guarantees zero blank screens if www.gstatic.com is blocked on school Wi-Fi)
export let db = null;
export let auth = { currentUser: null };
let googleProvider = null;
let firebaseReady = false;

let signInWithPopup = async () => {
  throw new Error('Cloud sync unavailable on restricted network');
};
let onAuthStateChanged = () => () => {};
let collection = () => ({});
let doc = () => ({});
let getDoc = async () => ({ exists: () => false, data: () => ({}) });
let getDocFromServer = async () => {};
let setDoc = async () => {
  throw new Error('Network restricted');
};
let updateDoc = async () => {};
let deleteDoc = async () => {};
let query = () => ({});
let where = () => ({});
let onSnapshot = () => () => {};
let serverTimestamp = () => new Date().toISOString();

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write'
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (!firebaseReady || !db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

let firebaseInitPromise = null;
function initFirebaseOptional() {
  if (firebaseInitPromise) return firebaseInitPromise;
  firebaseInitPromise = (async () => {
    try {
      const timeoutGuard = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase import timeout')), 3500)
      );
      const [fbApp, fbAuth, fbStore] = await Promise.race([
        Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
          import('firebase/firestore')
        ]),
        timeoutGuard
      ]);
      const firebaseApp = fbApp.initializeApp(firebaseConfig);
      db = fbStore.getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
      auth = fbAuth.getAuth(firebaseApp);
      googleProvider = new fbAuth.GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      signInWithPopup = fbAuth.signInWithPopup;
      onAuthStateChanged = fbAuth.onAuthStateChanged;
      collection = fbStore.collection;
      doc = fbStore.doc;
      getDoc = fbStore.getDoc;
      getDocFromServer = fbStore.getDocFromServer;
      setDoc = fbStore.setDoc;
      updateDoc = fbStore.updateDoc;
      deleteDoc = fbStore.deleteDoc;
      query = fbStore.query;
      where = fbStore.where;
      onSnapshot = fbStore.onSnapshot;
      serverTimestamp = fbStore.serverTimestamp;
      firebaseReady = true;

      void testConnection();

      if (!IS_GOOGLE_SITES_MODE) {
        onAuthStateChanged(auth, async (user) => {
          syncFooterAuthUI();
          syncSuggestionsInboxAuth(user);
          if (user) {
            await loadCloudWorkspace(user);
          } else {
            workspaceDocExists = false;
          }
        });
      }
    } catch {
      // School firewall or offline mode: portal & all 155 games + zero-network backups continue unaffected
      firebaseReady = false;
    }
  })();
  return firebaseInitPromise;
}

// Blueprint validation constants synced verbatim with firebase-blueprint.json & firestore.rules
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_COLUMN_REGEX = /^[a-zA-Z0-9 _-]+$/;
const VALID_SENDER_REGEX = /^[a-zA-Z0-9 _\-.]+$/;
const MAX_FAVORITE_IDS = 200;
const MAX_FAVORITE_ID_LEN = 120;
const MAX_CUSTOM_COLUMNS = 30;
const MAX_CUSTOM_COLUMN_LEN = 32;
const MAX_SENDER_LEN = 40;
const MIN_SUGGESTION_LEN = 2;
const MAX_SUGGESTION_LEN = 500;
const SUGGESTION_TARGET_ID = 'jords-ai-studio';
const ADMIN_OWNER_EMAIL = 'jojojohnson0425@gmail.com';
const ALLOWED_SERVER_SOURCES = new Set([
  'AI Studio',
  'Version 1',
  'Version 2',
  'Version 3',
  'Version 4',
  'Server 1',
  'Server 2',
  'Server 3',
  'Server 4',
  'Google Sites'
]);

const FAVORITES_KEY = 'jords_favorite_ids';
const RECENT_IDS_KEY = 'jords_recent_ids';
const CUSTOM_COLUMNS_KEY = 'jords_custom_columns';
const COLUMN_ASSIGNMENTS_KEY = 'jords_column_assignments';
const HOT_LIST_KEY = 'jords_hot_list_ids_v2';
const CLOAK_PRESET_KEY = 'jords_tab_cloak';
const PANIC_HOTKEY_KEY = 'jords_panic_hotkey_enabled';
const PANIC_PRESET_KEY = 'jords_panic_preset_v1';
const PANIC_CUSTOM_URL_KEY = 'jords_panic_custom_url_v1';
const PANIC_CUSTOM_TITLE_KEY = 'jords_panic_custom_title_v1';
const PANIC_KEYBIND_KEY = 'jords_panic_keybind_v1';
const SCRATCHPAD_KEY = 'jords_school_scratchpad';

const SHARED_WEBSITE_URL = 'https://ais-pre-n2xfecuxxm2xybnfyl23hz-903443430664.us-east1.run.app';
const IFRAME_EMBED_SNIPPET = `<iframe src="${SHARED_WEBSITE_URL}" title="Jordans V1.1" style="width:100%;height:100vh;border:0;margin:0;padding:0;overflow:hidden;" allow="fullscreen; autoplay; accelerometer; clipboard-read; clipboard-write; encrypted-media; gyroscope; gamepad; pointer-lock" referrerpolicy="no-referrer" allowfullscreen></iframe>`;

const posterUriCache = new Map();
function getFallbackPosterUri(game) {
  const key = String(game?.id || game?.title || 'game');
  if (posterUriCache.has(key)) return posterUriCache.get(key);
  const title = String(game?.title || 'Playgama Game')
    .replace(/[<>&"']/g, '')
    .slice(0, 28);
  const cat = String(game?.category || 'Playgama')
    .replace(/[<>&"']/g, '')
    .slice(0, 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#090d16"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/><circle cx="400" cy="50" r="95" fill="#9747ff" fill-opacity="0.22"/><circle cx="80" cy="230" r="110" fill="#c0ff47" fill-opacity="0.14"/><text x="240" y="132" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-weight="800" font-size="24">${title}</text><text x="240" y="166" text-anchor="middle" fill="#c0ff47" font-family="system-ui,sans-serif" font-weight="700" font-size="14">${cat} · Playgama</text></svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  posterUriCache.set(key, uri);
  return uri;
}

const LOCAL_GAMES_MAP = {
  'spaceflight-simulator': '/games/spaceflightsimulator/index.html',
  'bee-swarm-simulator': '/games/beeswarmsimulator/index.html',
  'retro-bowl': '/games/retrobowl/index.html',
  'slope': '/games/slope/index.html',
  'drive-mad': '/games/drivemad/index.html',
  'moto-x3m': '/games/motox3m/index.html',
  'basket-random': '/games/basketrandom/index.html'
};

function getPlaygamaEmbedUrl(game) {
  if (!game) return '';
  const id = String(game.id || '').trim();
  const isSites =
    typeof window !== 'undefined' &&
    (Boolean(window.__JORDS_GOOGLE_SITES_MODE__) ||
      window.location.hostname.includes('google') ||
      window.location.hostname.includes('googleusercontent'));
  const origin = isSites ? SHARED_WEBSITE_URL : '';

  if (LOCAL_GAMES_MAP[id]) {
    return `${origin}${LOCAL_GAMES_MAP[id]}`;
  }

  const raw = String(game.url || '').trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    if (raw.includes('/games/')) {
      return isSites ? (raw.startsWith(origin) ? raw : `${origin}${new URL(raw).pathname}`) : raw;
    }
    if (raw.includes('/api/proxy/game/')) {
      return isSites ? (raw.startsWith(origin) ? raw : `${origin}${new URL(raw).pathname}`) : raw;
    }
  }

  const slug = encodeURIComponent(id);
  return `${origin}/api/proxy/game/${slug}`;
}

function normalizeGamesForSitesEmbed(list) {
  return (Array.isArray(list) ? list : []).slice(0, 600).map((g) => {
    const rawThumb = String(g.thumbnail || '').trim();
    let validThumb = '';
    if (/^https?:\/\//i.test(rawThumb)) {
      validThumb = rawThumb;
    } else if (rawThumb.startsWith('./games/') || rawThumb.startsWith('/games/')) {
      validThumb = `${SHARED_WEBSITE_URL}${rawThumb.replace(/^\./, '')}`;
    }
    return {
      id: g.id,
      title: g.title,
      category: g.category || 'Action',
      url: getPlaygamaEmbedUrl(g),
      controls: g.controls || 'Desktop & Touch · Playgama',
      description: g.description || '',
      thumbnail: validThumb,
      poster: getFallbackPosterUri(g)
    };
  });
}

function buildSelfContainedSitesEmbedHtml(sourceGames) {
  const gamesList = normalizeGamesForSitesEmbed(
    Array.isArray(sourceGames) && sourceGames.length > 0
      ? sourceGames
      : Array.isArray(INLINE_GAMES_CATALOG)
        ? INLINE_GAMES_CATALOG
        : []
  );
  const safeJson = JSON.stringify(gamesList).replace(/<\//g, '<\\/');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Jordans V1.1</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      min-height: 100vh;
      background: #070709;
      color: #f8fafc;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
      overflow-y: auto;
    }
    button, input, select { font: inherit; }
    .hidden { display: none !important; }
    #authGate {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: radial-gradient(circle at 50% 25%, #16182c 0%, #070709 70%);
    }
    .auth-card {
      width: min(380px, 94vw);
      background: #10121a;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 18px;
      padding: 26px 22px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.65);
    }
    .auth-brand { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; color: #fff; }
    .auth-sub { font-size: 13px; color: #94a3b8; margin: 6px 0 18px; }
    .pin-slots { display: flex; justify-content: center; gap: 10px; margin-bottom: 14px; }
    .pin-box {
      width: 50px; height: 56px; border-radius: 12px;
      background: #070709; border: 2px solid rgba(255,255,255,0.16);
      display: grid; place-items: center; font-size: 24px; font-weight: 800; color: #c0ff47;
    }
    .pin-err { color: #f87171; font-size: 12px; margin-bottom: 10px; min-height: 16px; }
    .keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .kbtn {
      height: 46px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);
      background: #171a26; color: #fff; font-weight: 700; font-size: 17px; cursor: pointer;
    }
    .kbtn:hover { background: #222638; border-color: #c0ff47; }
    .btn-main {
      width: 100%; padding: 12px 16px; border-radius: 10px; border: 0;
      background: #c0ff47; color: #070709; font-weight: 800; font-size: 14px; cursor: pointer;
    }
    .hdr {
      position: sticky; top: 0; z-index: 40;
      background: rgba(7, 7, 9, 0.92); backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }
    .brand { font-size: 19px; font-weight: 800; color: #fff; background: none; border: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    .brand-dot { width: 26px; height: 26px; border-radius: 7px; background: #c0ff47; color: #070709; display: grid; place-items: center; font-weight: 900; font-size: 15px; }
    .nav { display: flex; gap: 6px; flex-wrap: wrap; }
    .nbtn {
      padding: 7px 12px; border-radius: 8px; border: 1px solid transparent;
      background: transparent; color: #cbd5e1; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    .nbtn.active, .nbtn:hover { background: rgba(192,255,71,0.14); color: #c0ff47; border-color: rgba(192,255,71,0.3); }
    .hdr-right { display: flex; align-items: center; gap: 8px; }
    .panic-btn {
      padding: 7px 14px; border-radius: 8px; border: 0;
      background: #ef4444; color: #fff; font-weight: 800; font-size: 13px; text-decoration: none; cursor: pointer;
    }
    .ghost-btn {
      padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14);
      background: #131620; color: #e2e8f0; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    .ghost-btn:hover { border-color: #c0ff47; color: #fff; }
    .wrap { max-width: 1400px; margin: 0 auto; padding: 18px; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .search {
      flex: 1; min-width: 220px; padding: 11px 14px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14); background: #11131c; color: #fff; font-size: 14px;
    }
    .cats { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 16px; }
    .cat-pill {
      white-space: nowrap; padding: 6px 12px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.1); background: #11131c; color: #cbd5e1; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .cat-pill.active { background: #c0ff47; color: #070709; border-color: #c0ff47; font-weight: 800; }
    .sec-title { font-size: 18px; font-weight: 800; margin: 14px 0 10px; display: flex; align-items: center; justify-content: space-between; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(195px, 1fr)); gap: 12px; }
    .card {
      background: #11131c; border: 1px solid rgba(255,255,255,0.09); border-radius: 12px;
      overflow: hidden; cursor: pointer; text-align: left; transition: transform 0.14s ease, border-color 0.14s ease;
      display: flex; flex-direction: column;
    }
    .card:hover { transform: translateY(-3px); border-color: #c0ff47; }
    .thumb {
      width: 100%; aspect-ratio: 16/10; background: #141824;
      position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
    }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cbody { padding: 10px 12px; }
    .ctitle { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cmeta { font-size: 11px; color: #94a3b8; margin-top: 3px; }
    .pbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .stage {
      position: relative; width: 100%; height: clamp(460px, 74vh, 720px);
      background: #07090f; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12);
    }
    .stage.pseudo-fs { position: fixed; inset: 0; width: 100vw; height: 100vh; height: 100dvh; z-index: 90; border-radius: 0; border: 0; }
    .scard { background: #11131c; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
    .pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 8px; margin: 12px 0; }
    .pbtn { padding: 9px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: #171a26; color: #e2e8f0; font-weight: 600; font-size: 13px; cursor: pointer; }
    .pbtn.active { border-color: #c0ff47; background: rgba(192,255,71,0.15); color: #c0ff47; }
    .finput { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: #090b10; color: #fff; margin-top: 6px; }
    #panicScreen { position: fixed; inset: 0; z-index: 999; background: #f8fafc; color: #0f172a; display: flex; flex-direction: column; }
    .pdis-hdr { height: 56px; background: #1d4ed8; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-weight: 700; }
    .pdis-grid { max-width: 960px; width: 100%; margin: 28px auto; padding: 0 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
    .pdis-tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
  </style>
</head>
<body>
  <main id="authGate">
    <div class="auth-card">
      <div class="auth-brand">Jordans V1.1</div>
      <p class="auth-sub">Enter the 4-digit access code to open Jordans V1.1.</p>
      <div class="pin-slots">
        <div class="pin-box" id="ps0"></div>
        <div class="pin-box" id="ps1"></div>
        <div class="pin-box" id="ps2"></div>
        <div class="pin-box" id="ps3"></div>
      </div>
      <div class="pin-err" id="pinErr"></div>
      <div class="keypad" id="pinKeypad">
        <button type="button" class="kbtn" data-k="1">1</button>
        <button type="button" class="kbtn" data-k="2">2</button>
        <button type="button" class="kbtn" data-k="3">3</button>
        <button type="button" class="kbtn" data-k="4">4</button>
        <button type="button" class="kbtn" data-k="5">5</button>
        <button type="button" class="kbtn" data-k="6">6</button>
        <button type="button" class="kbtn" data-k="7">7</button>
        <button type="button" class="kbtn" data-k="8">8</button>
        <button type="button" class="kbtn" data-k="9">9</button>
        <button type="button" class="kbtn" data-act="clear">Clear</button>
        <button type="button" class="kbtn" data-k="0">0</button>
        <button type="button" class="kbtn" data-act="back">⌫</button>
      </div>
      <button type="button" class="btn-main" id="unlockBtn">Enter Jordans V1.1</button>
    </div>
  </main>

  <div id="portalApp" class="hidden">
    <header class="hdr">
      <button type="button" class="brand" id="homeLogoBtn">
        <span class="brand-dot">J</span>
        <span>Jordans V1.1</span>
      </button>
      <nav class="nav" id="topNav">
        <button type="button" class="nbtn active" data-cat="Home">Home</button>
        <button type="button" class="nbtn" data-cat="Trending">Trending</button>
        <button type="button" class="nbtn" data-cat="Simulation">Simulation</button>
        <button type="button" class="nbtn" data-cat="Sports">Sports</button>
        <button type="button" class="nbtn" data-cat="Racing">Racing</button>
      </nav>
      <div class="hdr-right">
        <a id="panicTopLink" href="https://classroom.google.com/" target="_blank" rel="noopener noreferrer" class="panic-btn">Panic</a>
        <button type="button" class="ghost-btn" id="openSettingsBtn">Settings</button>
      </div>
    </header>

    <div class="wrap">
      <section id="catalogView">
        <div class="toolbar">
          <input type="search" id="searchBox" class="search" placeholder="Search Retro Bowl, Bee Swarm Simulator, Spaceflight Simulator, Slope..." />
          <button type="button" class="ghost-btn" id="randBtn">Random Game</button>
        </div>
        <div class="cats" id="catBar"></div>
        <div class="sec-title">
          <span id="secHeading">Featured &amp; Unblocked Games</span>
          <span id="countLbl" style="font-size:12px;color:#94a3b8;font-weight:600;"></span>
        </div>
        <div id="emptyNotice" class="scard hidden" style="text-align:center;color:#cbd5e1;"></div>
        <div class="grid" id="gamesGrid"></div>
      </section>

      <section id="playerView" class="hidden">
        <div class="pbar">
          <button type="button" class="ghost-btn" id="backBtn">← Back to Games</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="ghost-btn" id="cleanWinBtn">Clean Tab ↗</button>
            <button type="button" class="ghost-btn" id="reloadBtn">Restart</button>
            <button type="button" class="ghost-btn" id="fsBtn">Fullscreen</button>
          </div>
        </div>
        <div class="stage" id="stageBox">
          <div id="frameMount" style="width:100%;height:100%;position:relative;"></div>
        </div>
        <div style="margin-top:12px;">
          <h2 id="pTitle" style="font-size:20px;font-weight:800;"></h2>
          <p id="pMeta" style="font-size:12px;color:#94a3b8;margin-top:4px;"></p>
          <p id="pDesc" style="font-size:13px;color:#cbd5e1;margin-top:6px;"></p>
        </div>
      </section>

      <section id="settingsView" class="hidden">
        <div class="pbar">
          <button type="button" class="ghost-btn" id="closeSettingsBtn">← Back to Jordans V1.1</button>
        </div>
        <div class="scard">
          <h2 style="font-size:18px;font-weight:800;">Panic Mode App &amp; Custom Keybind</h2>
          <p style="font-size:13px;color:#94a3b8;margin-top:4px;">Pick any school app for your Panic button &amp; custom keybind. Type 0425 on the disguise screen to return.</p>
          <div class="pgrid" id="panicPresets">
            <button type="button" class="pbtn active" data-p="classroom">Google Classroom</button>
            <button type="button" class="pbtn" data-p="clever">Clever Portal</button>
            <button type="button" class="pbtn" data-p="docs">Google Docs</button>
            <button type="button" class="pbtn" data-p="drive">Google Drive</button>
            <button type="button" class="pbtn" data-p="canvas">Canvas</button>
            <button type="button" class="pbtn" data-p="ixl">IXL</button>
            <button type="button" class="pbtn" data-p="desmos">Desmos</button>
            <button type="button" class="pbtn" data-p="custom">Custom App / URL</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px;">
            <div>
              <label style="font-size:12px;color:#cbd5e1;">Custom App Title</label>
              <input id="customPanicTitle" class="finput" placeholder="Clever | Portal" />
            </div>
            <div>
              <label style="font-size:12px;color:#cbd5e1;">Custom App URL</label>
              <input id="customPanicUrl" class="finput" placeholder="https://clever.com/in/launchpad" />
            </div>
          </div>
          <div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button type="button" class="btn-main" id="savePanicBtn" style="width:auto;">Save Panic App</button>
            <button type="button" class="ghost-btn" id="recordKeyBtn">Keybind: \` (Click to Change)</button>
          </div>
        </div>
      </section>
    </div>
  </div>

  <section id="panicScreen" class="hidden">
    <div class="pdis-hdr" id="panicHdr">
      <span id="panicHdrTitle">Classes · Google Classroom</span>
      <div style="display:flex;gap:10px;align-items:center;">
        <a id="panicRealOpen" href="https://classroom.google.com/" target="_blank" rel="noopener noreferrer" style="color:#fff;font-size:13px;">Open Full App ↗</a>
        <button type="button" id="exitPanicBtn" style="width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,0.22);color:#fff;font-weight:700;font-size:13px;display:grid;place-items:center;cursor:pointer;" aria-label="Student Profile" title="Student Profile">S</button>
      </div>
    </div>
    <div class="pdis-grid">
      <div class="pdis-tile"><h3>Daily Assignments</h3><p style="font-size:12px;color:#64748b;margin-top:4px;">Unit 4 Reading &amp; Lab Worksheet</p></div>
      <div class="pdis-tile"><h3>Google Docs</h3><p style="font-size:12px;color:#64748b;margin-top:4px;">Essay Draft — Edited today</p></div>
      <div class="pdis-tile"><h3>Desmos Calculator</h3><p style="font-size:12px;color:#64748b;margin-top:4px;">Graphing &amp; Scientific Workspace</p></div>
      <div class="pdis-tile"><h3>Clever Launchpad</h3><p style="font-size:12px;color:#64748b;margin-top:4px;">District Student Resources</p></div>
    </div>
  </section>

  <script>
  (function () {
    var GAMES = ${safeJson};
    var PIN = "0425";
    var TRENDING_IDS = ["retro-bowl","bee-swarm-simulator","spaceflight-simulator","slope","drive-mad","bit-life","minecraft-classic","super-mario-64","polytrack","fnaf","google-snake","drift-hunters","obby-speed-escape","bloons-tower-defense-2"];
    var PRESETS = {
      classroom: { label: "Google Classroom", url: "https://classroom.google.com/", color: "#15803d" },
      clever: { label: "Clever | Portal", url: "https://clever.com/in/launchpad", color: "#2563eb" },
      docs: { label: "Untitled document - Google Docs", url: "https://docs.google.com/document/u/0/", color: "#1d4ed8" },
      drive: { label: "My Drive - Google Drive", url: "https://drive.google.com/drive/my-drive", color: "#0f766e" },
      canvas: { label: "Dashboard | Canvas", url: "https://canvas.instructure.com/", color: "#dc2626" },
      ixl: { label: "IXL | Dashboard", url: "https://www.ixl.com/", color: "#059669" },
      desmos: { label: "Desmos | Scientific Calculator", url: "https://www.desmos.com/scientific", color: "#166534" }
    };

    function boot() {
      var unlocked = false, pinBuf = "", disBuf = "", activeCat = "Home", query = "";
      var curGame = null, stopGame = null;
      var panicPreset = "classroom", customTitle = "Clever | Portal", customUrl = "https://clever.com/in/launchpad";
      var panicKey = "\`", recordingKey = false, lastEsc = 0;

      var gate = document.getElementById("authGate");
      var app = document.getElementById("portalApp");
      var pinErr = document.getElementById("pinErr");
      var grid = document.getElementById("gamesGrid");
      var catBar = document.getElementById("catBar");
      var emptyNotice = document.getElementById("emptyNotice");
      var countLbl = document.getElementById("countLbl");
      var secHeading = document.getElementById("secHeading");
      var catalogView = document.getElementById("catalogView");
      var playerView = document.getElementById("playerView");
      var settingsView = document.getElementById("settingsView");
      var frameMount = document.getElementById("frameMount");
      var stageBox = document.getElementById("stageBox");
      var panicScreen = document.getElementById("panicScreen");
      var panicTopLink = document.getElementById("panicTopLink");

      function cleanStage() {
        if (stopGame) { try { stopGame(); } catch (e) {} stopGame = null; }
        frameMount.innerHTML = "";
      }

      function syncPin() {
        for (var i = 0; i < 4; i++) {
          var el = document.getElementById("ps" + i);
          if (el) el.textContent = pinBuf[i] ? "●" : "";
        }
      }
      function pushDigit(d) {
        if (unlocked || pinBuf.length >= 4) return;
        pinErr.textContent = "";
        pinBuf += d;
        syncPin();
        if (pinBuf.length === 4) {
          if (pinBuf === PIN) {
            unlocked = true; pinBuf = "";
            gate.classList.add("hidden"); app.classList.remove("hidden");
            renderCategories(); renderGrid();
          } else {
            pinErr.textContent = "Incorrect code. Try again.";
            setTimeout(function () { pinBuf = ""; syncPin(); }, 360);
          }
        }
      }

      document.getElementById("pinKeypad").addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        var k = b.getAttribute("data-k"), act = b.getAttribute("data-act");
        if (k !== null) pushDigit(k);
        else if (act === "clear") { pinBuf = ""; syncPin(); }
        else if (act === "back") { pinBuf = pinBuf.slice(0, -1); syncPin(); }
      });
      document.getElementById("unlockBtn").addEventListener("click", function () {
        if (pinBuf === PIN) { unlocked = true; gate.classList.add("hidden"); app.classList.remove("hidden"); renderCategories(); renderGrid(); }
        else pinErr.textContent = "Enter 4-digit access code.";
      });

      function getPanicTarget() {
        if (panicPreset === "custom") {
          var u = (customUrl || "https://clever.com/in/launchpad").trim();
          if (!/^https?:\\/\\//i.test(u)) u = "https://" + u;
          return { label: customTitle || "Clever | Portal", url: u, color: "#2563eb" };
        }
        return PRESETS[panicPreset] || PRESETS.classroom;
      }
      function syncPanicLinks() {
        var t = getPanicTarget();
        panicTopLink.href = t.url;
        document.getElementById("panicRealOpen").href = t.url;
        document.getElementById("panicHdrTitle").textContent = t.label;
        document.getElementById("panicHdr").style.background = t.color;
      }
      syncPanicLinks();

      function triggerPanic() {
        var t = getPanicTarget();
        cleanStage();
        document.title = t.label;
        panicScreen.classList.remove("hidden");
        try { if (window.top && window.top !== window) window.top.location.replace(t.url); } catch (err) {}
      }
      panicTopLink.addEventListener("click", function () { triggerPanic(); });
      document.getElementById("exitPanicBtn").addEventListener("click", function () {
        panicScreen.classList.add("hidden");
        document.title = "Jordans V1.1";
      });

      var cats = ["Home", "Trending"];
      GAMES.forEach(function (g) { if (g.category && cats.indexOf(g.category) === -1) cats.push(g.category); });

      function renderCategories() {
        catBar.innerHTML = "";
        cats.forEach(function (c) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "cat-pill" + (activeCat === c && !query ? " active" : "");
          b.textContent = c;
          b.addEventListener("click", function () {
            activeCat = c; query = ""; document.getElementById("searchBox").value = "";
            showView("catalog"); renderCategories(); renderGrid();
          });
          catBar.appendChild(b);
        });
        document.querySelectorAll("#topNav .nbtn").forEach(function (nb) {
          nb.classList.toggle("active", nb.getAttribute("data-cat") === activeCat && !query);
        });
      }

      function renderGrid() {
        var q = query.trim().toLowerCase();
        if (q && (q.indexOf("subway") !== -1 || q === "subway-surfers")) {
          grid.innerHTML = "";
          emptyNotice.textContent = "Subway Surfers — Game Deleted (Removed rip-off build).";
          emptyNotice.classList.remove("hidden");
          countLbl.textContent = "0 games";
          return;
        }
        var list = GAMES.filter(function (g) {
          if (q) return (g.title + " " + g.category + " " + g.description).toLowerCase().indexOf(q) !== -1;
          if (activeCat === "Home") return true;
          if (activeCat === "Trending") return TRENDING_IDS.indexOf(g.id) !== -1;
          return g.category === activeCat;
        });
        if (!q && activeCat === "Home") {
          list.sort(function (a, b) {
            var ia = TRENDING_IDS.indexOf(a.id), ib = TRENDING_IDS.indexOf(b.id);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return 0;
          });
        }
        secHeading.textContent = q ? 'Search: "' + query.trim() + '"' : activeCat === "Home" ? "Featured & Unblocked Games" : activeCat;
        countLbl.textContent = list.length + " games";
        emptyNotice.classList.toggle("hidden", list.length > 0);
        if (!list.length) emptyNotice.textContent = "No matching games found.";
        grid.innerHTML = "";
        list.forEach(function (g) {
          var card = document.createElement("button");
          card.type = "button";
          card.className = "card";
          var th = document.createElement("div");
          th.className = "thumb";
          var img = document.createElement("img");
          img.src = g.thumbnail || g.poster;
          img.alt = g.title;
          img.loading = "lazy";
          img.referrerPolicy = "no-referrer";
          img.onerror = function () { if (g.poster && img.src !== g.poster) img.src = g.poster; };
          th.appendChild(img);
          var cb = document.createElement("div");
          cb.className = "cbody";
          var ct = document.createElement("div");
          ct.className = "ctitle";
          ct.textContent = g.title;
          var cm = document.createElement("div");
          cm.className = "cmeta";
          cm.textContent = g.category + " · Instant Play";
          cb.appendChild(ct); cb.appendChild(cm);
          card.appendChild(th); card.appendChild(cb);
          card.addEventListener("click", function () { openGame(g); });
          grid.appendChild(card);
        });
      }

      function mountDirectStage(g) {
        cleanStage();
        document.getElementById("pTitle").textContent = g.title;
        document.getElementById("pMeta").textContent = g.category + " · Instant Play";
        document.getElementById("pDesc").textContent = g.description || "";
        var ifr = document.createElement("iframe");
        var targetUrl = g.url || ("https://ais-pre-n2xfecuxxm2xybnfyl23hz-903443430664.us-east1.run.app/api/proxy/game/" + encodeURIComponent(g.id));
        ifr.src = targetUrl;
        ifr.title = g.title;
        ifr.style.cssText = "width:100%;height:100%;border:0;display:block;background:#07090f;";
        ifr.setAttribute("referrerpolicy", "no-referrer");
        ifr.setAttribute("allow", "fullscreen; autoplay; accelerometer; clipboard-read; clipboard-write; encrypted-media; gyroscope; gamepad; pointer-lock; web-share; xr-spatial-tracking; picture-in-picture");
        ifr.setAttribute("allowfullscreen", "true");
        frameMount.appendChild(ifr);
        stopGame = function () {
          try { ifr.src = "about:blank"; } catch (e) {}
        };
      }

      function showView(v) {
        if (v !== "player") cleanStage();
        catalogView.classList.toggle("hidden", v !== "catalog");
        playerView.classList.toggle("hidden", v !== "player");
        settingsView.classList.toggle("hidden", v !== "settings");
      }

      function openGame(g) {
        curGame = g;
        showView("player");
        mountDirectStage(g);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      document.getElementById("searchBox").addEventListener("input", function (e) {
        query = e.target.value || "";
        showView("catalog");
        renderGrid();
      });
      document.getElementById("randBtn").addEventListener("click", function () {
        if (GAMES.length) openGame(GAMES[Math.floor(Math.random() * GAMES.length)]);
      });
      document.querySelectorAll("#topNav .nbtn").forEach(function (b) {
        b.addEventListener("click", function () {
          activeCat = b.getAttribute("data-cat") || "Home";
          query = ""; document.getElementById("searchBox").value = "";
          showView("catalog"); renderCategories(); renderGrid();
        });
      });
      document.getElementById("homeLogoBtn").addEventListener("click", function () {
        activeCat = "Home"; query = ""; document.getElementById("searchBox").value = "";
        showView("catalog"); renderCategories(); renderGrid();
      });
      document.getElementById("backBtn").addEventListener("click", function () { showView("catalog"); });
      document.getElementById("reloadBtn").addEventListener("click", function () { if (curGame) mountDirectStage(curGame); });
      document.getElementById("fsBtn").addEventListener("click", function () { stageBox.classList.toggle("pseudo-fs"); });
      var cwb = document.getElementById("cleanWinBtn");
      if (cwb) {
        cwb.addEventListener("click", function () {
          if (!curGame) return;
          var u = curGame.url || ("https://ais-pre-n2xfecuxxm2xybnfyl23hz-903443430664.us-east1.run.app/api/proxy/game/" + encodeURIComponent(curGame.id));
          try {
            var w = window.open("about:blank", "_blank");
            if (w) {
              w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + (curGame.title || "Game") + '</title><style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:none;overflow:hidden;background:#000;}</style></head><body><iframe src="' + u + '" allow="fullscreen; autoplay; accelerometer; gyroscope; gamepad; pointer-lock" referrerpolicy="no-referrer" allowfullscreen></iframe></body></html>');
              w.document.close();
            } else {
              window.open(u, "_blank", "noopener,noreferrer");
            }
          } catch (err) {
            window.open(u, "_blank", "noopener,noreferrer");
          }
        });
      }
      document.getElementById("openSettingsBtn").addEventListener("click", function () { showView("settings"); });
      document.getElementById("closeSettingsBtn").addEventListener("click", function () { showView("catalog"); });

      document.getElementById("panicPresets").addEventListener("click", function (e) {
        var b = e.target.closest("[data-p]");
        if (!b) return;
        panicPreset = b.getAttribute("data-p");
        document.querySelectorAll("#panicPresets .pbtn").forEach(function (x) { x.classList.toggle("active", x === b); });
        syncPanicLinks();
      });
      document.getElementById("savePanicBtn").addEventListener("click", function () {
        var ct = document.getElementById("customPanicTitle").value.trim();
        var cu = document.getElementById("customPanicUrl").value.trim();
        if (cu) { panicPreset = "custom"; customTitle = ct || "Clever | Portal"; customUrl = cu; }
        syncPanicLinks();
      });
      document.getElementById("recordKeyBtn").addEventListener("click", function (e) {
        recordingKey = true;
        e.currentTarget.textContent = "Press any key...";
      });

      document.addEventListener("keydown", function (e) {
        if (recordingKey) {
          e.preventDefault();
          if (["Shift","Control","Alt","Meta"].indexOf(e.key) !== -1) return;
          panicKey = e.key;
          recordingKey = false;
          document.getElementById("recordKeyBtn").textContent = "Keybind: " + panicKey + " (Click to Change)";
          return;
        }
        if (!panicScreen.classList.contains("hidden")) {
          if (/^[0-9]$/.test(e.key)) {
            disBuf = (disBuf + e.key).slice(-4);
            if (disBuf === PIN) { disBuf = ""; panicScreen.classList.add("hidden"); document.title = "Jordans V1.1"; }
          }
          return;
        }
        if (!unlocked) {
          if (/^[0-9]$/.test(e.key)) pushDigit(e.key);
          else if (e.key === "Backspace") { pinBuf = pinBuf.slice(0, -1); syncPin(); }
          return;
        }
        var tag = (e.target && e.target.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        if (e.key === panicKey) { e.preventDefault(); triggerPanic(); }
        else if (e.key === "Escape") {
          if (stageBox.classList.contains("pseudo-fs")) stageBox.classList.remove("pseudo-fs");
          var now = Date.now();
          if (now - lastEsc < 420) triggerPanic();
          lastEsc = now;
        }
      });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  })();
  <\/script>
</body>
</html>`;
}

const DELETED_GAMES_MAP = {
  'subway-surfers': 'Subway Surfers'
};

function filterOutDeletedGames(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((g) => g && !DELETED_GAMES_MAP[g.id]);
}

const IS_GOOGLE_SITES_MODE = Boolean(
  typeof window !== 'undefined' && window.__JORDS_GOOGLE_SITES_MODE__
);

const BUILTIN_COLUMN_ORDER = [
  'Favorites',
  'Obby & Parkour',
  'Action',
  'Racing',
  'Sports',
  'Simulation',
  'Skill',
  'Clicker & Idle',
  'Multiplayer & .io',
  '2 Player',
  'Strategy & TD',
  'Horror & Escape',
  'Puzzle & Merge'
];

const HERO_BENTO_IDS = [
  'deadly-descent',
  'extreme-car-driving-simulator',
  'moto-x3m',
  'basketball-stars',
  'steal-an-egg',
  'obby-1-speed-keyboard-escape',
  'plants-vs-zombies-fusion-edition',
  'sprunki-sandbox-ragdoll-playground-mode-d3fe-1'
];

const PINNED_TRENDING_IDS = [
  'deadly-descent',
  'extreme-car-driving-simulator',
  'moto-x3m',
  'basketball-stars',
  'steal-an-egg'
];

const DEFAULT_HOT_LIST_IDS = [
  ...PINNED_TRENDING_IDS,
  ...(Array.isArray(PLAYGAMA_TRENDING_SLUGS) ? PLAYGAMA_TRENDING_SLUGS : []),
  'barry-prison-parkour-escape',
  'basket-random',
  'vector-parkour-run',
  'dismount-ragdoll',
  'obby-kart-racing',
  'piece-of-cake-merge--bake',
  'arrow-puzzle'
];

const HOT_LIST_COUNT = 28;
const GRID_PAGE_SIZE = 72;

// Tab Cloak SVG Favicons (100% Inline Zero-Network Icons)
function makeCloakIcon(bg, fg, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="43" text-anchor="middle" fill="${fg}" font-family="system-ui,sans-serif" font-weight="800" font-size="30">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const CLOAK_PRESETS = {
  default: {
    title: 'Jordans V1.1',
    icon: makeCloakIcon('#070709', '#c0ff47', 'J')
  },
  classroom: {
    title: 'Classes',
    icon: makeCloakIcon('#15803d', '#ffffff', 'C')
  },
  docs: {
    title: 'Untitled document - Google Docs',
    icon: makeCloakIcon('#1d4ed8', '#ffffff', 'D')
  },
  drive: {
    title: 'My Drive - Google Drive',
    icon: makeCloakIcon('#0f766e', '#ffffff', 'G')
  },
  clever: {
    title: 'Clever | Portal',
    icon: makeCloakIcon('#2563eb', '#ffffff', 'C')
  },
  desmos: {
    title: 'Desmos | Scientific Calculator',
    icon: makeCloakIcon('#166534', '#ffffff', '∑')
  }
};

// Safe storage helpers (prevents SecurityError inside iPad Safari / Google Sites sandboxed iframes)
const memoryStore = new Map();

function safeGetLocal(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function safeSetLocal(key, value) {
  memoryStore.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Fallback held in memoryStore when third-party storage is restricted
  }
}

function safePushHash(hash) {
  try {
    window.history.pushState(null, '', hash);
  } catch {
    // Embedded Google Sites srcdoc frames restrict history.pushState
  }
}

function loadJsonStorage(key, fallback) {
  try {
    const raw = safeGetLocal(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeFavoriteIds(list) {
  const unique = [];
  const seen = new Set();
  for (const raw of list) {
    const id = String(raw || '').trim();
    if (
      id.length >= 1 &&
      id.length <= MAX_FAVORITE_ID_LEN &&
      VALID_ID_REGEX.test(id) &&
      !seen.has(id)
    ) {
      seen.add(id);
      unique.push(id);
      if (unique.length >= MAX_FAVORITE_IDS) break;
    }
  }
  return unique;
}

function sanitizeCustomColumns(list) {
  const unique = [];
  const seen = new Set();
  for (const raw of list) {
    const cleaned = String(raw || '')
      .replace(/[^a-zA-Z0-9 _-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CUSTOM_COLUMN_LEN);
    if (
      cleaned.length >= 1 &&
      VALID_COLUMN_REGEX.test(cleaned) &&
      !seen.has(cleaned)
    ) {
      seen.add(cleaned);
      unique.push(cleaned);
      if (unique.length >= MAX_CUSTOM_COLUMNS) break;
    }
  }
  return unique;
}

let allGames = filterOutDeletedGames(
  typeof window !== 'undefined' &&
    Array.isArray(window.__JORDS_INLINE_GAMES__) &&
    window.__JORDS_INLINE_GAMES__.length > 0
    ? [...window.__JORDS_INLINE_GAMES__]
    : Array.isArray(INLINE_GAMES_CATALOG)
      ? [...INLINE_GAMES_CATALOG]
      : []
);
let assetPrefix = '.';
let favoriteIds = new Set(
  sanitizeFavoriteIds(loadJsonStorage(FAVORITES_KEY, [])).filter((id) => !DELETED_GAMES_MAP[id])
);
let recentIds = sanitizeFavoriteIds(loadJsonStorage(RECENT_IDS_KEY, []))
  .filter((id) => !DELETED_GAMES_MAP[id])
  .slice(0, 12);
let customColumns = sanitizeCustomColumns(loadJsonStorage(CUSTOM_COLUMNS_KEY, []));
let columnOverrides = loadJsonStorage(COLUMN_ASSIGNMENTS_KEY, {});
let hotListIds = (loadJsonStorage(HOT_LIST_KEY, []) || []).filter((id) => !DELETED_GAMES_MAP[id]);

let workspaceDocExists = false;
let isSigningIn = false;

let activeView = 'catalog'; // 'catalog' | 'player' | 'settings' | 'tools'
let activeCategory = 'Home';
let searchQuery = '';
let organizerQuery = '';
let currentGame = null;
let activeGameCleanup = null;
let wideMode = false;
let loaderHideTimer = null;
let visibleGridLimit = GRID_PAGE_SIZE;
let liveSearchTimer = null;

function unmountActiveGame() {
  if (typeof activeGameCleanup === 'function') {
    try {
      activeGameCleanup();
    } catch {
      // Ignore cleanup errors
    }
    activeGameCleanup = null;
  }
  if (iframeMount) {
    iframeMount.innerHTML = '';
  }
}

const ACCESS_CODE = '0425';
let isPasscodeUnlocked = false;
let pinDigits = ['', '', '', ''];
let pinResetTimer = null;

// Auth & Shell DOM Elements
const authGate = document.getElementById('authGate');
const authCard = document.getElementById('authCard');
const passcodeForm = document.getElementById('passcodeForm');
const pinSlotInputs = Array.from(document.querySelectorAll('.pin-slot'));
const authStatusMsg = document.getElementById('authStatusMsg');
const siteHeader = document.getElementById('siteHeader');
const appShell = document.getElementById('appShell');
const siteFooter = document.getElementById('siteFooter');
const signedInEmailLabel = document.getElementById('signedInEmailLabel');
const lockSiteBtn = document.getElementById('lockSiteBtn');
const footerSchoolToolsBtn = document.getElementById('footerSchoolToolsBtn');

// Header Controls (Panic + Settings + Refresh Tab)
const brandLink = document.getElementById('brandLink');
const refreshNavBtn = document.getElementById('refreshNavBtn');
const panicBtn = document.getElementById('panicBtn');
const settingsTopBtn = document.getElementById('settingsTopBtn');

// Catalog & Portal Views DOM Elements
const catalogSection = document.getElementById('catalogSection');
const portalHomeView = document.getElementById('portalHomeView');
const heroBentoGrid = document.getElementById('heroBentoGrid');
const shelvesContainer = document.getElementById('shelvesContainer');
const genreQuickJump = document.getElementById('genreQuickJump');
const filteredGridWrap = document.getElementById('filteredGridWrap');
const playerSection = document.getElementById('playerSection');
const settingsSection = document.getElementById('settingsSection');
const schoolToolsSection = document.getElementById('schoolToolsSection');
const mainContainer = document.querySelector('.main-container');
const gamesGrid = document.getElementById('gamesGrid');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const loadMoreGamesBtn = document.getElementById('loadMoreGamesBtn');
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
const shuffleHotBtn = document.getElementById('shuffleHotBtn');
const openSchoolToolsToolbarBtn = document.getElementById('openSchoolToolsToolbarBtn');

// Left Portal Rail & Columns Organizer Elements
const sideOrganizer = document.getElementById('sideOrganizer');
const railCategoryList = document.getElementById('railCategoryList');
const railSchoolToolsBtn = document.getElementById('railSchoolToolsBtn');
const railTimerReadout = document.getElementById('railTimerReadout');
const mobileOrganizerBar = document.getElementById('mobileOrganizerBar');
const organizerTree = document.getElementById('organizerTree');
const organizerTotalCount = document.getElementById('organizerTotalCount');
const organizerSearchInput = document.getElementById('organizerSearchInput');
const toggleOrganizerMobileBtn = document.getElementById('toggleOrganizerMobileBtn');
const mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
const mobileSchoolToolsBtn = document.getElementById('mobileSchoolToolsBtn');

// Player Elements + Custom Jordans V1 Stage
const iframeStage = document.getElementById('iframeStage');
const iframeMount = document.getElementById('iframeMount');
const jordansLoader = document.getElementById('jordansLoader');
const loaderThumbImg = document.getElementById('loaderThumbImg');
const loaderGameTitle = document.getElementById('loaderGameTitle');
const loaderStatusText = document.getElementById('loaderStatusText');
const pseudoFsControls = document.getElementById('pseudoFsControls');
const fsRefreshBtn = document.getElementById('fsRefreshBtn');
const fsPanicBtn = document.getElementById('fsPanicBtn');
const exitPseudoFsBtn = document.getElementById('exitPseudoFsBtn');
const activeGameTitle = document.getElementById('activeGameTitle');
const activeGameMeta = document.getElementById('activeGameMeta');
const activeGameDesc = document.getElementById('activeGameDesc');
const backToCatalogBtn = document.getElementById('backToCatalogBtn');
const reloadIframeBtn = document.getElementById('reloadIframeBtn');
const popoutWindowBtn = document.getElementById('popoutWindowBtn');
const theaterToggleBtn = document.getElementById('theaterToggleBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const playerFavBtn = document.getElementById('playerFavBtn');
const playerFavLabel = document.getElementById('playerFavLabel');
const assignColumnSelect = document.getElementById('assignColumnSelect');

// School Tools Elements
const closeSchoolToolsBtn = document.getElementById('closeSchoolToolsBtn');
const dynamicFavicon = document.getElementById('dynamicFavicon');
const panicKeyToggle = document.getElementById('panicKeyToggle');
const schoolToolsPanicSub = document.getElementById('schoolToolsPanicSub');
const schoolToolsPanicLabel = document.getElementById('schoolToolsPanicLabel');
const openPanicSettingsFromToolsBtn = document.getElementById('openPanicSettingsFromToolsBtn');
const bellTimerDisplay = document.getElementById('bellTimerDisplay');
const bellTimerStartBtn = document.getElementById('bellTimerStartBtn');
const bellTimerResetBtn = document.getElementById('bellTimerResetBtn');
const calcDisplay = document.getElementById('calcDisplay');
const schoolScratchpadInput = document.getElementById('schoolScratchpadInput');
const clearScratchpadBtn = document.getElementById('clearScratchpadBtn');

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

// Settings Page Elements (Panic Mode, Keybind, Embed Code, Suggestions & Servers)
const settingsBackBtn = document.getElementById('settingsBackBtn');
const copyIframeEmbedBtn = document.getElementById('copyIframeEmbedBtn');
const copySitesSettingsBtn = document.getElementById('copySitesSettingsBtn');
const testPanicSettingsBtn = document.getElementById('testPanicSettingsBtn');
const panicActiveTargetReadout = document.getElementById('panicActiveTargetReadout');
const panicCustomTitleInput = document.getElementById('panicCustomTitleInput');
const panicCustomUrlInput = document.getElementById('panicCustomUrlInput');
const saveCustomPanicBtn = document.getElementById('saveCustomPanicBtn');
const panicKeybindBadge = document.getElementById('panicKeybindBadge');
const recordPanicKeyBtn = document.getElementById('recordPanicKeyBtn');
const resetPanicKeyBtn = document.getElementById('resetPanicKeyBtn');
const panicKeybindHint = document.getElementById('panicKeybindHint');
const settingsPanicKeyToggle = document.getElementById('settingsPanicKeyToggle');
const settingsPanicToggleLabel = document.getElementById('settingsPanicToggleLabel');
const iframeEmbedCodeOutput = document.getElementById('iframeEmbedCodeOutput');
const copyEmbedCardBtn = document.getElementById('copyEmbedCardBtn');
const copyFullPageEmbedCardBtn = document.getElementById('copyFullPageEmbedCardBtn');
const copyStandaloneBundleCardBtn = document.getElementById('copyStandaloneBundleCardBtn');
const downloadStandaloneBundleBtn = document.getElementById('downloadStandaloneBundleBtn');
const panicDisguiseScreen = document.getElementById('panicDisguiseScreen');
const panicDisguiseBadge = document.getElementById('panicDisguiseBadge');
const panicDisguiseAppName = document.getElementById('panicDisguiseAppName');
const panicDisguiseSub = document.getElementById('panicDisguiseSub');
const panicDisguiseOpenLink = document.getElementById('panicDisguiseOpenLink');
const exitPanicDisguiseBtn = document.getElementById('exitPanicDisguiseBtn');
const panicDisguiseBody = document.getElementById('panicDisguiseBody');
const inlineSuggestionsTrigger = document.getElementById('inlineSuggestionsTrigger');
const tabBtnSuggestions = document.getElementById('tabBtnSuggestions');
const tabBtnServers = document.getElementById('tabBtnServers');
const panelSuggestions = document.getElementById('panelSuggestions');
const panelServers = document.getElementById('panelServers');
const suggestionForm = document.getElementById('suggestionForm');
const suggestionSenderInput = document.getElementById('suggestionSenderInput');
const suggestionServerSelect = document.getElementById('suggestionServerSelect');
const suggestionNoteInput = document.getElementById('suggestionNoteInput');
const suggestionCharCount = document.getElementById('suggestionCharCount');
const suggestionStatusMsg = document.getElementById('suggestionStatusMsg');
const submitSuggestionBtn = document.getElementById('submitSuggestionBtn');
const studioInboxCard = document.getElementById('studioInboxCard');
const studioInboxAuthPrompt = document.getElementById('studioInboxAuthPrompt');
const inboxSignInBtn = document.getElementById('inboxSignInBtn');
const studioInboxList = document.getElementById('studioInboxList');
const inboxCountLabel = document.getElementById('inboxCountLabel');

let checklistSelectedIds = new Set();
let unsubscribeSuggestionsInbox = null;
let isSubmittingSuggestion = false;

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

let toastTimer = null;
function showToast(message) {
  if (!toastBanner) return;
  toastBanner.textContent = message;
  setVisible(toastBanner, true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    setVisible(toastBanner, false);
  }, 3000);
}

// ==========================================
// Tab Cloak & School Tools Utilities
// ==========================================

let activeCloakId = safeGetLocal(CLOAK_PRESET_KEY) || 'default';
if (!CLOAK_PRESETS[activeCloakId]) activeCloakId = 'default';

let panicHotkeyEnabled = safeGetLocal(PANIC_HOTKEY_KEY) !== 'false';

function applyTabCloak(cloakId, notify = false) {
  const preset = CLOAK_PRESETS[cloakId] || CLOAK_PRESETS.default;
  activeCloakId = CLOAK_PRESETS[cloakId] ? cloakId : 'default';
  safeSetLocal(CLOAK_PRESET_KEY, activeCloakId);
  document.title = preset.title;
  if (dynamicFavicon) {
    dynamicFavicon.setAttribute('href', preset.icon);
  }
  document.querySelectorAll('[data-cloak-id]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-cloak-id') === activeCloakId);
  });
  if (notify) {
    showToast(`Tab disguised as "${preset.title}"`);
  }
}

document.querySelectorAll('[data-cloak-id]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-cloak-id') || 'default';
    applyTabCloak(id, true);
  });
});

// ==========================================
// Configurable Panic Mode Destination & Custom Keybind
// ==========================================

const PANIC_APP_PRESETS = {
  classroom: {
    label: 'Google Classroom',
    tabTitle: 'Classes',
    url: 'https://classroom.google.com/',
    badge: 'C',
    color: '#15803d',
    kind: 'classroom'
  },
  clever: {
    label: 'Clever',
    tabTitle: 'Clever | Portal',
    url: 'https://clever.com/in/launchpad',
    badge: 'C',
    color: '#2563eb',
    kind: 'clever'
  },
  docs: {
    label: 'Google Docs',
    tabTitle: 'Untitled document - Google Docs',
    url: 'https://docs.google.com/document/u/0/',
    badge: 'D',
    color: '#1d4ed8',
    kind: 'docs'
  },
  drive: {
    label: 'Google Drive',
    tabTitle: 'My Drive - Google Drive',
    url: 'https://drive.google.com/drive/my-drive',
    badge: 'G',
    color: '#0f766e',
    kind: 'portal'
  },
  canvas: {
    label: 'Canvas',
    tabTitle: 'Dashboard',
    url: 'https://canvas.instructure.com/',
    badge: 'C',
    color: '#dc2626',
    kind: 'portal'
  },
  ixl: {
    label: 'IXL',
    tabTitle: 'IXL | Dashboard',
    url: 'https://www.ixl.com/',
    badge: 'I',
    color: '#059669',
    kind: 'portal'
  },
  desmos: {
    label: 'Desmos',
    tabTitle: 'Desmos | Scientific Calculator',
    url: 'https://www.desmos.com/scientific',
    badge: '∑',
    color: '#166534',
    kind: 'portal'
  }
};

const DEFAULT_PANIC_KEYBIND = {
  key: '`',
  code: 'Backquote',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  label: '`'
};

function normalizePanicUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'https://clever.com/in/launchpad';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

let activePanicPreset = safeGetLocal(PANIC_PRESET_KEY) || 'classroom';
if (activePanicPreset !== 'custom' && !PANIC_APP_PRESETS[activePanicPreset]) {
  activePanicPreset = 'classroom';
}
let panicCustomUrl = normalizePanicUrl(
  safeGetLocal(PANIC_CUSTOM_URL_KEY) || 'https://clever.com/in/launchpad'
);
let panicCustomTitle = String(safeGetLocal(PANIC_CUSTOM_TITLE_KEY) || 'Clever | Portal').trim() || 'Clever | Portal';

let panicKeybind = (() => {
  const saved = loadJsonStorage(PANIC_KEYBIND_KEY, null);
  if (saved && typeof saved === 'object' && (saved.key || saved.code) && saved.label) {
    return {
      key: String(saved.key || ''),
      code: String(saved.code || ''),
      ctrlKey: Boolean(saved.ctrlKey),
      altKey: Boolean(saved.altKey),
      shiftKey: Boolean(saved.shiftKey),
      metaKey: Boolean(saved.metaKey),
      label: String(saved.label)
    };
  }
  return { ...DEFAULT_PANIC_KEYBIND };
})();

let isRecordingPanicKey = false;
let isPanicDisguiseActive = false;
let disguiseUnlockBuffer = '';

function getActivePanicTarget() {
  if (activePanicPreset === 'custom') {
    const cleanUrl = normalizePanicUrl(panicCustomUrl);
    let host = 'school.portal';
    try {
      host = new URL(cleanUrl).hostname;
    } catch {
      host = cleanUrl;
    }
    const lowerUrl = cleanUrl.toLowerCase();
    const kind = lowerUrl.includes('docs.google')
      ? 'docs'
      : lowerUrl.includes('clever.com')
        ? 'clever'
        : lowerUrl.includes('classroom.google')
          ? 'classroom'
          : 'portal';
    const label = panicCustomTitle || host;
    return {
      label,
      tabTitle: label,
      url: cleanUrl,
      badge: label.slice(0, 1).toUpperCase() || 'A',
      color: '#2563eb',
      kind,
      host
    };
  }
  const preset = PANIC_APP_PRESETS[activePanicPreset] || PANIC_APP_PRESETS.classroom;
  let host = 'classroom.google.com';
  try {
    host = new URL(preset.url).hostname;
  } catch {
    host = preset.url;
  }
  return { ...preset, host };
}

function formatKeybindFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Cmd');

  let keyName = e.key || '';
  if (keyName === ' ') keyName = 'Space';
  else if (keyName.length === 1) keyName = keyName.toUpperCase();
  if (e.code === 'Backquote' && !e.shiftKey) keyName = '`';

  parts.push(keyName || e.code || '`');
  return parts.join(' + ');
}

function matchesPanicKeybind(e) {
  if (!panicKeybind) return false;
  if (Boolean(e.ctrlKey) !== Boolean(panicKeybind.ctrlKey)) return false;
  if (Boolean(e.altKey) !== Boolean(panicKeybind.altKey)) return false;
  if (Boolean(e.metaKey) !== Boolean(panicKeybind.metaKey)) return false;
  if (Boolean(e.shiftKey) !== Boolean(panicKeybind.shiftKey)) return false;

  if (panicKeybind.code && e.code && e.code === panicKeybind.code) {
    return true;
  }
  if (panicKeybind.key && e.key && e.key.toLowerCase() === panicKeybind.key.toLowerCase()) {
    return true;
  }
  return false;
}

function syncPanicConfigUI() {
  const target = getActivePanicTarget();
  const keyLabel = panicKeybind?.label || '`';

  [panicBtn, fsPanicBtn, testPanicSettingsBtn, panicDisguiseOpenLink].forEach((anchor) => {
    if (!anchor) return;
    anchor.setAttribute('href', target.url);
    if (anchor !== panicDisguiseOpenLink) {
      anchor.setAttribute('aria-label', `Panic — Open ${target.label}`);
      anchor.setAttribute('title', `Panic → ${target.label} (${keyLabel})`);
    }
  });

  if (panicActiveTargetReadout) {
    panicActiveTargetReadout.textContent = `Active: ${target.label}`;
  }

  document.querySelectorAll('[data-panic-preset]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-panic-preset') === activePanicPreset);
  });

  if (panicCustomTitleInput && document.activeElement !== panicCustomTitleInput) {
    panicCustomTitleInput.value = activePanicPreset === 'custom' ? panicCustomTitle : target.label;
  }
  if (panicCustomUrlInput && document.activeElement !== panicCustomUrlInput) {
    panicCustomUrlInput.value = activePanicPreset === 'custom' ? panicCustomUrl : target.url;
  }

  if (panicKeybindBadge) {
    panicKeybindBadge.textContent = isRecordingPanicKey ? 'Press any key...' : keyLabel;
  }
  if (recordPanicKeyBtn) {
    recordPanicKeyBtn.classList.toggle('recording', isRecordingPanicKey);
    recordPanicKeyBtn.textContent = isRecordingPanicKey ? 'Listening... Press Key' : 'Set Custom Keybind';
  }

  if (panicKeyToggle) panicKeyToggle.checked = panicHotkeyEnabled;
  if (settingsPanicKeyToggle) settingsPanicKeyToggle.checked = panicHotkeyEnabled;

  if (settingsPanicToggleLabel) {
    settingsPanicToggleLabel.textContent = `Enable Panic Keybind (Press ${keyLabel} or double-tap Esc → ${target.label})`;
  }
  if (schoolToolsPanicLabel) {
    schoolToolsPanicLabel.textContent = `Enable Quick Panic Key (Press ${keyLabel} or double-tap Esc for ${target.label})`;
  }
  if (schoolToolsPanicSub) {
    schoolToolsPanicSub.textContent = `Disguise browser tab title & icon as a school app, or press ${keyLabel} anytime to switch to ${target.label}.`;
  }
}

function setPanicHotkeyEnabled(enabled, notify = true) {
  panicHotkeyEnabled = Boolean(enabled);
  safeSetLocal(PANIC_HOTKEY_KEY, String(panicHotkeyEnabled));
  syncPanicConfigUI();
  if (notify) {
    showToast(
      panicHotkeyEnabled
        ? `Panic keybind (${panicKeybind.label}) enabled`
        : 'Panic keybind paused'
    );
  }
}

panicKeyToggle?.addEventListener('change', () => {
  setPanicHotkeyEnabled(Boolean(panicKeyToggle.checked), true);
});
settingsPanicKeyToggle?.addEventListener('change', () => {
  setPanicHotkeyEnabled(Boolean(settingsPanicKeyToggle.checked), true);
});

document.querySelectorAll('[data-panic-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const presetKey = btn.getAttribute('data-panic-preset') || 'classroom';
    activePanicPreset = presetKey === 'custom' || PANIC_APP_PRESETS[presetKey] ? presetKey : 'classroom';
    safeSetLocal(PANIC_PRESET_KEY, activePanicPreset);
    syncPanicConfigUI();
    if (activePanicPreset === 'custom') {
      panicCustomUrlInput?.focus();
      showToast('Enter any school app URL below and click Save App');
    } else {
      const target = getActivePanicTarget();
      showToast(`Panic button set to ${target.label}`);
    }
  });
});

function saveCustomPanicTarget() {
  const rawUrl = (panicCustomUrlInput?.value || '').trim();
  const rawTitle = (panicCustomTitleInput?.value || '').trim();
  panicCustomUrl = normalizePanicUrl(rawUrl || 'https://clever.com/in/launchpad');
  let fallbackName = 'School Portal';
  try {
    fallbackName = new URL(panicCustomUrl).hostname;
  } catch {
    fallbackName = 'School Portal';
  }
  panicCustomTitle = (rawTitle || fallbackName).slice(0, 60);
  activePanicPreset = 'custom';
  safeSetLocal(PANIC_CUSTOM_URL_KEY, panicCustomUrl);
  safeSetLocal(PANIC_CUSTOM_TITLE_KEY, panicCustomTitle);
  safeSetLocal(PANIC_PRESET_KEY, 'custom');
  syncPanicConfigUI();
  showToast(`Saved custom Panic app: ${panicCustomTitle}`);
}

saveCustomPanicBtn?.addEventListener('click', saveCustomPanicTarget);
panicCustomUrlInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveCustomPanicTarget();
  }
});

recordPanicKeyBtn?.addEventListener('click', () => {
  isRecordingPanicKey = !isRecordingPanicKey;
  syncPanicConfigUI();
  if (isRecordingPanicKey && panicKeybindHint) {
    panicKeybindHint.textContent = 'Press any key or key combo right now to save your custom Panic keybind...';
  }
});

resetPanicKeyBtn?.addEventListener('click', () => {
  isRecordingPanicKey = false;
  panicKeybind = { ...DEFAULT_PANIC_KEYBIND };
  safeSetLocal(PANIC_KEYBIND_KEY, JSON.stringify(panicKeybind));
  syncPanicConfigUI();
  showToast('Reset Panic keybind to ` (Backquote)');
});

openPanicSettingsFromToolsBtn?.addEventListener('click', () => {
  openSettingsPage(true);
});

function renderPanicDisguiseWorkspace(target) {
  if (!panicDisguiseScreen) return;
  if (panicDisguiseBadge) {
    panicDisguiseBadge.textContent = target.badge || 'C';
    panicDisguiseBadge.style.background = target.color || '#2563eb';
  }
  if (panicDisguiseAppName) panicDisguiseAppName.textContent = target.tabTitle || target.label;
  if (panicDisguiseSub) panicDisguiseSub.textContent = target.host || target.url;
  if (panicDisguiseOpenLink) {
    panicDisguiseOpenLink.setAttribute('href', target.url);
    panicDisguiseOpenLink.style.background = target.color || '#2563eb';
    panicDisguiseOpenLink.textContent = `Open ${target.label} ↗`;
  }

  if (panicDisguiseBody) {
    if (target.kind === 'docs') {
      panicDisguiseBody.innerHTML = `
        <div class="disguise-doc-sheet" contenteditable="true" spellcheck="true">
          <h2 style="margin-top:0;font-size:1.35rem;color:#0f172a;">Reading &amp; Study Notes</h2>
          <p><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</p>
          <p>1. Review chapter vocabulary and key concepts from today&rsquo;s lesson.</p>
          <p>2. Summarize main thesis and supporting evidence in 3&ndash;4 sentences below:</p>
          <p><br /></p>
        </div>
      `;
    } else if (target.kind === 'clever') {
      panicDisguiseBody.innerHTML = `
        <h2 style="margin:0;font-size:1.25rem;color:#0f172a;">Instant Login Applications</h2>
        <div class="disguise-portal-grid">
          <a class="disguise-portal-tile" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer">
            <span class="disguise-tile-dot" style="background:#2563eb;">C</span>
            <span class="disguise-tile-name">Clever Launchpad</span>
            <span class="disguise-tile-desc">District Single Sign-On</span>
          </a>
          <a class="disguise-portal-tile" href="https://classroom.google.com/" target="_blank" rel="noopener noreferrer">
            <span class="disguise-tile-dot" style="background:#15803d;">G</span>
            <span class="disguise-tile-name">Google Classroom</span>
            <span class="disguise-tile-desc">Assignments &amp; Stream</span>
          </a>
          <a class="disguise-portal-tile" href="https://docs.google.com/document/u/0/" target="_blank" rel="noopener noreferrer">
            <span class="disguise-tile-dot" style="background:#1d4ed8;">D</span>
            <span class="disguise-tile-name">Google Docs</span>
            <span class="disguise-tile-desc">Essays &amp; Class Notes</span>
          </a>
          <a class="disguise-portal-tile" href="https://www.desmos.com/scientific" target="_blank" rel="noopener noreferrer">
            <span class="disguise-tile-dot" style="background:#166534;">∑</span>
            <span class="disguise-tile-name">Desmos Calculator</span>
            <span class="disguise-tile-desc">Math &amp; Graphing</span>
          </a>
        </div>
      `;
    } else {
      panicDisguiseBody.innerHTML = `
        <h2 style="margin:0;font-size:1.25rem;color:#0f172a;">${escapeHtml(target.label)} — Active Courses</h2>
        <div class="disguise-portal-grid">
          <a class="disguise-portal-tile" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer">
            <span class="disguise-tile-dot" style="background:${escapeHtml(target.color || '#15803d')};">${escapeHtml(target.badge || 'C')}</span>
            <span class="disguise-tile-name">Period 1 &middot; English Language Arts</span>
            <span class="disguise-tile-desc">Weekly Reading Response</span>
          </a>
          <a class="disguise-portal-tile" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer">
            <span class="disguise-tile-dot" style="background:#1d4ed8;">M</span>
            <span class="disguise-tile-name">Period 3 &middot; Mathematics</span>
            <span class="disguise-tile-desc">Practice Set &amp; Notes</span>
          </a>
          <a class="disguise-portal-tile" href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer">
            <span class="disguise-tile-dot" style="background:#0f766e;">S</span>
            <span class="disguise-tile-name">Period 5 &middot; Science Lab</span>
            <span class="disguise-tile-desc">Unit Study Guide</span>
          </a>
        </div>
      `;
    }
  }

  isPanicDisguiseActive = true;
  disguiseUnlockBuffer = '';
  setVisible(authGate, false);
  setVisible(siteHeader, false);
  setVisible(appShell, false);
  setVisible(siteFooter, false);
  setVisible(panicDisguiseScreen, true);
}

function exitPanicDisguise() {
  isPanicDisguiseActive = false;
  disguiseUnlockBuffer = '';
  setVisible(panicDisguiseScreen, false);
  isPasscodeUnlocked = true;
  unlockSite();
}

exitPanicDisguiseBtn?.addEventListener('click', exitPanicDisguise);

syncPanicConfigUI();

// Class Bell Countdown Timer
let bellSecondsTotal = 25 * 60;
let bellSecondsLeft = 25 * 60;
let bellTimerInterval = null;

function formatTimerClock(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function syncBellTimerUI() {
  const txt = formatTimerClock(bellSecondsLeft);
  if (bellTimerDisplay) bellTimerDisplay.textContent = txt;
  if (railTimerReadout) {
    railTimerReadout.textContent = bellTimerInterval ? txt : 'Cloak · Calc';
  }
  if (bellTimerStartBtn) {
    bellTimerStartBtn.textContent = bellTimerInterval ? 'Pause Timer' : 'Start Timer';
  }
}

function playBellChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Ignore audio context blocks
  }
}

document.querySelectorAll('.timer-preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mins = Number(btn.getAttribute('data-mins') || 25);
    clearInterval(bellTimerInterval);
    bellTimerInterval = null;
    bellSecondsTotal = mins * 60;
    bellSecondsLeft = bellSecondsTotal;
    syncBellTimerUI();
  });
});

bellTimerStartBtn?.addEventListener('click', () => {
  if (bellTimerInterval) {
    clearInterval(bellTimerInterval);
    bellTimerInterval = null;
    syncBellTimerUI();
    return;
  }
  if (bellSecondsLeft <= 0) bellSecondsLeft = bellSecondsTotal;
  bellTimerInterval = setInterval(() => {
    bellSecondsLeft -= 1;
    if (bellSecondsLeft <= 0) {
      bellSecondsLeft = 0;
      clearInterval(bellTimerInterval);
      bellTimerInterval = null;
      playBellChime();
      showToast('Class bell countdown finished!');
    }
    syncBellTimerUI();
  }, 1000);
  syncBellTimerUI();
});

bellTimerResetBtn?.addEventListener('click', () => {
  clearInterval(bellTimerInterval);
  bellTimerInterval = null;
  bellSecondsLeft = bellSecondsTotal;
  syncBellTimerUI();
});

// Safe Built-in Quick Math & Percent Calculator (No eval)
let calcExpr = '0';

function evaluateSafeMath(expr) {
  const cleaned = String(expr || '').replace(/\s+/g, '');
  if (!/^[0-9+\-*/.%]+$/.test(cleaned)) return 'Error';
  const tokens = cleaned.match(/(\d+\.?\d*|\.\d+|[+\-*/%])/g);
  if (!tokens || !tokens.length) return '0';

  const nums = [];
  const ops = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

  function applyOp() {
    const op = ops.pop();
    const b = nums.pop();
    const a = nums.pop();
    if (a === undefined || b === undefined) return;
    if (op === '+') nums.push(a + b);
    else if (op === '-') nums.push(a - b);
    else if (op === '*') nums.push(a * b);
    else if (op === '/') nums.push(b === 0 ? NaN : a / b);
    else if (op === '%') nums.push((a * b) / 100);
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i];
    if (tk === '-' && (i === 0 || /[+\-*/%]/.test(tokens[i - 1]))) {
      const next = tokens[i + 1];
      if (next && !/[+\-*/%]/.test(next)) {
        nums.push(- parseFloat(next));
        i += 1;
        continue;
      }
    }
    if (!/[+\-*/%]/.test(tk)) {
      nums.push(parseFloat(tk));
    } else {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[tk]) {
        applyOp();
      }
      ops.push(tk);
    }
  }
  while (ops.length) applyOp();
  const res = nums[0];
  if (typeof res !== 'number' || !Number.isFinite(res)) return 'Error';
  return String(Math.round(res * 1e8) / 1e8);
}

document.querySelectorAll('[data-calc]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-calc') || '';
    if (key === 'C') {
      calcExpr = '0';
    } else if (key === 'BACK') {
      calcExpr = calcExpr.length > 1 ? calcExpr.slice(0, -1) : '0';
    } else if (key === '=') {
      calcExpr = evaluateSafeMath(calcExpr);
    } else {
      if (calcExpr === '0' && /[0-9]/.test(key)) calcExpr = key;
      else if (calcExpr === 'Error') calcExpr = /[0-9]/.test(key) ? key : '0';
      else calcExpr += key;
    }
    if (calcDisplay) calcDisplay.textContent = calcExpr;
  });
});

// Quick Study Scratchpad
if (schoolScratchpadInput) {
  schoolScratchpadInput.value = safeGetLocal(SCRATCHPAD_KEY) || '';
  schoolScratchpadInput.addEventListener('input', () => {
    safeSetLocal(SCRATCHPAD_KEY, schoolScratchpadInput.value || '');
  });
}

clearScratchpadBtn?.addEventListener('click', () => {
  if (schoolScratchpadInput) schoolScratchpadInput.value = '';
  safeSetLocal(SCRATCHPAD_KEY, '');
  showToast('Scratchpad cleared');
});

// ==========================================
// Firestore Per-User Workspace Sync
// ==========================================

async function loadCloudWorkspace(user) {
  if (!firebaseReady || !db || !user?.uid || !VALID_ID_REGEX.test(user.uid) || IS_GOOGLE_SITES_MODE) return;
  const path = `userWorkspaces/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'userWorkspaces', user.uid));
    if (snap.exists()) {
      workspaceDocExists = true;
      const data = snap.data() || {};
      if (Array.isArray(data.favoriteIds)) {
        favoriteIds = new Set(sanitizeFavoriteIds(data.favoriteIds));
        safeSetLocal(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
      }
      if (Array.isArray(data.customColumns)) {
        customColumns = sanitizeCustomColumns(data.customColumns);
        safeSetLocal(CUSTOM_COLUMNS_KEY, JSON.stringify(customColumns));
      }
      renderAll();
    } else {
      workspaceDocExists = false;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Quota exceeded')) {
      showToast('Daily cloud sync quota reached; using local workspace until tomorrow.');
      return;
    }
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
}

async function persistCloudWorkspace() {
  if (!firebaseReady || !db) return;
  const user = auth?.currentUser;
  if (!user?.uid || !user.emailVerified || !VALID_ID_REGEX.test(user.uid) || IS_GOOGLE_SITES_MODE) {
    return;
  }

  const cleanFavs = sanitizeFavoriteIds([...favoriteIds]);
  const cleanCols = sanitizeCustomColumns(customColumns);
  const path = `userWorkspaces/${user.uid}`;
  const docRef = doc(db, 'userWorkspaces', user.uid);

  try {
    if (!workspaceDocExists) {
      await setDoc(docRef, {
        ownerId: user.uid,
        favoriteIds: cleanFavs,
        customColumns: cleanCols,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      workspaceDocExists = true;
    } else {
      await updateDoc(docRef, {
        favoriteIds: cleanFavs,
        customColumns: cleanCols,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Quota exceeded')) {
      showToast('Cloud sync quota reached for today; changes saved locally.');
      return;
    }
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      handleFirestoreError(
        error,
        workspaceDocExists ? OperationType.UPDATE : OperationType.CREATE,
        path
      );
    }
  }
}

// ==========================================
// 4-Digit Access Code Gate (0425) & Cloud Sync
// ==========================================

function syncPinSlotsUI() {
  const firstEmptyIdx = pinDigits.findIndex((d) => !d);
  const highlightIdx = firstEmptyIdx === -1 ? 3 : firstEmptyIdx;

  pinSlotInputs.forEach((slot, idx) => {
    const val = pinDigits[idx] || '';
    slot.value = val;
    slot.classList.toggle('filled', Boolean(val));
    slot.classList.toggle('active-slot', idx === highlightIdx && !isPasscodeUnlocked);
  });
}

function clearPinError() {
  setVisible(authStatusMsg, false);
  authCard?.classList.remove('pin-error');
}

function showPinError(message) {
  if (authStatusMsg) {
    authStatusMsg.textContent = message;
    setVisible(authStatusMsg, true);
  }
  if (authCard) {
    authCard.classList.remove('pin-error');
    void authCard.offsetWidth;
    authCard.classList.add('pin-error');
  }
}

function verifyPasscode() {
  const entered = pinDigits.join('');
  if (entered.length < 4) {
    showPinError('Please enter all 4 digits.');
    return;
  }

  if (entered === ACCESS_CODE) {
    clearTimeout(pinResetTimer);
    isPasscodeUnlocked = true;
    pinDigits = ['', '', '', ''];
    clearPinError();
    syncPinSlotsUI();
    unlockSite(auth.currentUser);
    return;
  }

  showPinError('Incorrect code. Please try again.');
  clearTimeout(pinResetTimer);
  pinResetTimer = setTimeout(() => {
    pinDigits = ['', '', '', ''];
    authCard?.classList.remove('pin-error');
    syncPinSlotsUI();
  }, 420);
}

function appendPinDigit(rawDigit) {
  if (isPasscodeUnlocked) return;
  const digit = String(rawDigit || '').replace(/\D/g, '').slice(0, 1);
  if (!digit) return;

  clearTimeout(pinResetTimer);
  clearPinError();

  const emptyIdx = pinDigits.findIndex((d) => !d);
  if (emptyIdx === -1) return;

  pinDigits[emptyIdx] = digit;
  syncPinSlotsUI();

  if (emptyIdx === 3) {
    setTimeout(() => {
      verifyPasscode();
    }, 80);
  }
}

function backspacePinDigit() {
  if (isPasscodeUnlocked) return;
  clearTimeout(pinResetTimer);
  clearPinError();

  for (let i = 3; i >= 0; i -= 1) {
    if (pinDigits[i]) {
      pinDigits[i] = '';
      break;
    }
  }
  syncPinSlotsUI();
}

function clearPinDigits() {
  if (isPasscodeUnlocked) return;
  clearTimeout(pinResetTimer);
  clearPinError();
  pinDigits = ['', '', '', ''];
  syncPinSlotsUI();
}

function syncFooterAuthUI() {
  if (signedInEmailLabel) {
    const count = (allGames.length || 6169).toLocaleString();
    signedInEmailLabel.textContent = `${count} Playgama Games · Official Real Web Games`;
  }
}

function unlockSite() {
  isPanicDisguiseActive = false;
  setVisible(panicDisguiseScreen, false);
  setVisible(authGate, false);
  setVisible(siteHeader, true);
  setVisible(appShell, true);
  setVisible(siteFooter, true);
  applyTabCloak(activeCloakId, false);
  syncPanicConfigUI();
  syncFooterAuthUI();
  if (allGames.length > 0) {
    handleHashRoute();
  }
}

function lockSite() {
  isPasscodeUnlocked = false;
  isPanicDisguiseActive = false;
  pinDigits = ['', '', '', ''];
  clearTimeout(loaderHideTimer);
  setVisible(jordansLoader, false);
  setVisible(panicDisguiseScreen, false);
  unmountActiveGame();
  currentGame = null;
  resetWideMode();
  clearPinError();
  syncPinSlotsUI();
  setVisible(siteHeader, false);
  setVisible(appShell, false);
  setVisible(siteFooter, false);
  setVisible(authGate, true);
}

async function handleOwnerInboxSignInClick() {
  if (isSigningIn || IS_GOOGLE_SITES_MODE) return;
  isSigningIn = true;
  if (inboxSignInBtn) inboxSignInBtn.textContent = 'Signing in...';

  try {
    await initFirebaseOptional();
    if (!firebaseReady || !googleProvider) {
      showToast('Google sign-in is unavailable on this school network.');
      return;
    }
    const result = await signInWithPopup(auth, googleProvider);
    if (result?.user) {
      syncSuggestionsInboxAuth(result.user);
      showToast(`Signed in as ${result.user.email || 'owner'}`);
      await loadCloudWorkspace(result.user);
    }
  } catch (error) {
    const code = error?.code || '';
    if (code === 'auth/popup-blocked') {
      showToast('Sign-in popup was blocked by your browser.');
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      showToast('Could not connect inbox right now.');
    }
  } finally {
    isSigningIn = false;
    if (inboxSignInBtn) inboxSignInBtn.textContent = 'Sign in with Google';
  }
}

async function copyTextWithFallback(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback for restricted iframes
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

async function fetchFullSitesEmbedBundle() {
  if (!IS_GOOGLE_SITES_MODE) {
    const bust = Date.now();
    for (const candidate of [
      `./google-sites-embed.html?v=${bust}`,
      `./public/google-sites-embed.html?v=${bust}`
    ]) {
      try {
        const res = await fetch(candidate, { cache: 'no-store' });
        if (res.ok) {
          const text = await res.text();
          if (text.includes('__JORDS_GOOGLE_SITES_MODE__')) {
            return text;
          }
        }
      } catch {
        // Try next candidate
      }
    }
  }
  return buildSelfContainedSitesEmbedHtml(allGames);
}

async function copyGoogleSitesEmbedCode(forceDownload = false) {
  try {
    const embedHtml = await fetchFullSitesEmbedBundle();

    if (iframeEmbedCodeOutput) {
      iframeEmbedCodeOutput.value = embedHtml;
    }

    if (!forceDownload) {
      const copied = await copyTextWithFallback(embedHtml);
      if (copied) {
        showToast('Copied Self-Contained Google Sites Full Embed Code! Paste into Google Sites → Embed code');
        return;
      }
    }

    const blob = new Blob([embedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jordans-v1-1-google-sites-embed.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Downloaded jordans-v1-1-google-sites-embed.html');
  } catch {
    await copyIframeWebsiteEmbed(false);
  }
}

function initAuthGate() {
  applyTabCloak(activeCloakId, false);
  syncBellTimerUI();

  if (IS_GOOGLE_SITES_MODE) {
    document.body.classList.add('google-sites-mode');
    setVisible(copySitesSettingsBtn, false);
    setVisible(studioInboxCard, false);
    if (suggestionServerSelect) suggestionServerSelect.value = 'Version 1';
  } else {
    setVisible(studioInboxCard, true);
    if (suggestionServerSelect) suggestionServerSelect.value = 'AI Studio';
  }

  // Always start locked behind the 4-digit code (0425) inside the single website
  lockSite();

  // Initialize Firebase asynchronously in the background without ever blocking the portal UI
  void initFirebaseOptional();
}

passcodeForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  verifyPasscode();
});

document.querySelectorAll('[data-pin-key]').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
  });
  btn.addEventListener('click', () => {
    appendPinDigit(btn.getAttribute('data-pin-key'));
  });
});

document.querySelectorAll('[data-pin-action]').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
  });
  btn.addEventListener('click', () => {
    const action = btn.getAttribute('data-pin-action');
    if (action === 'back') backspacePinDigit();
    if (action === 'clear') clearPinDigits();
  });
});

pinSlotInputs.forEach((slot, idx) => {
  slot.addEventListener('keydown', (e) => {
    if (isPasscodeUnlocked) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      appendPinDigit(e.key);
      const nextIdx = Math.min(3, idx + 1);
      pinSlotInputs[nextIdx]?.focus();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspacePinDigit();
      const prevIdx = Math.max(0, pinDigits.findIndex((d) => !d));
      pinSlotInputs[prevIdx === -1 ? 3 : prevIdx]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearPinDigits();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      verifyPasscode();
    } else if (e.key !== 'Tab') {
      e.preventDefault();
    }
  });

  slot.addEventListener('input', () => {
    if (isPasscodeUnlocked) return;
    const raw = slot.value.replace(/\D/g, '');
    syncPinSlotsUI();
    if (raw && !pinDigits[idx]) {
      appendPinDigit(raw[0]);
    }
  });
});

let lastEscPressTs = 0;

function handleGlobalKeydown(e) {
  // 1. Custom Panic Keybind Recorder (Settings)
  if (isRecordingPanicKey) {
    e.preventDefault();
    e.stopPropagation();
    const loneModifier = ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key);
    if (loneModifier) return;

    const label = formatKeybindFromEvent(e);
    panicKeybind = {
      key: e.key || '',
      code: e.code || '',
      ctrlKey: Boolean(e.ctrlKey),
      altKey: Boolean(e.altKey),
      shiftKey: Boolean(e.shiftKey),
      metaKey: Boolean(e.metaKey),
      label
    };
    isRecordingPanicKey = false;
    safeSetLocal(PANIC_KEYBIND_KEY, JSON.stringify(panicKeybind));
    syncPanicConfigUI();
    if (panicKeybindHint) {
      panicKeybindHint.textContent = `Custom Panic keybind saved: ${label}. Press ${label} anytime to trigger Panic Mode.`;
    }
    showToast(`Custom Panic keybind set to "${label}"`);
    return;
  }

  // 2. While Panic Disguise Workspace is active, typing 0425 restores Jordans V1.1 silently
  if (isPanicDisguiseActive) {
    const activeTag = (e.target?.tagName || '').toLowerCase();
    const inEditableDoc = Boolean(e.target?.isContentEditable || activeTag === 'input' || activeTag === 'textarea');
    if (!inEditableDoc && /^[0-9]$/.test(e.key)) {
      disguiseUnlockBuffer = (disguiseUnlockBuffer + e.key).slice(-4);
      if (disguiseUnlockBuffer === ACCESS_CODE) {
        e.preventDefault();
        exitPanicDisguise();
      }
    }
    return;
  }

  // 3. Passcode Gate (0425)
  if (!isPasscodeUnlocked) {
    if (e.target && e.target.closest && e.target.closest('.pin-slot')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      appendPinDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspacePinDigit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearPinDigits();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      verifyPasscode();
    }
    return;
  }

  // 4. Unlocked shortcuts: Exit pseudo-fullscreen on Escape, Panic on Custom Keybind or double-Escape
  const tag = (e.target?.tagName || '').toLowerCase();
  const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(e.target?.isContentEditable);

  if (e.key === 'Escape' && iframeStage?.classList.contains('pseudo-fullscreen')) {
    setPseudoFullscreen(false);
  }

  if (panicHotkeyEnabled && !isTyping) {
    if (matchesPanicKeybind(e)) {
      e.preventDefault();
      triggerPanicMode(null);
      return;
    }
    if (e.key === 'Escape') {
      const now = Date.now();
      if (now - lastEscPressTs < 420) {
        triggerPanicMode(null);
        return;
      }
      lastEscPressTs = now;
    }
  }
}

document.addEventListener('keydown', handleGlobalKeydown);

document.addEventListener('paste', (e) => {
  if (isPasscodeUnlocked) return;
  const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 4);
  if (!pasted) return;
  e.preventDefault();
  clearPinDigits();
  pasted.split('').forEach((ch) => appendPinDigit(ch));
});

async function copyIframeWebsiteEmbed(fullPage = true) {
  if (fullPage) {
    await copyGoogleSitesEmbedCode(false);
    return;
  }
  const snippet = IFRAME_EMBED_SNIPPET;
  if (iframeEmbedCodeOutput) {
    iframeEmbedCodeOutput.value = snippet;
  }
  const ok = await copyTextWithFallback(snippet);
  showToast(
    ok
      ? 'Copied direct host <iframe> tag!'
      : 'Code loaded into the Settings box — press Ctrl+A then Ctrl+C'
  );
}

copyIframeEmbedBtn?.addEventListener('click', () => copyIframeWebsiteEmbed(true));
copyEmbedCardBtn?.addEventListener('click', () => copyIframeWebsiteEmbed(false));
copyFullPageEmbedCardBtn?.addEventListener('click', () => copyIframeWebsiteEmbed(true));
copyStandaloneBundleCardBtn?.addEventListener('click', () => copyGoogleSitesEmbedCode(false));
downloadStandaloneBundleBtn?.addEventListener('click', () => copyGoogleSitesEmbedCode(true));
copySitesSettingsBtn?.addEventListener('click', () => copyGoogleSitesEmbedCode(false));
lockSiteBtn?.addEventListener('click', () => {
  lockSite();
});

// ==========================================
// Trending, Categories, Shelves & Columns Logic
// ==========================================

function pickRandomHotListIds() {
  if (!allGames.length) return [];
  const pool = [...allGames];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(HOT_LIST_COUNT, pool.length)).map((g) => g.id);
}

function ensureHotListInitialized() {
  if (!allGames.length) return;
  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  const pinned = PINNED_TRENDING_IDS.filter((id) => gameMap.has(id));
  const validSaved = Array.isArray(hotListIds) ? hotListIds.filter((id) => gameMap.has(id)) : [];
  if (validSaved.length >= Math.min(12, allGames.length)) {
    const merged = [...pinned, ...validSaved.filter((id) => !pinned.includes(id))].slice(
      0,
      HOT_LIST_COUNT
    );
    hotListIds = merged;
    return;
  }

  const seeded = DEFAULT_HOT_LIST_IDS.filter((id) => gameMap.has(id));
  if (seeded.length < Math.min(HOT_LIST_COUNT, allGames.length)) {
    const used = new Set(seeded);
    const extras = pickRandomHotListIds().filter((id) => !used.has(id));
    seeded.push(...extras.slice(0, HOT_LIST_COUNT - seeded.length));
  }
  hotListIds = seeded.slice(0, HOT_LIST_COUNT);
  safeSetLocal(HOT_LIST_KEY, JSON.stringify(hotListIds));
}

function shuffleHotList() {
  if (!allGames.length) return;
  hotListIds = pickRandomHotListIds();
  safeSetLocal(HOT_LIST_KEY, JSON.stringify(hotListIds));
  activeCategory = 'Trending';
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  if (activeView !== 'catalog') {
    showCatalogView(true);
  } else {
    renderAll();
    syncTopNavState();
  }
  showToast('Trending shelf shuffled with fresh games');
}

function getHotListGames() {
  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  return hotListIds.map((id) => gameMap.get(id)).filter(Boolean);
}

function getRecentGames() {
  const gameMap = new Map(allGames.map((g) => [g.id, g]));
  return recentIds.map((id) => gameMap.get(id)).filter(Boolean);
}

function recordRecentGame(gameId) {
  if (!gameId) return;
  recentIds = sanitizeFavoriteIds([gameId, ...recentIds.filter((id) => id !== gameId)]).slice(0, 12);
  safeSetLocal(RECENT_IDS_KEY, JSON.stringify(recentIds));
}

function getGameColumn(game) {
  if (columnOverrides[game.id]) {
    return columnOverrides[game.id];
  }
  return game.category || 'Puzzle & Merge';
}

function getColumnGameCount(colName, sourceGames = allGames) {
  if (colName === 'Home') return sourceGames.length;
  if (colName === 'Trending') return getHotListGames().length;
  if (colName === 'Recently Played') return getRecentGames().length;
  if (colName === 'Favorites') {
    return sourceGames.filter((g) => favoriteIds.has(g.id)).length;
  }
  return sourceGames.filter((g) => getGameColumn(g) === colName).length;
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
  return ordered.filter((col) => getColumnGameCount(col) > 0);
}

function saveFavorites() {
  favoriteIds = new Set(sanitizeFavoriteIds([...favoriteIds]));
  safeSetLocal(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
  void persistCloudWorkspace();
}

function saveColumnState() {
  customColumns = sanitizeCustomColumns(customColumns);
  safeSetLocal(CUSTOM_COLUMNS_KEY, JSON.stringify(customColumns));
  safeSetLocal(COLUMN_ASSIGNMENTS_KEY, JSON.stringify(columnOverrides));
  void persistCloudWorkspace();
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

function getGameCoverPrimarySrc(game) {
  const raw = String(game?.thumbnail || '').trim();
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const resolved = resolveLocalUrl(raw);
  return resolved || getFallbackPosterUri(game);
}

function createThumbnailNode(game) {
  const posterUri = getFallbackPosterUri(game);
  const thumbSrc = getGameCoverPrimarySrc(game);

  const img = document.createElement('img');
  img.className = 'card-thumb-img';
  img.src = thumbSrc || posterUri;
  img.alt = `${game.title} cover`;
  img.referrerPolicy = 'no-referrer';
  img.loading = 'lazy';

  img.addEventListener('error', () => {
    if (posterUri && img.src !== posterUri) {
      img.src = posterUri;
    }
  });

  return img;
}

function getCategoryIconSvg(catName) {
  switch (catName) {
    case 'Home':
      return '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" stroke-linejoin="round"/>';
    case 'Trending':
      return '<path d="M13 2 3 14h8l-1 8 10-12h-8z" stroke-linejoin="round"/>';
    case 'Recently Played':
      return '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/>';
    case 'Favorites':
      return '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linejoin="round"/>';
    case 'Obby & Parkour':
      return '<path d="M4 19h4v-4h4v-4h4V7h4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="6" r="2"/>';
    case 'Sports':
      return '<circle cx="12" cy="12" r="9"/><path d="M4.5 9.5c5 1 10 1 15 0M4.5 14.5c5-1 10-1 15 0"/>';
    case 'Racing':
      return '<circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3v-5l3-5h9l4 5h2v5h-2m-10 0h6"/>';
    case 'Skill':
      return '<polygon points="12 3 21 19 3 19"/><path d="M12 10v4"/>';
    case '2 Player':
      return '<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M14 19c.4-2.2 2.2-3.8 4.8-3.8 1.2 0 2.2.4 3.2 1.2"/>';
    case 'Action':
      return '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>';
    case 'Puzzle & Merge':
      return '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>';
    case 'Simulation':
      return '<path d="M12 2 8 9v7l-3 3h14l-3-3V9z" stroke-linejoin="round"/><circle cx="12" cy="11" r="2"/>';
    case 'Strategy & TD':
      return '<path d="M12 2 4 6v6c0 5.2 3.4 9.8 8 11 4.6-1.2 8-5.8 8-11V6z" stroke-linejoin="round"/><path d="M12 8v5M9.5 10.5h5" stroke-linecap="round"/>';
    case 'Clicker & Idle':
      return '<path d="M9 11V6a2 2 0 1 1 4 0v5h2a2 2 0 0 1 2 2v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-3a2 2 0 0 1 4 0" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'Multiplayer & .io':
      return '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>';
    case 'Horror & Escape':
      return '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>';
    default:
      return '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 12h4M9 10v4M15 11h.01M17 13h.01" stroke-linecap="round"/>';
  }
}

function syncTopNavState() {
  document.querySelectorAll('[data-nav-cat]').forEach((link) => {
    const cat = link.getAttribute('data-nav-cat') || '';
    if (allGames.length > 0 && cat !== 'Home' && cat !== 'Trending') {
      const count = getColumnGameCount(cat);
      setVisible(link, count > 0);
    }
    const isMatch = activeView === 'catalog' && cat === activeCategory && !searchQuery.trim();
    link.classList.toggle('active', isMatch);
  });

  if (settingsTopBtn) {
    settingsTopBtn.classList.toggle('active', activeView === 'settings');
  }

  if (railSchoolToolsBtn) {
    railSchoolToolsBtn.classList.toggle('active', activeView === 'tools');
  }
}

function renderRailCategories() {
  if (!railCategoryList) return;
  railCategoryList.innerHTML = '';

  const railItems = ['Home', 'Trending'];
  if (getRecentGames().length > 0) railItems.push('Recently Played');
  getAllColumnNames().forEach((col) => {
    if (!railItems.includes(col)) railItems.push(col);
  });

  railItems.forEach((catName) => {
    const count = getColumnGameCount(catName);
    if (catName !== 'Home' && count === 0) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = activeView === 'catalog' && activeCategory === catName && !searchQuery.trim();
    btn.className = `rail-cat-btn${isActive ? ' active' : ''}`;

    const left = document.createElement('span');
    left.className = 'rail-cat-left';
    left.innerHTML = `
      <svg class="rail-cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        ${getCategoryIconSvg(catName)}
      </svg>
      <span>${escapeHtml(catName)}</span>
    `;

    const countSpan = document.createElement('span');
    countSpan.className = 'unboxed-meta';
    countSpan.textContent = String(count);

    btn.appendChild(left);
    btn.appendChild(countSpan);

    btn.addEventListener('click', () => {
      activeCategory = catName;
      visibleGridLimit = GRID_PAGE_SIZE;
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      showCatalogView(true);
      sideOrganizer?.classList.remove('mobile-open');
    });

    railCategoryList.appendChild(btn);
  });
}

function renderFilterBar() {
  if (!categoryFilterBar) return;
  if (
    allGames.length > 0 &&
    activeCategory !== 'Home' &&
    activeCategory !== 'Trending' &&
    getColumnGameCount(activeCategory) === 0
  ) {
    activeCategory = 'Home';
  }

  categoryFilterBar.innerHTML = '';
  const tabs = ['Home', 'Trending'];
  if (getRecentGames().length > 0) tabs.push('Recently Played');
  getAllColumnNames().forEach((c) => {
    if (!tabs.includes(c)) tabs.push(c);
  });

  tabs.forEach((tabName) => {
    const count = getColumnGameCount(tabName);
    if (tabName !== 'Home' && count === 0) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-tab${activeCategory === tabName && !searchQuery.trim() ? ' active' : ''}`;
    btn.textContent = tabName === 'Home' ? 'Home' : `${tabName} (${count})`;
    btn.addEventListener('click', () => {
      activeCategory = tabName;
      visibleGridLimit = GRID_PAGE_SIZE;
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      renderAll();
      syncTopNavState();
    });
    categoryFilterBar.appendChild(btn);
  });

  syncTopNavState();
}

function buildGameCard(game) {
  const article = document.createElement('article');
  article.className = 'game-card';

  const thumbBtn = document.createElement('button');
  thumbBtn.type = 'button';
  thumbBtn.className = 'card-thumb-btn';
  thumbBtn.setAttribute('aria-label', `Play ${game.title}`);
  thumbBtn.appendChild(createThumbnailNode(game));

  const scrim = document.createElement('div');
  scrim.className = 'card-tile-scrim';

  const posterFallback = getFallbackPosterUri(game);
  const miniSrc = getGameCoverPrimarySrc(game) || posterFallback;

  if (miniSrc) {
    const badgeImg = document.createElement('img');
    badgeImg.className = 'card-mini-badge';
    badgeImg.src = miniSrc;
    badgeImg.alt = '';
    badgeImg.referrerPolicy = 'no-referrer';
    badgeImg.loading = 'lazy';
    badgeImg.addEventListener('error', () => {
      if (posterFallback && badgeImg.src !== posterFallback) badgeImg.src = posterFallback;
      else badgeImg.remove();
    });
    scrim.appendChild(badgeImg);
  }

  const infoWrap = document.createElement('div');
  infoWrap.className = 'card-tile-info';

  const titleEl = document.createElement('h3');
  titleEl.className = 'card-tile-title';
  titleEl.textContent = game.title;

  const metaEl = document.createElement('span');
  metaEl.className = 'card-tile-meta';
  metaEl.textContent = `${getGameColumn(game)} · Playgama`;

  infoWrap.appendChild(titleEl);
  infoWrap.appendChild(metaEl);
  scrim.appendChild(infoWrap);

  thumbBtn.appendChild(scrim);
  thumbBtn.addEventListener('click', () => openGame(game.id));

  const isFav = favoriteIds.has(game.id);
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `fav-star-btn${isFav ? ' favorited' : ''}`;
  favBtn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Save to favorites');
  favBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke-linejoin="round"></polygon>
    </svg>
  `;
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(game.id);
  });

  article.appendChild(thumbBtn);
  article.appendChild(favBtn);
  return article;
}

function renderPortalHomeShelves() {
  if (!heroBentoGrid || !shelvesContainer) return;
  const gameMap = new Map(allGames.map((g) => [g.id, g]));

  // 1. Multi-Size 6x2 Mosaic Hero Wall (Retro Bowl 2x2 + Bee Swarm 2x1 + 6 Hits = 12 Cells)
  heroBentoGrid.innerHTML = '';
  const bentoGames = HERO_BENTO_IDS.map((id) => gameMap.get(id)).filter(Boolean);
  if (bentoGames.length < 8) {
    allGames.forEach((g) => {
      if (bentoGames.length < 8 && !bentoGames.includes(g)) bentoGames.push(g);
    });
  }

  bentoGames.slice(0, 8).forEach((game, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const sizeClass = idx === 0 ? ' bento-featured' : idx === 1 ? ' bento-wide' : '';
    btn.className = `bento-tile${sizeClass}`;
    btn.setAttribute('aria-label', `Play ${game.title}`);
    btn.appendChild(createThumbnailNode(game));

    const scrim = document.createElement('div');
    scrim.className = 'bento-scrim';
    scrim.innerHTML = `
      <span class="bento-kicker">${
        idx === 0
          ? 'Featured #1 on Jordans V1.1'
          : `${escapeHtml(getGameColumn(game))} · Instant Play`
      }</span>
      <h2 class="bento-title">${escapeHtml(game.title)}</h2>
      ${idx === 0 ? `<p class="bento-sub">${escapeHtml(game.description || '')}</p>` : ''}
    `;
    btn.appendChild(scrim);
    btn.addEventListener('click', () => openGame(game.id));
    heroBentoGrid.appendChild(btn);
  });

  // 2. Interactive Genre Icon Tile Strip
  if (genreQuickJump) {
    genreQuickJump.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'genre-jump-list';

    const quickCats = ['Trending', ...getAllColumnNames()];
    quickCats.forEach((cat) => {
      const count = getColumnGameCount(cat);
      if (count === 0) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'genre-jump-btn';
      chip.innerHTML = `
        <svg class="genre-jump-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          ${getCategoryIconSvg(cat)}
        </svg>
        <span class="genre-jump-label">${escapeHtml(cat)}</span>
      `;
      chip.addEventListener('click', () => {
        activeCategory = cat;
        searchQuery = '';
        if (searchInput) searchInput.value = '';
        renderAll();
        syncTopNavState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      list.appendChild(chip);
    });

    genreQuickJump.appendChild(list);
  }

  // 3. Horizontal Scrollable Category Carousels with Edge-Fade Hover Arrows
  shelvesContainer.innerHTML = '';

  const shelfDefinitions = [];
  const recents = getRecentGames();
  if (recents.length > 0) {
    shelfDefinitions.push({
      title: 'Continue Playing',
      targetCat: 'Recently Played',
      items: recents.slice(0, 12)
    });
  }

  shelfDefinitions.push({
    title: 'Top Jordans V1.1',
    targetCat: 'Trending',
    items: getHotListGames().slice(0, 14)
  });

  const shelfCategories = [
    { cat: 'Obby & Parkour', label: 'Obby & Parkour Hits' },
    { cat: 'Action', label: 'Action & Shooters' },
    { cat: 'Racing', label: 'Racing, Drift & Car Destruction' },
    { cat: 'Sports', label: 'Sports, Basketball & Soccer' },
    { cat: 'Simulation', label: 'Simulation & Sandbox' },
    { cat: 'Skill', label: 'Skill & Physics Arcade' },
    { cat: 'Clicker & Idle', label: 'Clicker & Tycoon' },
    { cat: 'Multiplayer & .io', label: 'Multiplayer & .io' },
    { cat: '2 Player', label: '2 Player & Versus' },
    { cat: 'Strategy & TD', label: 'Strategy & Tower Defense' },
    { cat: 'Horror & Escape', label: 'Horror & Escape' },
    { cat: 'Puzzle & Merge', label: 'Puzzle, Merge & Logic' }
  ];

  shelfCategories.forEach(({ cat, label }) => {
    const items = allGames.filter((g) => getGameColumn(g) === cat);
    if (items.length > 0) {
      shelfDefinitions.push({
        title: label,
        targetCat: cat,
        items: items.slice(0, 14)
      });
    }
  });

  customColumns.forEach((col) => {
    const items = allGames.filter((g) => getGameColumn(g) === col);
    if (items.length > 0) {
      shelfDefinitions.push({
        title: col,
        targetCat: col,
        items: items.slice(0, 14)
      });
    }
  });

  shelfDefinitions.forEach((shelf) => {
    if (!shelf.items.length) return;
    const sec = document.createElement('div');
    sec.className = 'game-shelf';

    const header = document.createElement('div');
    header.className = 'shelf-header';

    const h2 = document.createElement('h2');
    h2.className = 'shelf-title';
    h2.textContent = shelf.title;

    const controls = document.createElement('div');
    controls.className = 'shelf-controls';

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'shelf-more-btn';
    moreBtn.textContent = `View All (${getColumnGameCount(shelf.targetCat)}) →`;
    moreBtn.addEventListener('click', () => {
      activeCategory = shelf.targetCat;
      visibleGridLimit = GRID_PAGE_SIZE;
      renderAll();
      syncTopNavState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    controls.appendChild(moreBtn);
    header.appendChild(h2);
    header.appendChild(controls);

    const scrollerWrap = document.createElement('div');
    scrollerWrap.className = 'shelf-scroller-wrap';

    const row = document.createElement('div');
    row.className = 'shelf-row';
    shelf.items.forEach((g) => row.appendChild(buildGameCard(g)));
    scrollerWrap.appendChild(row);

    if (shelf.items.length > 4) {
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'shelf-edge-btn prev';
      prevBtn.setAttribute('aria-label', `Scroll ${shelf.title} left`);
      prevBtn.textContent = '‹';
      prevBtn.addEventListener('click', () => {
        row.scrollBy({ left: -520, behavior: 'smooth' });
      });

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'shelf-edge-btn next';
      nextBtn.setAttribute('aria-label', `Scroll ${shelf.title} right`);
      nextBtn.textContent = '›';
      nextBtn.addEventListener('click', () => {
        row.scrollBy({ left: 520, behavior: 'smooth' });
      });

      scrollerWrap.appendChild(prevBtn);
      scrollerWrap.appendChild(nextBtn);
    }

    sec.appendChild(header);
    sec.appendChild(scrollerWrap);
    shelvesContainer.appendChild(sec);
  });
}

function getSearchMatchedGames() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return allGames;
  return allGames.filter((g) => {
    const col = getGameColumn(g);
    return `${g.title} ${col} ${g.controls || ''} ${g.description || ''}`
      .toLowerCase()
      .includes(q);
  });
}

function deleteCustomColumn(colName) {
  customColumns = customColumns.filter((c) => c !== colName);
  Object.keys(columnOverrides).forEach((gameId) => {
    if (columnOverrides[gameId] === colName) {
      delete columnOverrides[gameId];
    }
  });
  if (activeCategory === colName) activeCategory = 'Home';
  saveColumnState();
  renderAll();
  showToast(`Removed column "${colName}"`);
}

function renderCatalog() {
  renderFilterBar();
  const hasSearch = searchQuery.trim().length > 0;

  if (activeCategory === 'Home' && !hasSearch) {
    setVisible(portalHomeView, true);
    setVisible(filteredGridWrap, false);
    setVisible(shuffleHotBtn, true);
    renderPortalHomeShelves();
    return;
  }

  setVisible(portalHomeView, false);
  setVisible(filteredGridWrap, true);

  const matched = getSearchMatchedGames();
  let displayed = [];

  if (hasSearch) {
    displayed =
      activeCategory === 'Home' || activeCategory === 'Trending'
        ? matched
        : activeCategory === 'Favorites'
          ? matched.filter((g) => favoriteIds.has(g.id))
          : activeCategory === 'Recently Played'
            ? getRecentGames().filter((g) => matched.includes(g))
            : matched.filter((g) => getGameColumn(g) === activeCategory);
  } else if (activeCategory === 'Trending') {
    displayed = getHotListGames();
  } else if (activeCategory === 'Recently Played') {
    displayed = getRecentGames();
  } else if (activeCategory === 'Favorites') {
    displayed = allGames.filter((g) => favoriteIds.has(g.id));
  } else {
    displayed = allGames.filter((g) => getGameColumn(g) === activeCategory);
  }

  if (catalogHeading) {
    catalogHeading.textContent = hasSearch
      ? `Search Results for "${searchQuery.trim()}"`
      : activeCategory;
  }

  if (gameCountLabel) {
    gameCountLabel.textContent = `${displayed.length} ${displayed.length === 1 ? 'game' : 'games'}`;
  }

  setVisible(shuffleHotBtn, activeCategory === 'Trending' && !hasSearch);

  if (displayed.length === 0) {
    setVisible(emptyState, true);
    setVisible(gamesGrid, false);
    setVisible(loadMoreWrap, false);
    if (emptyStateMsg) {
      const lowerQ = searchQuery.trim().toLowerCase();
      const deletedMatch =
        lowerQ &&
        (lowerQ.includes('subway') || lowerQ === 'subway-surfers')
          ? 'Subway Surfers — Game Deleted.'
          : '';
      emptyStateMsg.textContent = deletedMatch
        ? deletedMatch
        : activeCategory === 'Favorites' && favoriteIds.size === 0
          ? 'No favorites saved yet. Click the star on any game to save it.'
          : 'No games match your search.';
    }
    return;
  }

  setVisible(emptyState, false);
  setVisible(gamesGrid, true);
  if (!gamesGrid) return;
  gamesGrid.innerHTML = '';

  const slice = displayed.slice(0, visibleGridLimit);
  const frag = document.createDocumentFragment();
  slice.forEach((g) => {
    frag.appendChild(buildGameCard(g, false));
  });
  gamesGrid.appendChild(frag);

  const remaining = displayed.length - slice.length;
  if (remaining > 0 && loadMoreWrap && loadMoreGamesBtn) {
    loadMoreGamesBtn.textContent = `Show More Playgama Games (${remaining.toLocaleString()} more)`;
    setVisible(loadMoreWrap, true);
  } else {
    setVisible(loadMoreWrap, false);
  }
}

function renderOrganizer() {
  renderRailCategories();
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

    const isCustom = customColumns.includes(groupName);
    if (items.length === 0) return;

    const details = document.createElement('details');
    details.className = 'org-group';
    details.setAttribute('data-group', groupName);

    const hasActiveGame = currentGame && items.some((i) => i.id === currentGame.id);
    const shouldOpen =
      q.length > 0 ||
      hasActiveGame ||
      openGroups.has(groupName) ||
      (openGroups.size === 0 && idx < 2 && items.length > 0);

    const summary = document.createElement('summary');
    summary.className = 'org-summary';

    const leftSpan = document.createElement('span');
    leftSpan.className = 'org-summary-left';
    leftSpan.innerHTML = `
      <svg class="org-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(groupName)}</span>
    `;

    const rightSpan = document.createElement('span');
    rightSpan.className = 'org-summary-right';

    if (groupName !== 'Favorites') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'org-mini-action';
      editBtn.textContent = '+';
      editBtn.title = `Add or organize games in ${groupName}`;
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openColumnModalFor(groupName);
      });
      rightSpan.appendChild(editBtn);
    }

    if (isCustom) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'org-mini-action danger';
      delBtn.textContent = '✕';
      delBtn.title = `Remove column ${groupName}`;
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteCustomColumn(groupName);
      });
      rightSpan.appendChild(delBtn);
    }

    const countSpan = document.createElement('span');
    countSpan.className = 'unboxed-meta';
    countSpan.textContent = String(items.length);
    rightSpan.appendChild(countSpan);

    summary.appendChild(leftSpan);
    summary.appendChild(rightSpan);

    const list = document.createElement('div');
    list.className = 'org-list';

    let populated = false;
    function populateList() {
      if (populated) return;
      populated = true;
      const cap = q.length > 0 ? 120 : 80;
      const previewItems = items.slice(0, cap);
      previewItems.forEach((game) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = currentGame && currentGame.id === game.id;
        btn.className = `org-item-btn${isActive ? ' active' : ''}`;
        btn.title = game.title;

        const miniPoster = getFallbackPosterUri(game);
        const miniThumb = getGameCoverPrimarySrc(game) || miniPoster;
        if (miniThumb) {
          const miniImg = document.createElement('img');
          miniImg.className = 'org-item-thumb';
          miniImg.src = miniThumb;
          miniImg.alt = '';
          miniImg.referrerPolicy = 'no-referrer';
          miniImg.loading = 'lazy';
          miniImg.addEventListener('error', () => {
            if (miniPoster && miniImg.src !== miniPoster) miniImg.src = miniPoster;
            else miniImg.replaceWith(createMiniFallback(game.title));
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

      if (items.length > previewItems.length) {
        const viewAllColBtn = document.createElement('button');
        viewAllColBtn.type = 'button';
        viewAllColBtn.className = 'org-item-btn';
        viewAllColBtn.innerHTML = `<span class="org-item-title" style="color:var(--accent);font-weight:700;">View all ${items.length.toLocaleString()} in ${escapeHtml(groupName)} →</span>`;
        viewAllColBtn.addEventListener('click', () => {
          activeCategory = groupName;
          visibleGridLimit = GRID_PAGE_SIZE;
          searchQuery = '';
          if (searchInput) searchInput.value = '';
          showCatalogView(true);
          sideOrganizer?.classList.remove('mobile-open');
        });
        list.appendChild(viewAllColBtn);
      }
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

function setPseudoFullscreen(enabled) {
  if (!iframeStage) return;
  iframeStage.classList.toggle('pseudo-fullscreen', enabled);
  setVisible(pseudoFsControls, enabled);
  document.body.style.overflow = enabled ? 'hidden' : '';
}

function resetWideMode() {
  setPseudoFullscreen(false);
  if (wideMode) {
    wideMode = false;
    appShell?.classList.remove('wide-mode-shell');
    mainContainer?.classList.remove('wide-mode');
    iframeStage?.classList.remove('wide-stage');
    if (theaterToggleBtn) theaterToggleBtn.textContent = 'Wide View';
  }
}

function openSchoolToolsView(updateHash = true) {
  currentGame = null;
  clearTimeout(loaderHideTimer);
  setVisible(jordansLoader, false);
  unmountActiveGame();
  resetWideMode();
  activeView = 'tools';

  setVisible(catalogSection, false);
  setVisible(playerSection, false);
  setVisible(settingsSection, false);
  setVisible(schoolToolsSection, true);
  setVisible(sideOrganizer, true);
  mobileOrganizerBar?.classList.remove('hidden');
  if (mobileOrganizerBar) mobileOrganizerBar.hidden = false;

  renderOrganizer();
  syncTopNavState();
  if (updateHash) safePushHash('#tools');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openSettingsPage(updateHash = true) {
  currentGame = null;
  clearTimeout(loaderHideTimer);
  setVisible(jordansLoader, false);
  unmountActiveGame();
  resetWideMode();
  activeView = 'settings';

  setVisible(catalogSection, false);
  setVisible(playerSection, false);
  setVisible(schoolToolsSection, false);
  setVisible(settingsSection, true);
  setVisible(sideOrganizer, false);
  setVisible(mobileOrganizerBar, false);
  syncTopNavState();

  if (iframeEmbedCodeOutput) {
    void fetchFullSitesEmbedBundle().then((bundle) => {
      if (iframeEmbedCodeOutput) iframeEmbedCodeOutput.value = bundle;
    });
  }

  if (updateHash) {
    safePushHash('#settings');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showCatalogView(updateHash = true) {
  currentGame = null;
  clearTimeout(loaderHideTimer);
  setVisible(jordansLoader, false);
  unmountActiveGame();
  resetWideMode();
  activeView = 'catalog';

  setVisible(settingsSection, false);
  setVisible(schoolToolsSection, false);
  setVisible(playerSection, false);
  setVisible(catalogSection, true);
  setVisible(sideOrganizer, true);
  mobileOrganizerBar?.classList.remove('hidden');
  if (mobileOrganizerBar) mobileOrganizerBar.hidden = false;

  renderAll();
  syncTopNavState();

  if (updateHash) {
    const slug = activeCategory === 'Home' ? 'home' : activeCategory.toLowerCase();
    safePushHash(`#${encodeURIComponent(slug)}`);
  }
}

function openGame(gameId, updateHash = true) {
  if (DELETED_GAMES_MAP[gameId]) {
    showToast(`${DELETED_GAMES_MAP[gameId]} — Game Deleted`);
    showCatalogView(true);
    return;
  }
  const found = allGames.find((g) => g.id === gameId);
  if (!found) return;
  currentGame = found;
  activeView = 'player';
  recordRecentGame(found.id);

  setVisible(settingsSection, false);
  setVisible(schoolToolsSection, false);
  setVisible(catalogSection, false);
  setVisible(playerSection, true);
  setVisible(sideOrganizer, true);
  mobileOrganizerBar?.classList.remove('hidden');
  if (mobileOrganizerBar) mobileOrganizerBar.hidden = false;

  if ((IS_GOOGLE_SITES_MODE || window.innerWidth <= 1180) && !wideMode) {
    wideMode = true;
    appShell?.classList.add('wide-mode-shell');
    mainContainer?.classList.add('wide-mode');
    iframeStage?.classList.add('wide-stage');
    if (theaterToggleBtn) theaterToggleBtn.textContent = 'Show Columns';
  }

  renderOrganizer();
  syncTopNavState();
  syncPlayerMetadata();
  syncPlayerFavoriteButton();
  syncAssignColumnDropdown();

  mountCurrentIframe();

  if (relatedGrid) {
    const col = getGameColumn(found);
    const sameCol = allGames.filter((g) => g.id !== found.id && getGameColumn(g) === col).slice(0, 6);
    const hotMatches = getHotListGames().filter((g) => g.id !== found.id).slice(0, 6);
    const others = sameCol.length >= 3 ? sameCol : hotMatches;
    relatedGrid.innerHTML = '';
    setVisible(relatedGrid.parentElement, others.length > 0);
    others.forEach((g) => relatedGrid.appendChild(buildGameCard(g)));
  }

  if (updateHash) {
    safePushHash(`#play=${encodeURIComponent(found.id)}`);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncPlayerMetadata() {
  if (!currentGame) return;
  const col = getGameColumn(currentGame);

  if (activeGameTitle) activeGameTitle.textContent = currentGame.title;
  if (activeGameMeta) {
    activeGameMeta.textContent = `${col} · Official Playgama Web Game · Instant Play`;
  }
  if (activeGameDesc) activeGameDesc.textContent = currentGame.description || '';
}

function mountCurrentIframe() {
  if (!currentGame || !iframeMount) return;
  clearTimeout(loaderHideTimer);
  unmountActiveGame();

  const embedUrl = getPlaygamaEmbedUrl(currentGame);
  const coverSrc = getGameCoverPrimarySrc(currentGame);

  if (loaderGameTitle) loaderGameTitle.textContent = currentGame.title;
  if (loaderStatusText) loaderStatusText.textContent = 'Loading official Playgama game...';
  if (loaderThumbImg) {
    if (coverSrc) {
      loaderThumbImg.src = coverSrc;
      setVisible(loaderThumbImg, true);
    } else {
      setVisible(loaderThumbImg, false);
    }
  }
  setVisible(jordansLoader, true);

  const iframe = document.createElement('iframe');
  iframe.className = 'game-iframe';
  iframe.src = embedUrl;
  iframe.title = currentGame.title;
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.setAttribute(
    'allow',
    'fullscreen; autoplay; accelerometer; clipboard-read; clipboard-write; encrypted-media; gyroscope; gamepad; pointer-lock; web-share; xr-spatial-tracking; picture-in-picture'
  );
  iframe.setAttribute('allowfullscreen', 'true');

  const dismissLoader = () => {
    clearTimeout(loaderHideTimer);
    setVisible(jordansLoader, false);
  };

  iframe.addEventListener('load', dismissLoader, { once: true });
  loaderHideTimer = setTimeout(dismissLoader, 1600);

  iframeMount.appendChild(iframe);
  activeGameCleanup = () => {
    clearTimeout(loaderHideTimer);
    try {
      iframe.src = 'about:blank';
    } catch {
      // Ignore cleanup errors
    }
  };
}

function handleSmartRefresh() {
  if (activeView === 'player' && currentGame) {
    mountCurrentIframe();
    showToast(`Reloaded ${currentGame.title}`);
    return;
  }
  fetchGamesCatalog()
    .then((fresh) => {
      const cleanFresh = filterOutDeletedGames(fresh);
      if (cleanFresh.length > 0) {
        allGames = cleanFresh;
        ensureHotListInitialized();
      }
      renderAll();
      syncFooterAuthUI();
      showToast(`Refreshed ${allGames.length.toLocaleString()} Playgama games`);
    })
    .catch(() => {
      renderAll();
      showToast('Refreshed Playgama catalog');
    });
}

function closeGame(updateHash = true) {
  showCatalogView(updateHash);
}

loadMoreGamesBtn?.addEventListener('click', () => {
  visibleGridLimit += GRID_PAGE_SIZE;
  renderCatalog();
});

async function queryLivePlaygamaSearch(q) {
  if (IS_GOOGLE_SITES_MODE || !q || q.length < 2 || q.toLowerCase().includes('subway')) return;
  try {
    const res = await fetch(`/api/playgama/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const payload = await res.json();
    const incoming = filterOutDeletedGames(payload?.games || []);
    if (!incoming.length) return;
    const known = new Set(allGames.map((g) => g.id));
    let added = 0;
    incoming.forEach((g) => {
      if (g?.id && !known.has(g.id)) {
        known.add(g.id);
        allGames.push(g);
        added += 1;
      }
    });
    if (added > 0 && searchQuery.trim().toLowerCase() === q.toLowerCase()) {
      syncFooterAuthUI();
      renderCatalog();
    }
  } catch {
    // Offline or static mode: local 6,169-game Playgama catalog handles search directly
  }
}

// Event Listeners
searchInput?.addEventListener('input', (e) => {
  searchQuery = e.target.value || '';
  visibleGridLimit = GRID_PAGE_SIZE;
  if (activeView !== 'catalog') {
    showCatalogView(false);
  } else {
    renderCatalog();
    syncTopNavState();
  }
  clearTimeout(liveSearchTimer);
  const trimmed = searchQuery.trim();
  if (trimmed.length >= 2) {
    liveSearchTimer = setTimeout(() => {
      void queryLivePlaygamaSearch(trimmed);
    }, 320);
  }
});

organizerSearchInput?.addEventListener('input', (e) => {
  organizerQuery = e.target.value || '';
  renderOrganizer();
});

toggleOrganizerMobileBtn?.addEventListener('click', () => {
  sideOrganizer?.classList.toggle('mobile-open');
});

mobileRefreshBtn?.addEventListener('click', handleSmartRefresh);
refreshNavBtn?.addEventListener('click', handleSmartRefresh);

railSchoolToolsBtn?.addEventListener('click', () => {
  openSchoolToolsView(true);
  sideOrganizer?.classList.remove('mobile-open');
});
mobileSchoolToolsBtn?.addEventListener('click', () => openSchoolToolsView(true));
openSchoolToolsToolbarBtn?.addEventListener('click', () => openSchoolToolsView(true));
footerSchoolToolsBtn?.addEventListener('click', () => openSchoolToolsView(true));
closeSchoolToolsBtn?.addEventListener('click', () => showCatalogView(true));

shuffleHotBtn?.addEventListener('click', () => {
  shuffleHotList();
});

document.querySelectorAll('[data-nav-cat]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    activeCategory = link.getAttribute('data-nav-cat') || 'Home';
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    showCatalogView(true);
  });
});

settingsTopBtn?.addEventListener('click', () => {
  if (activeView === 'settings') {
    showCatalogView(true);
  } else {
    openSettingsPage(true);
  }
});

settingsBackBtn?.addEventListener('click', () => showCatalogView(true));

brandLink?.addEventListener('click', (e) => {
  e.preventDefault();
  activeCategory = 'Home';
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  showCatalogView(true);
});

function triggerPanicMode(e) {
  const target = getActivePanicTarget();

  // Immediately stop & unmount any running game and audio
  clearTimeout(loaderHideTimer);
  setVisible(jordansLoader, false);
  unmountActiveGame();
  currentGame = null;
  resetWideMode();

  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen();
    } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch {
    // Ignore fullscreen exit errors
  }

  document.title = target.tabTitle || target.label;
  if (dynamicFavicon) {
    dynamicFavicon.setAttribute(
      'href',
      makeCloakIcon(target.color || '#2563eb', '#ffffff', target.badge || 'C')
    );
  }

  let isTopWindow = false;
  try {
    isTopWindow = window.self === window.top;
  } catch {
    isTopWindow = false;
  }

  if (isTopWindow) {
    e?.preventDefault();
    window.location.replace(target.url);
    return;
  }

  try {
    window.top.location.replace(target.url);
    return;
  } catch {
    // Cross-origin embedded frame (e.g. Google Sites / preview iframe):
    // Let native <a target="_blank"> clicks open the real destination tab AND cloak this frame immediately
    renderPanicDisguiseWorkspace(target);
  }
}

panicBtn?.addEventListener('click', triggerPanicMode);
fsPanicBtn?.addEventListener('click', triggerPanicMode);
testPanicSettingsBtn?.addEventListener('click', triggerPanicMode);

randomGameBtn?.addEventListener('click', () => {
  if (!allGames.length) return;
  const pick = allGames[Math.floor(Math.random() * allGames.length)];
  openGame(pick.id);
});

clearFiltersBtn?.addEventListener('click', () => {
  activeCategory = 'Home';
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  renderAll();
  syncTopNavState();
});

backToCatalogBtn?.addEventListener('click', () => closeGame(true));

reloadIframeBtn?.addEventListener('click', handleSmartRefresh);
fsRefreshBtn?.addEventListener('click', handleSmartRefresh);

popoutWindowBtn?.addEventListener('click', () => {
  if (!currentGame) return;
  const embedUrl = getPlaygamaEmbedUrl(currentGame);
  try {
    const w = window.open('about:blank', '_blank');
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(currentGame.title)}</title><style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:none;overflow:hidden;background:#000;}</style></head><body><iframe src="${embedUrl}" allow="fullscreen; autoplay; accelerometer; clipboard-read; clipboard-write; encrypted-media; gyroscope; gamepad; pointer-lock" referrerpolicy="no-referrer" allowfullscreen></iframe></body></html>`);
      w.document.close();
      showToast(`Opened ${currentGame.title} in clean window`);
    } else {
      window.open(embedUrl, '_blank', 'noopener,noreferrer');
    }
  } catch {
    window.open(embedUrl, '_blank', 'noopener,noreferrer');
  }
});

playerFavBtn?.addEventListener('click', () => {
  if (currentGame) toggleFavorite(currentGame.id);
});

assignColumnSelect?.addEventListener('change', (e) => {
  if (!currentGame) return;
  const targetCol = e.target.value;
  columnOverrides[currentGame.id] = targetCol;
  saveColumnState();
  syncPlayerMetadata();
  renderAll();
  showToast(`Moved "${currentGame.title}" to ${targetCol}`);
});

theaterToggleBtn?.addEventListener('click', () => {
  wideMode = !wideMode;
  appShell?.classList.toggle('wide-mode-shell', wideMode);
  mainContainer?.classList.toggle('wide-mode', wideMode);
  iframeStage?.classList.toggle('wide-stage', wideMode);
  if (theaterToggleBtn) {
    theaterToggleBtn.textContent = wideMode ? 'Show Columns' : 'Wide View';
  }
});

fullscreenBtn?.addEventListener('click', async () => {
  if (!iframeStage) return;
  if (iframeStage.classList.contains('pseudo-fullscreen')) {
    setPseudoFullscreen(false);
    return;
  }

  // Inside Google Sites nested sandboxed iframes on iPad, use edge-to-edge viewport fullscreen immediately
  if (IS_GOOGLE_SITES_MODE) {
    setPseudoFullscreen(true);
    return;
  }

  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (!fsEl) {
      if (iframeStage.requestFullscreen) {
        await iframeStage.requestFullscreen();
        return;
      }
      if (iframeStage.webkitRequestFullscreen) {
        iframeStage.webkitRequestFullscreen();
        return;
      }
      setPseudoFullscreen(true);
    } else if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch {
    setPseudoFullscreen(true);
  }
});

exitPseudoFsBtn?.addEventListener('click', () => {
  setPseudoFullscreen(false);
});

// Add / Organize Left Column Modal
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
    colModalTitleEl.textContent = isExisting
      ? `Organize "${presetColName}" Column`
      : 'Create New Column';
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
  const rawName = sanitizeCustomColumns([columnNameInput?.value || ''])[0] || '';
  if (!rawName) return;

  if (checklistSelectedIds.size === 0 && currentGame) {
    checklistSelectedIds.add(currentGame.id);
  }
  if (checklistSelectedIds.size === 0) {
    showToast('Select at least 1 game so the column is not empty');
    return;
  }

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
  renderAll();
  showToast(existedBefore ? `Updated column "${rawName}"` : `Created column "${rawName}"`);
});

// ==========================================
// Settings Tabs, Suggestions -> AI Studio, & Active Websites
// ==========================================

function switchSettingsTab(tabKey) {
  const isSuggestions = tabKey === 'suggestions';
  tabBtnSuggestions?.classList.toggle('active', isSuggestions);
  tabBtnSuggestions?.setAttribute('aria-selected', String(isSuggestions));
  tabBtnServers?.classList.toggle('active', !isSuggestions);
  tabBtnServers?.setAttribute('aria-selected', String(!isSuggestions));

  setVisible(panelSuggestions, isSuggestions);
  setVisible(panelServers, !isSuggestions);
}

tabBtnSuggestions?.addEventListener('click', () => {
  switchSettingsTab('suggestions');
});

tabBtnServers?.addEventListener('click', () => {
  switchSettingsTab('servers');
});

inlineSuggestionsTrigger?.addEventListener('click', () => {
  switchSettingsTab('suggestions');
  suggestionNoteInput?.focus();
});

document.querySelectorAll('.server-copy-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const url = btn.getAttribute('data-copy-url') || '';
    if (!url) return;
    const ok = await copyTextWithFallback(url);
    showToast(ok ? 'Website link copied to clipboard' : url);
  });
});

suggestionNoteInput?.addEventListener('input', () => {
  const len = (suggestionNoteInput.value || '').length;
  if (suggestionCharCount) {
    suggestionCharCount.textContent = `${len} / ${MAX_SUGGESTION_LEN}`;
  }
});

function setSuggestionStatus(message, isError = false) {
  if (!suggestionStatusMsg) return;
  suggestionStatusMsg.textContent = message;
  suggestionStatusMsg.classList.toggle('error', isError);
  setVisible(suggestionStatusMsg, Boolean(message));
}

function sanitizeSenderNickname(raw) {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9 _\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SENDER_LEN);
  if (!cleaned || !VALID_SENDER_REGEX.test(cleaned)) {
    return 'Player';
  }
  return cleaned;
}

function createSafeSuggestionId() {
  const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 10) || 'note';
  return `sug_${Date.now()}_${rand}`.slice(0, 96);
}

suggestionForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmittingSuggestion) return;

  const rawNote = String(suggestionNoteInput?.value || '').trim().slice(0, MAX_SUGGESTION_LEN);
  if (rawNote.length < MIN_SUGGESTION_LEN) {
    setSuggestionStatus('Please type a suggestion of at least 2 characters.', true);
    suggestionNoteInput?.focus();
    return;
  }

  const senderName = sanitizeSenderNickname(suggestionSenderInput?.value || '');
  const rawServer = String(suggestionServerSelect?.value || '');
  const serverSource = ALLOWED_SERVER_SOURCES.has(rawServer)
    ? rawServer
    : IS_GOOGLE_SITES_MODE
      ? 'Version 1'
      : 'AI Studio';

  const suggestionId = createSafeSuggestionId();
  const path = `suggestions/${suggestionId}`;

  isSubmittingSuggestion = true;
  if (submitSuggestionBtn) {
    submitSuggestionBtn.disabled = true;
    submitSuggestionBtn.textContent = 'Sending...';
  }
  setSuggestionStatus('');

  try {
    await initFirebaseOptional();
    if (!firebaseReady || !db) {
      const queued = loadJsonStorage('jords_offline_suggestions', []);
      queued.push({
        id: suggestionId,
        senderName,
        note: rawNote,
        serverSource,
        createdAt: new Date().toISOString()
      });
      safeSetLocal('jords_offline_suggestions', JSON.stringify(queued.slice(-30)));
      if (suggestionNoteInput) suggestionNoteInput.value = '';
      if (suggestionCharCount) suggestionCharCount.textContent = `0 / ${MAX_SUGGESTION_LEN}`;
      setSuggestionStatus('Saved note locally (school network restricted cloud sync).', false);
      showToast('Suggestion saved locally');
      return;
    }

    await setDoc(doc(db, 'suggestions', suggestionId), {
      senderName,
      note: rawNote,
      serverSource,
      targetId: SUGGESTION_TARGET_ID,
      createdAt: serverTimestamp()
    });

    if (suggestionNoteInput) suggestionNoteInput.value = '';
    if (suggestionCharCount) suggestionCharCount.textContent = `0 / ${MAX_SUGGESTION_LEN}`;
    setSuggestionStatus('Suggestion sent to Jordan J.\u2019s AI Studio!', false);
    showToast('Suggestion sent to AI Studio');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Quota exceeded')) {
      setSuggestionStatus('Daily suggestion quota reached. Please try again tomorrow.', true);
    } else if (
      msg.includes('Missing or insufficient permissions') ||
      msg.includes('permission-denied')
    ) {
      setSuggestionStatus('Could not send suggestion right now.', true);
      handleFirestoreError(error, OperationType.CREATE, path);
    } else {
      setSuggestionStatus('Network restricted — please try again in a moment.', true);
    }
  } finally {
    isSubmittingSuggestion = false;
    if (submitSuggestionBtn) {
      submitSuggestionBtn.disabled = false;
      submitSuggestionBtn.textContent = 'Send Suggestion';
    }
  }
});

inboxSignInBtn?.addEventListener('click', handleOwnerInboxSignInClick);

function renderInboxItems(docsList) {
  if (!studioInboxList) return;
  studioInboxList.innerHTML = '';

  if (inboxCountLabel) {
    inboxCountLabel.textContent = `${docsList.length} ${docsList.length === 1 ? 'note' : 'notes'}`;
  }

  if (docsList.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-panel-sub';
    empty.textContent = 'No player suggestions yet. Notes sent from any Jordans V1.1 website appear here automatically.';
    studioInboxList.appendChild(empty);
    return;
  }

  docsList.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'inbox-note-item';

    const head = document.createElement('div');
    head.className = 'inbox-note-head';

    const left = document.createElement('div');
    const author = document.createElement('span');
    author.className = 'inbox-note-author';
    author.textContent = `${item.senderName || 'Player'} · ${item.serverSource || 'Website'}`;

    const meta = document.createElement('div');
    meta.className = 'inbox-note-meta';
    meta.textContent = item.dateText || 'Just now';

    left.appendChild(author);
    left.appendChild(meta);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'org-mini-action danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const delPath = `suggestions/${item.id}`;
      try {
        await deleteDoc(doc(db, 'suggestions', item.id));
        showToast('Removed suggestion note');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
          handleFirestoreError(error, OperationType.DELETE, delPath);
        } else {
          showToast('Could not remove suggestion note');
        }
      }
    });

    head.appendChild(left);
    head.appendChild(delBtn);

    const body = document.createElement('p');
    body.className = 'inbox-note-body';
    body.textContent = item.note || '';

    row.appendChild(head);
    row.appendChild(body);
    studioInboxList.appendChild(row);
  });
}

function syncSuggestionsInboxAuth(user) {
  if (IS_GOOGLE_SITES_MODE || !studioInboxCard) return;

  if (unsubscribeSuggestionsInbox) {
    unsubscribeSuggestionsInbox();
    unsubscribeSuggestionsInbox = null;
  }

  const isVerifiedOwner = Boolean(
    user &&
    user.emailVerified &&
    String(user.email || '').toLowerCase() === ADMIN_OWNER_EMAIL.toLowerCase()
  );

  if (!isVerifiedOwner) {
    setVisible(studioInboxAuthPrompt, true);
    setVisible(studioInboxList, false);
    if (inboxCountLabel) inboxCountLabel.textContent = 'Owner only';
    const promptText = studioInboxAuthPrompt?.querySelector('p');
    if (promptText) {
      promptText.textContent = user?.email
        ? `Signed in as ${user.email}. Switch to ${ADMIN_OWNER_EMAIL} to view incoming suggestions.`
        : 'Sign in with Jordan J.\u2019s Google account to read incoming suggestion notes here in AI Studio.';
    }
    setVisible(inboxSignInBtn, !user);
    return;
  }

  if (!firebaseReady || !db) return;

  setVisible(studioInboxAuthPrompt, false);
  setVisible(studioInboxList, true);

  const suggestionsQuery = query(
    collection(db, 'suggestions'),
    where('targetId', '==', SUGGESTION_TARGET_ID)
  );

  unsubscribeSuggestionsInbox = onSnapshot(
    suggestionsQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => {
        const d = docSnap.data() || {};
        const tsMillis = d.createdAt?.toMillis ? d.createdAt.toMillis() : 0;
        const dateText = tsMillis ? new Date(tsMillis).toLocaleString() : 'Just now';
        return {
          id: docSnap.id,
          senderName: d.senderName || 'Player',
          note: d.note || '',
          serverSource: d.serverSource || 'Website',
          tsMillis,
          dateText
        };
      });
      items.sort((a, b) => b.tsMillis - a.tsMillis);
      renderInboxItems(items);
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Quota exceeded')) {
        showToast('Daily suggestion read quota reached; resets tomorrow.');
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'suggestions');
    }
  );
}

function handleHashRoute() {
  if (!isPasscodeUnlocked) return;
  const hash = (window.location.hash || '').trim();
  if (hash === '#settings') {
    openSettingsPage(false);
    return;
  }
  if (hash === '#tools') {
    openSchoolToolsView(false);
    return;
  }
  if (hash.startsWith('#play=')) {
    const id = decodeURIComponent(hash.slice('#play='.length));
    if (DELETED_GAMES_MAP[id]) {
      showToast(`${DELETED_GAMES_MAP[id]} — Game Deleted`);
      showCatalogView(true);
      return;
    }
    if (allGames.some((g) => g.id === id)) {
      openGame(id, false);
      return;
    }
  }
  if (hash === '#favorites') {
    activeCategory = 'Favorites';
    showCatalogView(false);
    return;
  }
  if (hash === '#trending' || hash === '#hot') {
    activeCategory = 'Trending';
    showCatalogView(false);
    return;
  }
  if (hash === '#obby' || hash === '#obby%20%26%20parkour') {
    activeCategory = 'Obby & Parkour';
    showCatalogView(false);
    return;
  }
  if (hash === '#sports') {
    activeCategory = 'Sports';
    showCatalogView(false);
    return;
  }
  if (hash === '#racing') {
    activeCategory = 'Racing';
    showCatalogView(false);
    return;
  }
  if (hash && hash !== '#home' && hash !== '#all') {
    const decoded = decodeURIComponent(hash.slice(1)).toLowerCase();
    const matchedCol = getAllColumnNames().find((col) => col.toLowerCase() === decoded);
    if (matchedCol) {
      activeCategory = matchedCol;
      showCatalogView(false);
      return;
    }
  }
  if (hash === '#home' || hash === '#all' || !hash) {
    if (activeView !== 'catalog') {
      activeCategory = 'Home';
      showCatalogView(false);
    }
  }
}

window.addEventListener('popstate', handleHashRoute);

async function fetchGamesCatalog() {
  if (
    typeof window !== 'undefined' &&
    Array.isArray(window.__JORDS_INLINE_GAMES__) &&
    window.__JORDS_INLINE_GAMES__.length > 0
  ) {
    return window.__JORDS_INLINE_GAMES__;
  }

  for (const candidate of [
    { url: './games.json', prefix: '.' },
    { url: './public/games.json', prefix: './public' }
  ]) {
    try {
      const res = await fetch(candidate.url, { cache: 'no-cache' });
      if (res.ok) {
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('html')) {
          const parsed = await res.json();
          if (Array.isArray(parsed) && parsed.length > 0) {
            assetPrefix = candidate.prefix;
            return parsed;
          }
        }
      }
    } catch {
      // Try next candidate or fall back to compiled INLINE_GAMES_CATALOG
    }
  }

  return Array.isArray(INLINE_GAMES_CATALOG) ? INLINE_GAMES_CATALOG : [];
}

async function init() {
  initAuthGate();
  setVisible(errorState, false);

  // Render immediately at 0ms from inline catalog so Jordans V1.1 never flashes an empty or error screen
  if (allGames.length > 0) {
    ensureHotListInitialized();
    setVisible(loadingState, false);
    renderAll();
    syncFooterAuthUI();
    handleHashRoute();
  } else {
    setVisible(loadingState, true);
  }

  try {
    const fresh = filterOutDeletedGames(await fetchGamesCatalog());
    if (fresh.length > 0) {
      const changed = fresh.length !== allGames.length;
      allGames = fresh;
      ensureHotListInitialized();
      setVisible(loadingState, false);
      if (changed || activeView === 'catalog') {
        renderAll();
        syncFooterAuthUI();
      }
      handleHashRoute();
    } else {
      setVisible(loadingState, false);
    }
  } catch {
    setVisible(loadingState, false);
    if (allGames.length === 0) {
      setVisible(errorState, true);
    }
  }
}

init();
