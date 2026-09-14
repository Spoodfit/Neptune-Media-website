import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const workspace = path.join(root, 'neptune-tv-media-cloudflare/react/hors-norme');
const outDir = path.join(workspace, 'out');
const targetDir = path.join(root, 'neptune-tv-media-cloudflare/public/hors-norme');

execFileSync('npm', ['--workspace', 'neptune-hors-norme-react', 'run', 'build'], { cwd: root, stdio: 'inherit' });
if (!fs.existsSync(path.join(outDir, 'index.html'))) throw new Error('HORS NORME React export did not produce out/index.html');
fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(outDir, targetDir, { recursive: true });
console.log('React surface built: /hors-norme/ <- react/hors-norme/out');
