import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const DELETED_SLUGS = new Set(['subway-surfers']);

function mapPlaygamaCategory(mainCat: string, fallbackCat = ''): string {
  const c = String(mainCat || fallbackCat || '').toLowerCase();
  if (c.includes('obby') || c.includes('parkour')) return 'Obby & Parkour';
  if (
    ['sports', 'basketball', 'soccer', 'american-football', 'baseball', 'football', 'tennis', 'golf', 'mini-golf', 'bowling', 'boxing', 'wrestling', 'hockey', 'skateboarding', 'pool', 'cricket', 'olympics', 'penalty', 'world-cup'].includes(c)
  ) {
    return 'Sports';
  }
  if (
    ['racing', 'car', 'driving', 'drifting', 'bike', 'dirt-bike', 'motorbike', 'monster-truck', 'truck', 'parking', 'taxi', 'bus', 'car-racing', 'tractor', 'train', 'boat'].includes(c)
  ) {
    return 'Racing';
  }
  if (['two-player', '1v1', 'co-op'].includes(c)) return '2 Player';
  if (['io', 'multiplayer', 'battle-royale', 'pvp'].includes(c)) return 'Multiplayer & .io';
  if (['horror', 'scary', 'ghost', 'zombie', 'halloween'].includes(c)) return 'Horror & Escape';
  if (['strategy', 'tower-defense', 'war', 'tanks', 'army', 'battleship', 'chess', 'checkers'].includes(c)) {
    return 'Strategy & TD';
  }
  if (['clicker', 'idle', 'tycoon', 'management'].includes(c)) return 'Clicker & Idle';
  if (
    ['simulation', 'space', 'airplane', 'flying', 'construction', 'crafting', 'minecraft', 'farm', 'cooking', 'restaurant', 'fishing', 'doctor', 'hospital', 'surgery'].includes(c)
  ) {
    return 'Simulation';
  }
  if (
    ['puzzle', 'merge', 'watermelon', 'matching', 'match-3', 'blocks', 'logic', 'brain', 'intelligence', 'words', 'number', 'math', 'maze', 'sudoku', 'solitaire', 'cards', 'mahjong', 'board', 'bubble-shooter', 'bubble', 'unblock-puzzles', 'hidden-object', 'quiz', 'trivia', 'drawing', 'color'].includes(c)
  ) {
    return 'Puzzle & Merge';
  }
  if (
    ['skill', 'arcade', 'runner', 'running', 'platform', 'physics', 'ragdoll', 'snake', 'ball', 'flappy-bird', 'music', 'classic', 'retro'].includes(c)
  ) {
    return 'Skill';
  }
  return 'Action';
}

