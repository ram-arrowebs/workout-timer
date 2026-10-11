// Pushes store/metadata.json and store/screenshots/ios-* to the App Store version that is
// being prepared for submission. Existing screenshots of the same sizes are replaced.
// Usage: node scripts/store-ios.mjs
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc } from './lib/asc.mjs';

const BUNDLE_ID = 'com.arrowebs.workoutcounter';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const meta = JSON.parse(readFileSync(join(root, 'store', 'metadata.json'), 'utf8'));
const a = meta.appStore;
// Screenshot folder -> App Store display type (6.9"/6.7" iPhone, 13" iPad).
const SETS = { 'ios-iphone': 'APP_IPHONE_67', 'ios-ipad': 'APP_IPAD_PRO_3GEN_129' };

const app = (await asc('GET', `/v1/apps?filter[bundleId]=${BUNDLE_ID}`)).data[0];
const version = (await asc('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION,DEVELOPER_REJECTED,REJECTED,METADATA_REJECTED`)).data[0];
if (!version) throw new Error('No editable App Store version found');
console.log(`App ${app.attributes.name}, version ${version.attributes.versionString}`);

// App-level: content rights, subtitle and privacy policy (on the editable app info).
await asc('PATCH', `/v1/apps/${app.id}`, {
  data: { type: 'apps', id: app.id, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } }
});
const infos = (await asc('GET', `/v1/apps/${app.id}/appInfos`)).data;
const info = infos.find((i) => i.attributes.state !== 'READY_FOR_DISTRIBUTION') || infos[0];
const infoLoc = (await asc('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?filter[locale]=${meta.locale}`)).data[0];
await asc('PATCH', `/v1/appInfoLocalizations/${infoLoc.id}`, {
  data: { type: 'appInfoLocalizations', id: infoLoc.id, attributes: { subtitle: a.subtitle, privacyPolicyUrl: meta.urls.privacyPolicy } }
});
console.log('Updated subtitle, privacy policy URL, content rights');

// Version-level: copyright, description, keywords, URLs.
await asc('PATCH', `/v1/appStoreVersions/${version.id}`, {
  data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: a.copyright } }
});
const loc = (await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?filter[locale]=${meta.locale}`)).data[0];
await asc('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
  data: {
    type: 'appStoreVersionLocalizations', id: loc.id,
    attributes: {
      description: a.description.join('\n'), keywords: a.keywords, promotionalText: a.promotionalText,
      supportUrl: meta.urls.support, marketingUrl: meta.urls.marketing
    }
  }
});
console.log('Updated description, keywords, promotional text, URLs');

// App Review contact and notes. The contact is personal, so it lives outside the repo as
// {"firstName", "lastName", "email", "phone"} in ~/.appstoreconnect/review-contact.json.
const contactFile = process.env.REVIEW_CONTACT || join(homedir(), '.appstoreconnect', 'review-contact.json');
if (!existsSync(contactFile)) throw new Error(`Missing App Review contact file: ${contactFile}`);
const c = JSON.parse(readFileSync(contactFile, 'utf8'));
const review = {
  contactFirstName: c.firstName, contactLastName: c.lastName, contactEmail: c.email, contactPhone: c.phone,
  demoAccountRequired: false, notes: a.reviewNotes
};
const existing = (await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)).data;
if (existing) {
  await asc('PATCH', `/v1/appStoreReviewDetails/${existing.id}`, { data: { type: 'appStoreReviewDetails', id: existing.id, attributes: review } });
} else {
  await asc('POST', '/v1/appStoreReviewDetails', {
    data: { type: 'appStoreReviewDetails', attributes: review, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } }
  });
}
console.log('Updated App Review details');

// Screenshots: replace each display type's set with the files in its folder, in name order.
const sets = (await asc('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
for (const [folder, displayType] of Object.entries(SETS)) {
  let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
  if (set) {
    for (const shot of (await asc('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data) {
      await asc('DELETE', `/v1/appScreenshots/${shot.id}`);
    }
  } else {
    set = (await asc('POST', '/v1/appScreenshotSets', {
      data: {
        type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } }
      }
    })).data;
  }
  const dir = join(root, 'store', 'screenshots', folder);
  for (const name of readdirSync(dir).filter((f) => /\.(png|jpg)$/.test(f)).sort()) {
    const bytes = readFileSync(join(dir, name));
    const shot = (await asc('POST', '/v1/appScreenshots', {
      data: {
        type: 'appScreenshots', attributes: { fileName: name, fileSize: bytes.length },
        relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } }
      }
    })).data;
    for (const op of shot.attributes.uploadOperations) {
      const res = await fetch(op.url, {
        method: op.method,
        headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
        body: bytes.subarray(op.offset, op.offset + op.length)
      });
      if (!res.ok) throw new Error(`Upload of ${name} failed: ${res.status} ${await res.text()}`);
    }
    await asc('PATCH', `/v1/appScreenshots/${shot.id}`, {
      data: {
        type: 'appScreenshots', id: shot.id,
        attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') }
      }
    });
    console.log(`Uploaded ${folder}/${name} (${displayType})`);
  }
}
