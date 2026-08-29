export interface WalletRecord {
    address: `0x${string}`;
    encrypted: string;
}
export interface CreatedWallet extends WalletRecord {
    mnemonic: string;
}
export declare function hasWallet(): Promise<boolean>;
export declare function getWalletAddress(): Promise<string | null>;
export declare function createWalletRecord(pin: string): Promise<CreatedWallet>;
export declare function unlockWallet(pin: string): Promise<string>;
//# sourceMappingURL=keystore.d.ts.map