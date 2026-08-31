require('dotenv').config();
const crypto = require('crypto');

function getKey() {
  const source = process.env.AI_SECRET_KEY || process.env.SESSION_SECRET || 'zfb-fallback-secret';
  return crypto.createHash('sha256').update(source).digest();
}

/**
 * AI credentials are encrypted with a key derived from AI_SECRET_KEY, falling
 * back to SESSION_SECRET and then to a hardcoded string. That fallback chain is
 * a trap worth naming: SESSION_SECRET is a value operators are told to rotate
 * (Wave 11 rotated it), and rotating it silently makes every stored AI token
 * undecryptable -- which is exactly what happened to Najm's credential.
 *
 * Warn once per process when the dedicated key is absent, so the coupling is
 * visible before the next rotation destroys another credential rather than
 * after.
 */
let warnedAboutKeySource = false;
function warnIfKeyIsDerivedFromSessionSecret() {
  if (warnedAboutKeySource || process.env.AI_SECRET_KEY) return;
  warnedAboutKeySource = true;
  console.warn(
    '[AI crypto] AI_SECRET_KEY is not set, so stored AI provider credentials are ' +
    'encrypted with a key derived from SESSION_SECRET. Rotating SESSION_SECRET ' +
    'will make every stored AI token permanently undecryptable. Set AI_SECRET_KEY ' +
    'to a dedicated value and re-save the provider tokens.'
  );
}

function encryptSecret(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptSecret(value) {
  if (!value) return '';
  warnIfKeyIsDerivedFromSessionSecret();

  const candidateKeys = [
    getKey(),
    crypto.createHash('sha256').update('zfb-fallback-secret').digest()
  ];

  for (const k of candidateKeys) {
    try {
      const payload = Buffer.from(value, 'base64');
      if (payload.length < 28) return String(value);
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (_) {}
  }

  // Every candidate key failed on a token that IS stored. Returning '' here is
  // indistinguishable, to every caller, from "no token configured" -- which is
  // how Najm came to report `Token: Missing` while holding a 220-character
  // credential in the database, and why the real cause stayed invisible.
  // Say so, without ever printing the ciphertext or any derived material.
  console.error(
    '[AI crypto] A stored AI credential exists but could not be decrypted with any ' +
    'known key (' + String(value).length + ' base64 chars). It was almost certainly ' +
    'encrypted under a different AI_SECRET_KEY/SESSION_SECRET than the one now in ' +
    'use. The value is unrecoverable: re-enter the provider token in the admin panel.'
  );
  return '';
}

/**
 * True when a credential is present but no key can decrypt it. Lets callers and
 * diagnostics tell "not configured yet" apart from "configured, but the key
 * changed underneath it" -- decryptSecret() alone cannot express that
 * difference because both cases have to yield an empty string.
 */
function isUndecryptable(value) {
  if (!value) return false;
  const before = warnedAboutKeySource;
  warnedAboutKeySource = true; // don't emit the key-source warning from a probe
  const originalError = console.error;
  console.error = () => {};
  try {
    return decryptSecret(value) === '';
  } finally {
    console.error = originalError;
    warnedAboutKeySource = before;
  }
}

function maskSecret(value, hint) {
  const raw = value || hint || '';
  if (!raw) return '';
  const visible = raw.replace(/[•*]/g, '').slice(-4);
  return `••••••••••••${visible || '••••'}`;
}

function tokenHint(value) {
  if (!value) return '';
  return String(value).slice(-4);
}

module.exports = { encryptSecret, decryptSecret, maskSecret, tokenHint, isUndecryptable };
