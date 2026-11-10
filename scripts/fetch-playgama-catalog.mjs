import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const PRIORITY_CATEGORIES = [
  'trending_now',
  'popular',
  'top',
  'new',
  'unblocked',
  'obby',
  'parkour',
  'action',
  'sports',
  'basketball',
  'soccer',
  'american-football',
  'baseball',
  'simulation',
  'tycoon',
  'space',
  'racing',
  'car',
  'driving',
  'drifting',
  'bike',
  'dirt-bike',
  'monster-truck',
  'skill',
  'arcade',
  'two-player',
  '1v1',
  'co-op',
  'multiplayer',
  'io',
  'battle-royale',
  'shooting',
  'first-person-shooter',
  'gun',
  'sniper',
  'strategy',
  'tower-defense',
  'horror',
  'scary',
  'escape',
  'survival',
  'zombie',
  'puzzle',
  'merge',
  'watermelon',
  'blocks',
  'logic',
  'words',
  'clicker',
  'idle',
  'minecraft',
  'crafting',
  'stickman',
  'ragdoll',
  'physics',
  'fighting',
  'adventure',
  'rpg',
  'platform',
  'runner',
  'running',
  'snake',
  'fishing',
  'cooking',
  'restaurant',
  'cards',
  'solitaire',
  'chess',
  'checkers',
  'pool',
  'bowling',
  'golf',
  'mini-golf',
  'tennis',
  'boxing',
  'wrestling',
  'hockey',
  'skateboarding',
  'airplane',
  'flying',
  'boat',
  'truck',
  'parking',
  'police',
  'gta',
  'ninja',
  'superhero',
  'robot',
  'monster',
  'dinosaur',
  'dragon',
  'animals',
  'cats',
  'dog',
  'monkey',
  'funny',
  'cool-games',
  'crazy-games',
  '3d',
  'unity',
  'retro',
  'classic',
  'music',
  'drawing',
  'board',
  'mahjong',
  'match-3',
  'bubble-shooter',
  'ball',
  'quiz',
  'trivia',
  'math',
  'educational',
  'girls',
  'boys',
  'kids',
  'dress-up',
  'fashion',
  'make-up',
  'make-over',
  'princess',
  'princess-dress-up',
  'hair',
  'shopping',
  'decoration',
  'cake',
  'pizza',
  'ice-cream',
  'food',
  'papas',
  'cozy',
  'love',
  'story',
  'anime',
  'point-and-click',
  'hidden-object',
  'unblock-puzzles',
  'sudoku',
  'scrabble',
  'hangman',
  'number',
  'maze',
  'matching',
  'brain',
  'intelligence',
  'difficult',
  'easy',
  'fidget-spinner',
  'pop-it',
  'slime',
  'color',
  'tattoo',
  'doctor',
  'hospital',
  'surgery',
  'firefighter',
  'construction',
  'farm',
  'tractor',
  'train',
  'bus',
  'taxi',
  'car-racing',
  'motorbike',
  'bicycle',
  'cricket',
  'olympics',
  'penalty',
  'world-cup',
  'archery',
  'hunting',
  'pirates',
  'magic',
  'wolf',
  'horse',
  'penguin',
  'christmas',
  'easter',
  'halloween',
  'ghost',
  'war',
  'army',
  'tanks',
  'battleship',
  'pve',
  'pvp',
  'flash',
  'flappy-bird',
  'mini',
  'mobile',
  'keyboard',
  'mouse',
  'typing',
  'video',
  'backgammon',
  'management'
];

const PLAYGAMA_CATEGORY_SLUGS = [...new Set(PRIORITY_CATEGORIES)];
const DELETED_SLUGS = new Set(['subway-surfers']);

