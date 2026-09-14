import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const workspace = path.join(root, 'neptune-tv-media-cloudflare/react/hors-norme');
const outDir = path.join(workspace, 'out');
const targetDir = path.join(root, 'neptune-tv-media-cloudflare/public/hors-norme');
const publicDir = path.join(root, 'neptune-tv-media-cloudflare/public');
const assetBundle = path.join(workspace, 'source-assets.tar.gz');

const requiredAssets = [
  'assets/logo_neptune_blanc.png',
  'assets/logo_neptune_le_N.png',
  'assets/media/showcase/hors-norme-hero.mp4',
  'assets/posters/hors-norme-episode.webp',
  'assets/posters/connexio-concept.webp',
  ...Array.from({ length: 16 }, (_, index) => `assets/media/showcase/short-${String(index + 1).padStart(2, '0')}.mp4`),
  ...Array.from({ length: 16 }, (_, index) => `assets/posters/showcase/short-${String(index + 1).padStart(2, '0')}.webp`),
];

if (!fs.existsSync(assetBundle)) throw new Error('HORS NORME Cursor media bundle is missing: react/hors-norme/source-assets.tar.gz');

// The React source is canonical. Its media bundle is unpacked into the shared public asset root
// before the static export so /assets/... resolves exactly as it did in the supplied Cursor project.
fs.rmSync(path.join(publicDir, 'assets/media/showcase'), { recursive: true, force: true });
fs.rmSync(path.join(publicDir, 'assets/posters/showcase'), { recursive: true, force: true });
execFileSync('tar', ['-xzf', assetBundle, '-C', publicDir], { cwd: root, stdio: 'inherit' });

for (const relative of requiredAssets) {
  if (!fs.existsSync(path.join(publicDir, relative))) throw new Error(`HORS NORME Cursor asset missing after extraction: ${relative}`);
}

execFileSync('npm', ['--workspace', 'neptune-hors-norme-react', 'run', 'build'], { cwd: root, stdio: 'inherit' });
if (!fs.existsSync(path.join(outDir, 'index.html'))) throw new Error('HORS NORME React export did not produce out/index.html');

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(outDir, targetDir, { recursive: true });
console.log('React surface built: /hors-norme/ <- react/hors-norme/out (Cursor media bundle restored)');
