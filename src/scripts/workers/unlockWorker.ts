/**
 * Web Worker that performs the CPU-heavy keystore decryption (argon2id, WASM).
 *
 * Running in a dedicated worker thread keeps the popup UI fully responsive
 * while the decryption is in progress AND avoids Chrome's MV3 service-worker
 * lifecycle issues (Chrome can't kill a worker that runs inside the popup).
 */

import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import {
  decryptKeystore,
  encryptKeystore,
  isLegacyAddressLabel,
  toKeystoreAddressLabel,
} from "@/functions/keystoreCrypto";
import { shouldUpgradeKeystoreParams } from "@/scripts/lockManager/keystoreParams";
import type { KeyStore } from "@theqrl/web3";

export type UnlockWorkerRequest = {
  keystores: KeyStore[];
  password: string;
};

export type DecryptedKey = {
  address: string;
  mnemonicPhrases: string;
};

export type UnlockWorkerResponse =
  | {
      success: true;
      keys: DecryptedKey[];
      // Populated when one or more keystores were re-encrypted with stronger
      // KDF parameters. The popup-side persists these in place of the old
      // keystores so the user does not need to take any explicit action.
      upgradedKeystores?: KeyStore[];
      // Legacy 20-byte address -> current 64-byte address, for keystores
      // written before QRL testnet v3. The popup migrates stored account data.
      addressMigrations?: AddressMigration[];
    }
  | { success: false };

export type AddressMigration = { from: string; to: string };

self.onmessage = async (event: MessageEvent<UnlockWorkerRequest>) => {
  const { keystores, password } = event.data;
  // Normalise to NFC so the same visual password yields the same bytes
  // regardless of the platform / IME the user typed it on.
  const normalisedPassword = password.normalize("NFC");
  try {
    const keys: DecryptedKey[] = [];
    let upgradedKeystores: KeyStore[] | undefined;
    const addressMigrations: AddressMigration[] = [];
    for (const [index, keyStore] of keystores.entries()) {
      const { address, seed } = await decryptKeystore(
        keyStore,
        normalisedPassword,
      );
      keys.push({
        address,
        mnemonicPhrases: getMnemonicFromHexSeed(seed),
      });
      const hasLegacyAddress = isLegacyAddressLabel(keyStore.address);
      if (hasLegacyAddress) {
        addressMigrations.push({ from: keyStore.address, to: address });
      }
      if (shouldUpgradeKeystoreParams(keyStore)) {
        upgradedKeystores ??= [...keystores];
        upgradedKeystores[index] = await encryptKeystore(
          seed,
          normalisedPassword,
        );
      } else if (hasLegacyAddress) {
        // The address label is not covered by the ciphertext, so relabelling
        // does not need another (expensive) argon2id run.
        upgradedKeystores ??= [...keystores];
        upgradedKeystores[index] = {
          ...keyStore,
          address: toKeystoreAddressLabel(address),
        };
      }
    }
    self.postMessage({
      success: true,
      keys,
      upgradedKeystores,
      addressMigrations: addressMigrations.length
        ? addressMigrations
        : undefined,
    } satisfies UnlockWorkerResponse);
  } catch {
    // decrypt() throws when the password is wrong
    self.postMessage({ success: false } satisfies UnlockWorkerResponse);
  }
};