export function mapPlaygamaCategory(mainCat, sourceSlug) {
  const c = String(mainCat || sourceSlug || '').toLowerCase();
  const s = String(sourceSlug || '').toLowerCase();

  if (c.includes('obby') || c.includes('parkour') || s === 'obby' || s === 'parkour') {
    return 'Obby & Parkour';
  }
  if (
    ['sports', 'basketball', 'soccer', 'american-football', 'baseball', 'football', 'tennis', 'golf', 'mini-golf', 'bowling', 'boxing', 'wrestling', 'hockey', 'skateboarding', 'pool', 'cricket', 'olympics', 'penalty', 'world-cup'].includes(c) ||
    ['sports', 'basketball', 'soccer', 'american-football', 'baseball'].includes(s)
  ) {
    return 'Sports';
  }
  if (
    ['racing', 'car', 'driving', 'drifting', 'bike', 'dirt-bike', 'motorbike', 'monster-truck', 'truck', 'parking', 'taxi', 'bus', 'car-racing', 'tractor', 'train', 'boat'].includes(c) ||
    ['racing', 'car', 'driving', 'drifting', 'bike', 'dirt-bike', 'monster-truck'].includes(s)
  ) {
    return 'Racing';
  }
  if (
    ['two-player', '1v1', 'co-op'].includes(c) ||
    ['two-player', '1v1', 'co-op'].includes(s)
  ) {
    return '2 Player';
  }
  if (
    ['io', 'multiplayer', 'battle-royale', 'pvp'].includes(c) ||
    ['io', 'multiplayer', 'battle-royale'].includes(s)
  ) {
    return 'Multiplayer & .io';
  }
  if (
    ['horror', 'scary', 'ghost', 'zombie', 'halloween'].includes(c) ||
    ['horror', 'scary'].includes(s)
  ) {
    return 'Horror & Escape';
  }
  if (
    ['strategy', 'tower-defense', 'war', 'tanks', 'army', 'battleship', 'chess', 'checkers'].includes(c) ||
    ['strategy', 'tower-defense'].includes(s)
  ) {
    return 'Strategy & TD';
  }
  if (
    ['clicker', 'idle', 'tycoon', 'management'].includes(c) ||
    ['clicker', 'idle', 'tycoon'].includes(s)
  ) {
    return 'Clicker & Idle';
  }
  if (
    ['simulation', 'space', 'airplane', 'flying', 'construction', 'crafting', 'minecraft', 'farm', 'cooking', 'restaurant', 'fishing', 'doctor', 'hospital', 'surgery', 'dress-up', 'fashion', 'make-up', 'make-over'].includes(c) ||
    ['simulation', 'space', 'minecraft', 'crafting'].includes(s)
  ) {
    return 'Simulation';
  }
  if (
    ['puzzle', 'merge', 'watermelon', 'matching', 'match-3', 'blocks', 'logic', 'brain', 'intelligence', 'words', 'number', 'math', 'maze', 'sudoku', 'solitaire', 'cards', 'mahjong', 'board', 'bubble-shooter', 'bubble', 'unblock-puzzles', 'hidden-object', 'quiz', 'trivia', 'drawing', 'color'].includes(c) ||
    ['puzzle', 'merge', 'watermelon', 'blocks', 'logic', 'words', 'solitaire', 'bubble-shooter'].includes(s)
  ) {
    return 'Puzzle & Merge';
  }
  if (
    ['skill', 'arcade', 'runner', 'running', 'platform', 'physics', 'ragdoll', 'snake', 'ball', 'flappy-bird', 'music', 'classic', 'retro'].includes(c) ||
    ['skill', 'arcade', 'snake'].includes(s)
  ) {
    return 'Skill';
  }
  return 'Action';
}

async function fetchCategoryPage(catSlug, page, pageSize = 60) {
  const u = new URL('https://playgama.com/api/v1/categories/games');
  u.searchParams.set('pagination', JSON.stringify({ page, pageSize }));
  u.searchParams.set('platform', 'desktop');
  u.searchParams.set('locale', 'en-US');
  u.searchParams.set('categoriesIds', JSON.stringify([catSlug]));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json'
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data?.categories?.[0]?.games || [];
    } catch {
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  return [];
}

