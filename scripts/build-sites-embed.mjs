import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const rawScriptJs = fs.readFileSync(path.join(rootDir, 'script.js'), 'utf8');
const firebaseConfigRaw = fs.readFileSync(
  path.join(rootDir, 'firebase-applet-config.json'),
  'utf8'
);
const rawGamesJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public', 'games.json'), 'utf8')
);
const { PLAYGAMA_TRENDING_SLUGS } = await import('../catalogFallback.js');

const SHARED_ORIGIN = 'https://ais-pre-n2xfecuxxm2xybnfyl23hz-903443430664.us-east1.run.app';

const LOCAL_MAP = {
  'spaceflight-simulator': `${SHARED_ORIGIN}/games/spaceflightsimulator/index.html`,
  'bee-swarm-simulator': `${SHARED_ORIGIN}/games/beeswarmsimulator/index.html`,
  'retro-bowl': `${SHARED_ORIGIN}/games/retrobowl/index.html`,
  'slope': `${SHARED_ORIGIN}/games/slope/index.html`,
  'drive-mad': `${SHARED_ORIGIN}/games/drivemad/index.html`,
  'moto-x3m': `${SHARED_ORIGIN}/games/motox3m/index.html`,
  'basket-random': `${SHARED_ORIGIN}/games/basketrandom/index.html`
};

// Include top 800 official Playgama games with school unblock proxy routing
const gamesJson = rawGamesJson.slice(0, 800).map((g) => {
  let finalUrl = LOCAL_MAP[g.id];
  if (!finalUrl) {
    if (g.url && (g.url.includes('/games/') || g.url.includes('/api/proxy/game/'))) {
      finalUrl = g.url;
    } else {
      finalUrl = `${SHARED_ORIGIN}/api/proxy/game/${encodeURIComponent(g.id)}`;
    }
  }

  let finalThumb = '';
  if (g.thumbnail && /^https?:\/\//i.test(g.thumbnail)) {
    finalThumb = g.thumbnail;
  } else if (g.thumbnail && (g.thumbnail.startsWith('/games/') || g.thumbnail.startsWith('./games/'))) {
    finalThumb = `${SHARED_ORIGIN}${g.thumbnail.replace(/^\./, '')}`;
  }

  return {
    id: g.id,
    title: g.title,
    category: g.category,
    url: finalUrl,
    controls: g.controls || 'Desktop & Touch · Playgama',
    description: g.description || '',
    thumbnail: finalThumb
  };
});

const scriptWithInlineConfig = rawScriptJs
  .replace(
    /import\s+firebaseConfig\s+from\s+['"]\.\/firebase-applet-config\.json['"];?/,
    () => `const firebaseConfig = ${firebaseConfigRaw.trim()};`
  )
  .replace(
    /import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/catalogFallback\.js['"];?/,
    () =>
      `const INLINE_GAMES_CATALOG = window.__JORDS_INLINE_GAMES__ || [];\nconst PLAYGAMA_TRENDING_SLUGS = ${JSON.stringify(PLAYGAMA_TRENDING_SLUGS || [])};`
  )
  .replace(
    /import\(\s*['"]firebase\/app['"]\s*\)/g,
    () => "import('https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js')"
  )
  .replace(
    /import\(\s*['"]firebase\/auth['"]\s*\)/g,
    () => "import('https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js')"
  )
  .replace(
    /import\(\s*['"]firebase\/firestore['"]\s*\)/g,
    () => "import('https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js')"
  )
  .replace(/\bexport\s+(const|let)\s+(db|auth)\b/g, '$1 $2');

const googleSitesFixesCss = `
html, body {
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto !important;
  background-color: #070709;
}
`;

const minifiedCss = esbuild.transformSync(styleCss + '\n' + googleSitesFixesCss, {
  loader: 'css',
  minify: true
}).code;

const minifiedJs = esbuild.transformSync(scriptWithInlineConfig, {
  loader: 'js',
  minify: true,
  target: 'es2020'
}).code;

const safeCss = minifiedCss.replace(/<\/style/gi, '<\\/style');
const safeGamesPayload = JSON.stringify(gamesJson).replace(/<\//g, '<\\/');
const safeJs = minifiedJs.replace(/<\/script/gi, '<\\/script');

const classicBootScript = `<script>
window.__JORDS_GOOGLE_SITES_MODE__ = true;
window.__JORDS_INLINE_GAMES__ = ${safeGamesPayload};
(function () {
  function __bootJordsStandalone() {
${safeJs}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __bootJordsStandalone, { once: true });
  } else {
    __bootJordsStandalone();
  }
})();
</script>`;

const embedHtml = indexHtml
  .replace(/<script\s+type="importmap">[\s\S]*?<\/script>\s*/i, '')
  .replace(
    /<link\s+rel="stylesheet"\s+href="\.\/style\.css"\s*\/?>/i,
    () => `<style>${safeCss}</style>`
  )
  .replace(
    /<script\s+type="module"\s+src="\.\/script\.js"\s*><\/script>/i,
    () => classicBootScript
  );

const outPath = path.join(rootDir, 'public', 'google-sites-embed.html');
fs.writeFileSync(outPath, embedHtml, 'utf8');
console.log(
  `Built ${outPath} (${(Buffer.byteLength(embedHtml, 'utf8') / 1024).toFixed(1)} KB, ${gamesJson.length} real Playgama games)`
);
