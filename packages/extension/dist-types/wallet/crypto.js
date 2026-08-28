/**
 * Keystore encryption — the part that must be right.
 *
 * Pure WebCrypto over strings and bytes: no `chrome` APIs, no storage, no viem.
 * That keeps this file testable in plain Node and keeps the threat model small
 * enough to state honestly.
 *
 * ## What this actually protects against
 *
 * A 6-digit PIN is 10^6 possibilities. PBKDF2-SHA256 is also GPU-friendly — it
 * needs almost no memory, so an attacker parallelises it cheaply. At 600k
 * iterations a single modern GPU manages roughly 10^4 guesses per second, which
 * puts an exhaustive sweep of a 6-digit PIN at a couple of *minutes*.
 *
 * So the KDF is not the wall, and pretending otherwise would be a lie. The real
 * defences are, in order:
 *
 * 1. **The ciphertext never leaves the device.** It lives in
 *    `chrome.storage.local`, is unreachable from page scripts, and is never
 *    uploaded. An attacker who cannot read it gets no offline attempt at all.
 * 2. **Online backoff** (see `keystore.ts`) makes guessing through the UI
 *    useless.
 * 3. **The KDF** raises the cost of the narrow case where 1 fails but the
 *    attacker has no code execution — an exfiltrated profile directory, a stolen
 *    backup.
 *
 * Two consequences worth acting on: longer PINs are the cheapest real
 * improvement (each extra digit is 10x), which is why `MAX_PIN_LENGTH` is well
 * above 6; and before this ever touches mainnet the KDF should become a
 * memory-hard one (scrypt or Argon2id), which is why `kdf` and `v` are stored in
 * the record rather than assumed. Migration reads the old parameters, decrypts,
 * and re-encrypts under the new ones.
 *
 * ## Honest limitation
 *
 * JavaScript offers no way to zero a string. The PIN and the decrypted mnemonic
 * exist as strings and stay in memory until the GC gets to them. Every function
 * here is written to hold them for as short a span as possible, but "wiped after
 * use" is not something this language can promise.
 */
/** Bumped when the record layout changes in a way old readers cannot handle. */
export const KEYSTORE_VERSION = 1;
/** idea.md §3.1.1: PBKDF2-SHA256 at >= 600k iterations. */
export const PBKDF2_ITERATIONS = 600_000;
/** idea.md §3.1.1: 6-digit PIN. Longer is allowed, and materially better. */
export const MIN_PIN_LENGTH = 6;
export const MAX_PIN_LENGTH = 32;
const SALT_BYTES = 16;
/** AES-GCM is specified for 96-bit nonces; anything else weakens it. */
const IV_BYTES = 12;
const AES_KEY_BITS = 256;
const DIGITS_ONLY = /^[0-9]+$/;
function toArrayBuffer(bytes) {
    return bytes.slice().buffer;
}
/**
 * Decryption failed. Deliberately does *not* distinguish a wrong PIN from
 * tampered ciphertext, because AES-GCM cannot: both surface as one
 * authentication failure. Reporting them separately would mean guessing.
 */
export class PinError extends Error {
    name = 'PinError';
    constructor(message = 'Incorrect PIN, or the stored wallet data is damaged.') {
        super(message);
    }
}
/** The PIN is not a shape we accept — caught before any crypto runs. */
export class InvalidPinError extends Error {
    name = 'InvalidPinError';
}
/** The stored record is missing fields, or uses parameters this version cannot read. */
export class KeystoreFormatError extends Error {
    name = 'KeystoreFormatError';
}
/**
 * Validates PIN shape. Throws rather than returning a boolean, so a caller
 * cannot forget to check the result on the path that reaches the key.
 */
