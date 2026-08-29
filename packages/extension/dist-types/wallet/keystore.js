import { wordlist } from '@scure/bip39/wordlists/english';
import { generateMnemonic, mnemonicToAccount } from 'viem/accounts';
import { decryptSecret, encryptSecret, isEncryptedSecret, KeystoreFormatError } from './crypto';
const STORAGE_KEY = 'tipee.wallet.v1';
export async function hasWallet() {
    const record = await getStoredWallet();
    return record !== null;
}
export async function getWalletAddress() {
    const record = await getStoredWallet();
    return record ? record.address : null;
}
export async function createWalletRecord(pin) {
    if (typeof pin !== 'string' || pin.length < 6) {
        throw new Error('PIN must be at least 6 digits.');
    }
    const mnemonic = generateMnemonic(wordlist);
    const account = mnemonicToAccount(mnemonic);
    const encrypted = await encryptSecret(mnemonic, pin);
    const record = {
        mnemonic,
        address: account.address,
        encrypted: JSON.stringify(encrypted),
    };
    await storeWallet({ address: record.address, encrypted: record.encrypted });
    return record;
}
export async function unlockWallet(pin) {
    const record = await getStoredWallet();
    if (!record) {
        throw new Error('No wallet is set up for this browser.');
    }
    const encrypted = JSON.parse(record.encrypted);
    if (!isEncryptedSecret(encrypted)) {
        throw new KeystoreFormatError('Stored wallet record is malformed.');
    }
    return decryptSecret(encrypted, pin);
}
async function getStoredWallet() {
    const storage = chrome.storage.local;
    const result = await storage.get(STORAGE_KEY);
    const wallet = result[STORAGE_KEY];
    if (!wallet || typeof wallet !== 'object') {
        return null;
    }
    const maybe = wallet;
    if (typeof maybe.address !== 'string' || typeof maybe.encrypted !== 'string') {
        return null;
    }
    return {
        address: maybe.address,
        encrypted: maybe.encrypted,
    };
}
async function storeWallet(record) {
    const storage = chrome.storage.local;
    await storage.set({ [STORAGE_KEY]: record });
}
//# sourceMappingURL=keystore.js.map