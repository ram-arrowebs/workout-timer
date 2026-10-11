// Copies the web app into www/ for Capacitor. The site itself is served straight from the
// repo root by GitHub Pages, so this is only used for the native iOS and Android builds.
// sw.js is left out: the native apps bundle every file and do not register a service worker.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of files) cpSync(join(root, f), join(out, f), { recursive: true });
console.log('Copied ' + files.join(', ') + ' to www/');
