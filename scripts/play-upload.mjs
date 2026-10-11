// Uploads an App Bundle to a Google Play track and rolls it out to that track's testers.
// Usage: node scripts/play-upload.mjs <file.aab> [internal|alpha|beta|production]
import { readFileSync } from 'node:fs';
import { play, withEdit } from './lib/play.mjs';

const [file, track = 'internal'] = process.argv.slice(2);
if (!file) throw new Error('usage: node scripts/play-upload.mjs <file.aab> [track]');

const result = await withEdit(async (edit) => {
  const bundle = await play('POST', `/edits/${edit}/bundles?uploadType=media`, readFileSync(file), 'application/octet-stream');
  console.log(`Uploaded version code ${bundle.versionCode}`);
  const release = { versionCodes: [String(bundle.versionCode)], status: 'completed' };
  try {
    await play('PUT', `/edits/${edit}/tracks/${track}`, { track, releases: [release] });
  } catch (e) {
    // An app that has never been published only accepts draft releases.
    if (!/draft/i.test(e.message)) throw e;
    await play('PUT', `/edits/${edit}/tracks/${track}`, { track, releases: [{ ...release, status: 'draft' }] });
    console.log('App is still a draft in Play Console: release saved as a draft');
  }
  console.log(`Assigned to the ${track} track`);
});
console.log('Committed edit', result.id);