async function main() {
  const gamesBySlug = new Map();
  const trendingSlugs = [];

  let catCursor = 0;
  const concurrency = 22;

  async function categoryWorker() {
    while (catCursor < PLAYGAMA_CATEGORY_SLUGS.length) {
      const slug = PLAYGAMA_CATEGORY_SLUGS[catCursor++];
      for (let page = 1; page <= 35; page += 1) {
        const list = await fetchCategoryPage(slug, page, 60);
        if (!list.length) break;

        for (const raw of list) {
          const hru = String(raw?.hru || '').trim();
          if (!hru || DELETED_SLUGS.has(hru)) continue;

          if (slug === 'trending_now' && trendingSlugs.length < 48 && !trendingSlugs.includes(hru)) {
            trendingSlugs.push(hru);
          }

          if (gamesBySlug.has(hru)) continue;

          const title = String(raw.title || hru).trim();
          if (title.toLowerCase().includes('subway surfer')) continue;

          const category = mapPlaygamaCategory(raw.main_category, slug);
          const thumbnail = String(raw.preview || raw.big_preview || raw.icon || '').trim();
          const rawDesc = String(raw.collection_description || '').replace(/\s+/g, ' ').trim();
          const description = rawDesc.length > 180 ? `${rawDesc.slice(0, 177)}...` : rawDesc;

          gamesBySlug.set(hru, {
            id: hru,
            title,
            category,
            url: `https://playgama.com/export/game/${hru}`,
            thumbnail,
            controls: 'Desktop & Touch · Playgama',
            description: description || `Play the official ${title} game on Jordans V1.1.`
          });
        }

        if (list.length < 60) break;
      }
    }
  }

  console.log(`Exhaustively transferring all Playgama games across ${PLAYGAMA_CATEGORY_SLUGS.length} categories...`);
  await Promise.all(Array.from({ length: concurrency }, () => categoryWorker()));

  const allGames = Array.from(gamesBySlug.values());
  console.log(`Transferred ${allGames.length} unique real Playgama games!`);

  // Minified JSON keeps full 6,000+ game catalog fast over HTTP
  const gamesJsonPath = path.join(rootDir, 'public', 'games.json');
  fs.writeFileSync(gamesJsonPath, JSON.stringify(allGames), 'utf8');

  // Build balanced 420-game instant 0ms bootstrap catalog across all 12 categories
  const byCategory = new Map();
  for (const g of allGames) {
    if (!byCategory.has(g.category)) byCategory.set(g.category, []);
    byCategory.get(g.category).push(g);
  }

  const bootstrapMap = new Map();
  for (const slug of trendingSlugs) {
    const g = gamesBySlug.get(slug);
    if (g) bootstrapMap.set(g.id, g);
  }
  for (const [, list] of byCategory.entries()) {
    for (const g of list.slice(0, 35)) {
      if (bootstrapMap.size >= 450) break;
      bootstrapMap.set(g.id, g);
    }
  }

  const bootstrapList = Array.from(bootstrapMap.values());
  const fallbackJs = `// Auto-generated real Playgama instant bootstrap catalog (${bootstrapList.length} games; full ${allGames.length}-game catalog in public/games.json + live /api/playgama/*)
export const INLINE_GAMES_CATALOG = ${JSON.stringify(bootstrapList)};
export const TOTAL_PLAYGAMA_CATALOG_COUNT = ${allGames.length};
export const PLAYGAMA_TRENDING_SLUGS = ${JSON.stringify(trendingSlugs.slice(0, 36))};
`;
  fs.writeFileSync(path.join(rootDir, 'catalogFallback.js'), fallbackJs, 'utf8');

  console.log(
    `Wrote public/games.json (${(fs.statSync(gamesJsonPath).size / 1024).toFixed(1)} KB, ${allGames.length} games) & catalogFallback.js (${bootstrapList.length} instant-boot games).`
  );
  console.log(
    'Category breakdown:',
    Array.from(byCategory.entries())
      .map(([k, v]) => `${k}: ${v.length}`)
      .join(' | ')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