export function assertValidPin(pin) {
    if (typeof pin !== 'string') {
        throw new InvalidPinError('PIN must be a string.');
    }
    if (!DIGITS_ONLY.test(pin)) {
        throw new InvalidPinError('PIN must contain digits only.');
    }
    if (pin.length < MIN_PIN_LENGTH) {
        throw new InvalidPinError(`PIN must be at least ${MIN_PIN_LENGTH} digits.`);
    }
    if (pin.length > MAX_PIN_LENGTH) {
        throw new InvalidPinError(`PIN must be at most ${MAX_PIN_LENGTH} digits.`);
    }
}
export function isValidPin(pin) {
    try {
        assertValidPin(pin);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Encrypts a secret (the 12-word mnemonic) under a PIN.
 *
 * A fresh salt *and* a fresh IV are generated on every call. Re-encrypting the
 * same mnemonic under the same PIN therefore produces different bytes — which is
 * required: reusing an IV with the same key breaks AES-GCM catastrophically,
 * leaking the keystream and allowing forgery.
 */
export async function encryptSecret(plaintext, pin) {
    assertValidPin(pin);
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new TypeError('Nothing to encrypt.');
    }
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveAesKey(pin, salt, PBKDF2_ITERATIONS);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(utf8ToBytes(plaintext)));
    return {
        v: KEYSTORE_VERSION,
        kdf: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        salt: toBase64(salt),
        iv: toBase64(iv),
        ct: toBase64(new Uint8Array(ct)),
    };
}
/**
 * Decrypts a stored secret. Throws `PinError` on a wrong PIN or on any
 * tampering — the GCM tag catches both, and they are indistinguishable.
 *
 * Derives using the parameters *in the record*, never the current constants, so
 * a wallet created under older parameters still opens.
 */
export async function decryptSecret(record, pin) {
    assertValidPin(pin);
    assertReadableRecord(record);
    const salt = fromBase64(record.salt, 'salt');
    const iv = fromBase64(record.iv, 'iv');
    const ct = fromBase64(record.ct, 'ct');
    if (salt.length !== SALT_BYTES) {
        throw new KeystoreFormatError(`Salt must be ${SALT_BYTES} bytes, got ${salt.length}.`);
    }
    if (iv.length !== IV_BYTES) {
        throw new KeystoreFormatError(`IV must be ${IV_BYTES} bytes, got ${iv.length}.`);
    }
    const key = await deriveAesKey(pin, salt, record.iterations);
    let plaintext;
    try {
        plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ct));
    }
    catch {
        // WebCrypto reports every authentication failure as one opaque
        // OperationError. Swallowing it here is deliberate: the original carries no
        // information we are entitled to act on, and re-throwing it would leak the
        // distinction we just said we cannot make.
        throw new PinError();
    }
    return bytesToUtf8(new Uint8Array(plaintext));
}
/**
 * Structural check for something read back out of storage. Separate from
 * decryption so a corrupt record produces a diagnosable error rather than
 * masquerading as a wrong PIN.
 */
export function isEncryptedSecret(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const r = value;
    return (typeof r.v === 'number' &&
        r.kdf === 'PBKDF2-SHA256' &&
        typeof r.iterations === 'number' &&
        typeof r.salt === 'string' &&
        typeof r.iv === 'string' &&
        typeof r.ct === 'string');
}
function assertReadableRecord(record) {
    if (!isEncryptedSecret(record)) {
        throw new KeystoreFormatError('Stored wallet record is malformed.');
    }
    if (record.v > KEYSTORE_VERSION) {
        throw new KeystoreFormatError(`Wallet was saved by a newer version of Tipee (v${record.v}). Update the extension.`);
    }
    if (!Number.isInteger(record.iterations) || record.iterations < 1) {
        throw new KeystoreFormatError(`Invalid iteration count: ${record.iterations}.`);
    }
    // A record claiming a low iteration count is either corrupt or an attacker's
    // downgrade attempt: rewrite the stored parameters to 1 iteration and the
    // ciphertext becomes brute-forceable in milliseconds. Refusing to honour it
    // costs nothing, since no Tipee version has ever written one.
    if (record.iterations < PBKDF2_ITERATIONS) {
        throw new KeystoreFormatError(`Refusing a weakened key derivation (${record.iterations} iterations, expected at least ${PBKDF2_ITERATIONS}).`);
    }
}
async function deriveAesKey(pin, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', toArrayBuffer(utf8ToBytes(pin)), 'PBKDF2', false, [
        'deriveKey',
    ]);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: AES_KEY_BITS }, 
    // Not extractable: the derived key cannot be read back out as bytes, so it
    // cannot be serialised into storage or logged even by mistake.
    false, ['encrypt', 'decrypt']);
}
function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
}
function utf8ToBytes(value) {
    return new TextEncoder().encode(value);
}
function bytesToUtf8(bytes) {
    return new TextDecoder().decode(bytes);
}
function toBase64(bytes) {
    let binary = '';
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary);
}
function fromBase64(value, field) {
    let binary;
    try {
        binary = atob(value);
    }
    catch {
        throw new KeystoreFormatError(`Field "${field}" is not valid base64.`);
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
//# sourceMappingURL=crypto.js.map