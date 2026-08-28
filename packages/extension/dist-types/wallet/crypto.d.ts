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
export declare const KEYSTORE_VERSION = 1;
/** idea.md §3.1.1: PBKDF2-SHA256 at >= 600k iterations. */
export declare const PBKDF2_ITERATIONS = 600000;
/** idea.md §3.1.1: 6-digit PIN. Longer is allowed, and materially better. */
export declare const MIN_PIN_LENGTH = 6;
export declare const MAX_PIN_LENGTH = 32;
/** The only KDF this version knows. Stored so a future one can be added. */
export type KdfName = 'PBKDF2-SHA256';
/**
 * What gets persisted. Every parameter needed to derive the key again is stored
 * alongside the ciphertext — nothing is implied by the code version, so raising
 * the iteration count later does not strand existing wallets.
 */
export interface EncryptedSecret {
    v: number;
    kdf: KdfName;
    iterations: number;
    /** base64, 16 bytes, per-install random. */
    salt: string;
    /** base64, 12 bytes, fresh for every encryption. */
    iv: string;
    /** base64: AES-256-GCM ciphertext with its 16-byte authentication tag appended. */
    ct: string;
}
/**
 * Decryption failed. Deliberately does *not* distinguish a wrong PIN from
 * tampered ciphertext, because AES-GCM cannot: both surface as one
 * authentication failure. Reporting them separately would mean guessing.
 */
export declare class PinError extends Error {
    readonly name = "PinError";
    constructor(message?: string);
}
/** The PIN is not a shape we accept — caught before any crypto runs. */
export declare class InvalidPinError extends Error {
    readonly name = "InvalidPinError";
}
/** The stored record is missing fields, or uses parameters this version cannot read. */
export declare class KeystoreFormatError extends Error {
    readonly name = "KeystoreFormatError";
}
/**
 * Validates PIN shape. Throws rather than returning a boolean, so a caller
 * cannot forget to check the result on the path that reaches the key.
 */
export declare function assertValidPin(pin: string): void;
export declare function isValidPin(pin: unknown): pin is string;
/**
 * Encrypts a secret (the 12-word mnemonic) under a PIN.
 *
 * A fresh salt *and* a fresh IV are generated on every call. Re-encrypting the
 * same mnemonic under the same PIN therefore produces different bytes — which is
 * required: reusing an IV with the same key breaks AES-GCM catastrophically,
 * leaking the keystream and allowing forgery.
 */
export declare function encryptSecret(plaintext: string, pin: string): Promise<EncryptedSecret>;
/**
 * Decrypts a stored secret. Throws `PinError` on a wrong PIN or on any
 * tampering — the GCM tag catches both, and they are indistinguishable.
 *
 * Derives using the parameters *in the record*, never the current constants, so
 * a wallet created under older parameters still opens.
 */
export declare function decryptSecret(record: EncryptedSecret, pin: string): Promise<string>;
/**
 * Structural check for something read back out of storage. Separate from
 * decryption so a corrupt record produces a diagnosable error rather than
 * masquerading as a wrong PIN.
 */
export declare function isEncryptedSecret(value: unknown): value is EncryptedSecret;
//# sourceMappingURL=crypto.d.ts.map