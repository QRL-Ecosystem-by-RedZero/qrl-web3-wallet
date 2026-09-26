/**
 * Web Worker that re-encrypts all keystores with a new password.
 *
 * 1. Decrypts each keystore with the old password (CPU-heavy argon2id).
 * 2. Re-encrypts each seed with the new password.
 * 3. Returns the new keystores and decrypted key metadata.
 *
 * Runs in a dedicated thread so the popup UI stays responsive.
 */

import { getMnemonicFromHexSeed } from "@/functions/getMnemonicFromHexSeed";
import { decryptKeystore, encryptKeystore } from "@/functions/keystoreCrypto";
import type { KeyStore } from "@theqrl/web3";

export type ChangePasswordWorkerRequest = {
  keystores: KeyStore[];
  oldPassword: string;
  newPassword: string;
};

export type DecryptedKey = {
  address: string;
  mnemonicPhrases: string;
};

export type ChangePasswordWorkerResponse =
  | { success: true; newKeystores: KeyStore[]; newKeys: DecryptedKey[] }
  | { success: false };

self.onmessage = async (
  event: MessageEvent<ChangePasswordWorkerRequest>,
) => {
  const { keystores, oldPassword, newPassword } = event.data;
  // Normalise both passwords to NFC so the same visual password yields the
  // same bytes regardless of the platform / IME the user typed it on.
  const normalisedOld = oldPassword.normalize("NFC");
  const normalisedNew = newPassword.normalize("NFC");
  try {
    const newKeystores: KeyStore[] = [];
    const newKeys: DecryptedKey[] = [];

    for (const keyStore of keystores) {
      const { address, seed } = await decryptKeystore(keyStore, normalisedOld);
      const reEncrypted = await encryptKeystore(seed, normalisedNew);
      newKeystores.push(reEncrypted);
      newKeys.push({
        address,
        mnemonicPhrases: getMnemonicFromHexSeed(seed),
      });
    }

    self.postMessage({
      success: true,
      newKeystores,
      newKeys,
    } satisfies ChangePasswordWorkerResponse);
  } catch {
    // decrypt() throws when the old password is wrong
    self.postMessage({ success: false } satisfies ChangePasswordWorkerResponse);
  }
};
