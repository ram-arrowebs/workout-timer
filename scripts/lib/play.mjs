// Minimal Google Play Android Publisher API client using the service account key.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

export const PACKAGE = 'com.arrowebs.workoutcounter';
const SA_PATH = process.env.PLAY_SERVICE_ACCOUNT ||
  `${homedir()}/.config/play/android-development-511108-d615497e8111.json`;
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;

let accessToken;
async function auth() {
  if (accessToken) return accessToken;
  const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: sa.token_uri, iat: now, exp: now + 3600
  });
  const sig = createSign('RSA-SHA256').update(data).sign(sa.private_key).toString('base64url');
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${data}.${sig}`
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('Play auth failed: ' + JSON.stringify(json));
  return (accessToken = json.access_token);
}

// body: object (sent as JSON) or Buffer (sent as `contentType` to the upload endpoint).
export async function play(method, path, body, contentType) {
  const raw = Buffer.isBuffer(body);
  const res = await fetch((raw ? UPLOAD : BASE) + path, {
    method,
    headers: {
      Authorization: `Bearer ${await auth()}`,
      ...(body === undefined ? {} : { 'content-type': raw ? contentType : 'application/json' })
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

// Runs fn(editId) inside a Play edit and commits it; the edit is discarded if fn throws.
export async function withEdit(fn) {
  const { id } = await play('POST', '/edits');
  try {
    await fn(id);
  } catch (e) {
    await play('DELETE', `/edits/${id}`).catch(() => {});
    throw e;
  }
  try {
    return await play('POST', `/edits/${id}:commit`);
  } catch (e) {
    // Apps with managed publishing or in review need this flag to commit draft changes.
    if (!/changesNotSentForReview/.test(e.message)) throw e;
    return play('POST', `/edits/${id}:commit?changesNotSentForReview=true`);
  }
}