function normalizePlaygamaGame(raw: Record<string, unknown>, fallbackCat = '') {
  const hru = String(raw?.hru || '').trim();
  if (!hru || DELETED_SLUGS.has(hru)) return null;
  const title = String(raw?.title || hru).trim();
  if (title.toLowerCase().includes('subway surfer')) return null;

  const thumbnail = String(raw?.preview || raw?.big_preview || raw?.icon || '').trim();
  const rawDesc = String(raw?.collection_description || '').replace(/\s+/g, ' ').trim();
  const description = rawDesc.length > 200 ? `${rawDesc.slice(0, 197)}...` : rawDesc;

  return {
    id: hru,
    title,
    category: mapPlaygamaCategory(String(raw?.main_category || ''), fallbackCat),
    url: `https://playgama.com/export/game/${hru}`,
    thumbnail,
    controls: 'Desktop & Touch · Playgama',
    description: description || `Play the official ${title} game directly from Playgama.`
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Live Playgama category pagination proxy (/api/playgama/games?category=trending_now&page=1&pageSize=60)
  app.get('/api/playgama/games', async (req: Request, res: Response) => {
    try {
      const category = String(req.query.category || 'trending_now').trim();
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(60, Math.max(1, parseInt(String(req.query.pageSize || '60'), 10) || 60));

      const upstream = new URL('https://playgama.com/api/v1/categories/games');
      upstream.searchParams.set('pagination', JSON.stringify({ page, pageSize }));
      upstream.searchParams.set('platform', 'desktop');
      upstream.searchParams.set('locale', 'en-US');
      upstream.searchParams.set('categoriesIds', JSON.stringify([category]));

      const r = await fetch(upstream, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json'
        }
      });
      if (!r.ok) {
        res.status(r.status).json({ games: [] });
        return;
      }
      const data = (await r.json()) as { categories?: Array<{ games?: Array<Record<string, unknown>> }> };
      const rawGames = data?.categories?.[0]?.games || [];
      const games = rawGames
        .map((g) => normalizePlaygamaGame(g, category))
        .filter((g): g is NonNullable<typeof g> => Boolean(g));
      res.json({ games, page, category });
    } catch {
      res.status(502).json({ games: [] });
    }
  });

  // Live Playgama search proxy (/api/playgama/search?q=...)
  app.get('/api/playgama/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q || q.toLowerCase().includes('subway')) {
        res.json({ games: [] });
        return;
      }
      const upstream = new URL('https://playgama.com/api/v1/search/g');
      upstream.searchParams.set('q', q);
      upstream.searchParams.set('locale', 'en-US');

      const r = await fetch(upstream, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json'
        }
      });
      if (!r.ok) {
        res.json({ games: [] });
        return;
      }
      const data = (await r.json()) as {
        items?: Array<{ link?: string; title?: string; snippet?: string; pagemap?: { cse_thumbnail?: Array<{ src?: string }>; metatags?: Array<Record<string, string>> } }>;
      };

      const slugs: string[] = [];
      for (const item of data?.items || []) {
        const m = String(item?.link || '').match(/playgama\.com\/game\/([a-z0-9-]+)/i);
        if (m && m[1] && !DELETED_SLUGS.has(m[1]) && !slugs.includes(m[1])) {
          slugs.push(m[1]);
        }
      }

      // Fetch rich Playgama metadata in parallel for discovered slugs
      const details = await Promise.all(
        slugs.slice(0, 12).map(async (slug) => {
          try {
            const infoRes = await fetch(`https://playgama.com/api/v1/games/info/${encodeURIComponent(slug)}?locale=en-US`, {
              headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
            });
            if (!infoRes.ok) return null;
            const infoJson = (await infoRes.json()) as { game?: Record<string, unknown> };
            return infoJson?.game ? normalizePlaygamaGame(infoJson.game) : null;
          } catch {
            return null;
          }
        })
      );

      res.json({ games: details.filter(Boolean) });
    } catch {
      res.json({ games: [] });
    }
  });

  // Local game path mapping for guaranteed school unblocked play
  const LOCAL_GAMES_MAP: Record<string, string> = {
    'spaceflight-simulator': '/games/spaceflightsimulator/index.html',
    'bee-swarm-simulator': '/games/beeswarmsimulator/index.html',
    'retro-bowl': '/games/retrobowl/index.html',
    'slope': '/games/slope/index.html',
    'drive-mad': '/games/drivemad/index.html',
    'moto-x3m': '/games/motox3m/index.html',
    'basket-random': '/games/basketrandom/index.html'
  };

  // Serve bundled self-hosted games
  app.use(
    '/games',
    express.static(path.join(__dirname, 'public', 'games'), {
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
      }
    })
  );

  // School Unblock Game Proxy: Resolves direct game origin, strips ad-block hangs, and serves cleanly on Google Cloud Run
  app.get('/api/proxy/game/:slug', async (req: Request, res: Response) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug || DELETED_SLUGS.has(slug)) {
      res.status(404).send('Game not found or removed.');
      return;
    }

    if (LOCAL_GAMES_MAP[slug]) {
      res.redirect(302, LOCAL_GAMES_MAP[slug]);
      return;
    }

    try {
      // 1. Fetch official game info
      const infoUrl = `https://playgama.com/api/v1/games/info/${encodeURIComponent(slug)}?locale=en-US`;
      const infoRes = await fetch(infoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'application/json' }
      });

      let gameUrl = '';
      if (infoRes.ok) {
        const infoData = (await infoRes.json()) as { game?: { game_url?: string } };
        gameUrl = String(infoData?.game?.game_url || '').trim();
      }

      // If no direct game_url is configured, fallback to direct export page
      const targetUrl = gameUrl || `https://playgama.com/export/game/${encodeURIComponent(slug)}`;
      const gameRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: 'https://playgama.com/'
        }
      });

      if (!gameRes.ok) {
        res.status(gameRes.status).send('Game server is currently unavailable.');
        return;
      }

      let html = await gameRes.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1) || targetUrl;

      // Ensure base tag so assets resolve correctly from upstream CDN
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head><base href="${baseUrl}">`);
      } else if (html.includes('<html')) {
        html = html.replace(/<html[^>]*>/, `$&<head><base href="${baseUrl}"></head>`);
      }

      // Neutralize Playgama redirect bootstrap script that forces ad wrapper
      html = html.replace(/<script[^>]*src="[^"]*bootstrap\.js[^"]*"[^>]*><\/script>/gi, `
        <script>
          window.playgamaBridge = window.playgamaBridge || {
            ready: true,
            version: '1.0.0',
            showStart: function() {},
            showPause: function() {},
            showAd: function(cb) { if (typeof cb === 'function') cb(); },
            showPreroll: function(cb) { if (typeof cb === 'function') cb(); },
            showNext: function() {},
            showBrowse: function() {},
            showReward: function(cb) { if (typeof cb === 'function') cb(true); }
          };
        </script>
      `);

      // Strip heavy external ad scripts that get blocked by school firewalls
      html = html.replace(/<link[^>]*href="[^"]*(securepubads|fundingchoicesmessages|gtm\.playgama)[^"]*"[^>]*>/gi, '');
      html = html.replace(/<script[^>]*src="[^"]*(securepubads|fundingchoicesmessages|gtm\.playgama)[^"]*"[^>]*><\/script>/gi, '');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(html);
    } catch (err) {
      console.error('Proxy error for', slug, err);
      res.redirect(302, `https://playgama.com/export/game/${encodeURIComponent(slug)}`);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jordans V1.1 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
