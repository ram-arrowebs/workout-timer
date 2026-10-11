// Pushes store/metadata.json, the Play graphics and store/screenshots/android-* to the
// Google Play listing. The listing title is kept; images of each type are replaced.
// Usage: node scripts/store-play.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { play, withEdit } from './lib/play.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = join(root, 'store');
const meta = JSON.parse(readFileSync(join(store, 'metadata.json'), 'utf8'));
const lang = meta.locale;

const images = (folder) => readdirSync(join(store, folder)).filter((f) => /\.(png|jpg)$/.test(f)).sort()
  .map((f) => join(store, folder, f));
const IMAGES = {
  icon: [join(store, 'play', 'icon-512.png')],
  featureGraphic: [join(store, 'play', 'feature-graphic.jpg')],
  phoneScreenshots: images('screenshots/android-phone'),
  sevenInchScreenshots: images('screenshots/android-tablet'),
  tenInchScreenshots: images('screenshots/android-tablet')
};

const result = await withEdit(async (edit) => {
  const current = await play('GET', `/edits/${edit}/listings/${lang}`);
  await play('PUT', `/edits/${edit}/listings/${lang}`, {
    language: lang,
    title: current.title,
    shortDescription: meta.play.shortDescription,
    fullDescription: meta.play.description.join('\n')
  });
  console.log(`Updated listing text (title kept: ${current.title})`);

  for (const [type, files] of Object.entries(IMAGES)) {
    await play('DELETE', `/edits/${edit}/listings/${lang}/${type}`);
    for (const file of files) {
      await play('POST', `/edits/${edit}/listings/${lang}/${type}?uploadType=media`, readFileSync(file), file.endsWith('.png') ? 'image/png' : 'image/jpeg');
      console.log(`Uploaded ${type}: ${file.slice(root.length + 1)}`);
    }
  }
});
console.log('Committed edit', result.id);
