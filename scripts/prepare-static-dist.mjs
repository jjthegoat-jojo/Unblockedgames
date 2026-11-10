import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './build-sites-embed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const targetArg = process.argv[2] || 'dist';
const outDir = path.resolve(rootDir, targetArg);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.copyFileSync(path.join(rootDir, 'index.html'), path.join(outDir, 'index.html'));
fs.copyFileSync(path.join(rootDir, 'style.css'), path.join(outDir, 'style.css'));
fs.copyFileSync(path.join(rootDir, 'builtinGames.js'), path.join(outDir, 'builtinGames.js'));
fs.copyFileSync(path.join(rootDir, 'catalogFallback.js'), path.join(outDir, 'catalogFallback.js'));
fs.copyFileSync(
  path.join(rootDir, 'firebase-applet-config.json'),
  path.join(outDir, 'firebase-applet-config.json')
);

const rawScriptJs = fs.readFileSync(path.join(rootDir, 'script.js'), 'utf8');
const firebaseConfigRaw = fs.readFileSync(
  path.join(rootDir, 'firebase-applet-config.json'),
  'utf8'
);
const browserReadyScript = rawScriptJs.replace(
  /import\s+firebaseConfig\s+from\s+['"]\.\/firebase-applet-config\.json['"];?/,
  `const firebaseConfig = ${firebaseConfigRaw.trim()};`
);
fs.writeFileSync(path.join(outDir, 'script.js'), browserReadyScript, 'utf8');

const publicDir = path.join(rootDir, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');
console.log(`Prepared static deployment directory at ${outDir}`);
