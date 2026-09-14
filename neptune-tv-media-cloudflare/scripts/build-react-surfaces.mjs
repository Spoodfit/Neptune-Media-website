import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

function buildWorkspace(name) {
  execFileSync('npm', ['--workspace', name, 'run', 'build'], { cwd: root, stdio: 'inherit' });
}

function copyFile(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Missing React export file: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

// HORS NORME: canonical React/Next surface.
{
  const workspace = path.join(root, 'neptune-tv-media-cloudflare/react/hors-norme');
  const outDir = path.join(workspace, 'out');
  const targetDir = path.join(root, 'neptune-tv-media-cloudflare/public/hors-norme');
  buildWorkspace('neptune-hors-norme-react');
  if (!fs.existsSync(path.join(outDir, 'index.html'))) throw new Error('HORS NORME React export did not produce out/index.html');
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.cpSync(outDir, targetDir, { recursive: true });
  console.log('React surface built: /hors-norme/ <- react/hors-norme/out');
}

// NEPTUNE JT: one React/Next application, exported to the public URLs used by the product.
{
  const workspace = path.join(root, 'neptune-tv-media-cloudflare/react/neptune-jt');
  const outDir = path.join(workspace, 'out');
  const publicDir = path.join(root, 'neptune-tv-media-cloudflare/public');
  buildWorkspace('neptune-jt-react');

  const mappings = [
    ['index.html', 'neptune-jt/index.html'],
    ['reserver/index.html', 'reserver/neptune-jt/index.html'],
    ['confirmation/index.html', 'reserver/neptune-jt/confirmation/index.html'],
    ['studio/index.html', 'studio/neptune-jt/index.html'],
  ];
  for (const [from, to] of mappings) copyFile(path.join(outDir, from), path.join(publicDir, to));

  const assetSource = path.join(outDir, '_next');
  const assetTarget = path.join(publicDir, 'neptune-jt-assets/_next');
  if (!fs.existsSync(assetSource)) throw new Error('Neptune JT React export did not produce _next assets');
  fs.rmSync(path.join(publicDir, 'neptune-jt-assets'), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(assetTarget), { recursive: true });
  fs.cpSync(assetSource, assetTarget, { recursive: true });

  // Retire the legacy imperative UI runtimes from the deploy working tree. CSS remains shared.
  for (const relative of [
    'neptune-jt/status-v184.js',
    'reserver/neptune-jt/assets/app.js',
    'studio/neptune-jt/assets/app.js',
    'studio/neptune-jt/release-guard-v184.js',
  ]) fs.rmSync(path.join(publicDir, relative), { force: true });

  console.log('React surfaces built: /neptune-jt/, /reserver/neptune-jt/, /reserver/neptune-jt/confirmation/, /studio/neptune-jt/');
}
