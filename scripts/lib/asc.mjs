// Minimal App Store Connect API client using the team API key (ES256 JWT).
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { homedir } from 'node:os';

export const KEY_ID = 'AJ6N98KP5T';
export const ISSUER_ID = '69a6de74-d9e1-47e3-e053-5b8c7c11a4d1';
const KEY_PATH = `${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }) + '.' +
    b64({ iss: ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  const sig = createSign('SHA256').update(data).sign({ key: readFileSync(KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' });
  return data + '.' + sig.toString('base64url');
}

export async function asc(method, path, body) {
  const res = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}
