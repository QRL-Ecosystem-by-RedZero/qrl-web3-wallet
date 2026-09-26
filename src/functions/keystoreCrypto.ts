/**
 * Keystore encrypt / decrypt backed by a WebAssembly Argon2id.
 *
 * `@theqrl/web3-qrl-accounts` derives the keystore key with the pure-JS
 * Argon2id from `@noble/hashes`. With the recommended parameters
 * (m = 256 MiB, t = 8) that takes ~15-20 s per keystore, which made unlocking
 * (and therefore every dApp login / signing prompt on a locked wallet) very
 * slow. `hash-wasm` computes the exact same Argon2id output roughly 10x
 * faster, so these helpers re-implement the keystore format on top of it.
 *
 * The produced / accepted JSON is byte-compatible with `encrypt` / `decrypt`
 * from `@theqrl/web3-qrl-accounts` (version 1, argon2id + aes-256-gcm).
 *
 * Unlike the library, `decryptKeystore` also accepts keystores whose
 * (unauthenticated) `address` label is a legacy 20-byte address. Those were
 * written before QRL moved to 64-byte addresses; the caller relabels them and
 * migrates the stored account data (see `isLegacyAddressLabel`).
 */

import { RECOMMENDED_KEYSTORE_KDF_PARAMS } from "@/scripts/lockManager/keystoreParams";
import type { KeyStore } from "@theqrl/web3";
import { seedToAccount } from "@theqrl/web3-qrl-accounts";
import {
  bytesToHex,
  hexToBytes,
  randomBytes,
  uuidV4,
} from "@theqrl/web3-utils";
import { argon2id } from "hash-wasm";

// Mirrors ARGON2ID_BOUNDS in @theqrl/web3-qrl-accounts (not exported there).
const ARGON2ID_BOUNDS = {
  m: { min: 19456, max: 1_048_576 },
  t: { min: 2, max: 50 },
  p: { min: 1, max: 16 },
  dklen: { min: 16, max: 64 },
} as const;

const SALT_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const AES_KEY_LENGTH_BYTES = 32;
const EXTENDED_SEED_LENGTH_BYTES = 51;

type Argon2idParams = {
  m: number;
  t: number;
  p: number;
  dklen: number;
};

const assertArgon2idParams = (params: Partial<Argon2idParams>) => {
  (Object.keys(ARGON2ID_BOUNDS) as (keyof Argon2idParams)[]).forEach((key) => {
    const value = params[key];
    const { min, max } = ARGON2ID_BOUNDS[key];
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      throw new Error(`Argon2id ${key} out of range [${min}, ${max}]`);
    }
  });
};

const deriveKey = async (
  password: string,
  salt: Uint8Array,
  { m, t, p, dklen }: Argon2idParams,
) =>
  argon2id({
    password: new TextEncoder().encode(password),
    salt,
    memorySize: m,
    iterations: t,
    parallelism: p,
    hashLength: dklen,
    outputType: "binary",
  });

const importAesKey = (derivedKey: Uint8Array) => {
  if (derivedKey.length !== AES_KEY_LENGTH_BYTES) {
    throw new Error(
      `AES: wrong key length, expected ${AES_KEY_LENGTH_BYTES} bytes`,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    derivedKey as BufferSource,
    { name: "AES-GCM", length: AES_KEY_LENGTH_BYTES * 8 },
    false,
    ["encrypt", "decrypt"],
  );
};

const stripHexPrefix = (hex: string) => hex.replace(/^0x/i, "");

// Q + 40 hex chars: the 20-byte address format used before QRL testnet v3.
const LEGACY_ADDRESS_LABEL = /^Q[0-9a-f]{40}$/i;

export const isLegacyAddressLabel = (address?: string) =>
  LEGACY_ADDRESS_LABEL.test(address ?? "");

// Keystores store the address lower-cased after the "Q" prefix.
export const toKeystoreAddressLabel = (address: string) =>
  `Q${address.slice(1).toLowerCase()}`;

/**
 * Decrypts a keystore and returns its address and extended seed (0x hex).
 * Throws when the password is wrong or the keystore is malformed.
 */
export const decryptKeystore = async (
  keystore: KeyStore,
  password: string,
): Promise<{ address: string; seed: string }> => {
  if (keystore?.version !== 1) throw new Error("Unsupported keystore version");
  const { crypto: keystoreCrypto } = keystore;
  if (keystoreCrypto?.kdf !== "argon2id") throw new Error("Unsupported KDF");
  if (keystoreCrypto.cipher !== "aes-256-gcm") {
    throw new Error("Unsupported cipher");
  }
  const { kdfparams } = keystoreCrypto;
  assertArgon2idParams(kdfparams);
  const salt =
    typeof kdfparams.salt === "string"
      ? hexToBytes(kdfparams.salt)
      : kdfparams.salt;
  const iv = hexToBytes(keystoreCrypto.cipherparams.iv);
  if (iv.length !== IV_LENGTH_BYTES) throw new Error("Invalid IV length");

  const derivedKey = await deriveKey(password, salt, kdfparams);
  const seed = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
      await importAesKey(derivedKey),
      hexToBytes(keystoreCrypto.ciphertext) as BufferSource,
    ),
  );
  const { address, seed: seedHex } = seedToAccount(seed);
  // Parity with @theqrl/web3-qrl-accounts / go-qrl: the stored label must
  // match the address derived from the seed. Legacy 20-byte labels are the
  // one exception (they can never match a 64-byte address).
  if (
    !isLegacyAddressLabel(keystore.address) &&
    toKeystoreAddressLabel(keystore.address ?? "") !==
      toKeystoreAddressLabel(address)
  ) {
    throw new Error("Keystore address does not match its seed");
  }
  return { address, seed: seedHex };
};

/**
 * Encrypts a 51-byte extended seed into a version 1 keystore, using the
 * recommended Argon2id parameters unless others are given.
 */
export const encryptKeystore = async (
  seed: string | Uint8Array,
  password: string,
  kdfParams: Argon2idParams = RECOMMENDED_KEYSTORE_KDF_PARAMS,
): Promise<KeyStore> => {
  const seedBytes = typeof seed === "string" ? hexToBytes(seed) : seed;
  if (seedBytes.length !== EXTENDED_SEED_LENGTH_BYTES) {
    throw new Error(
      `Invalid seed length, expected ${EXTENDED_SEED_LENGTH_BYTES} bytes`,
    );
  }
  const kdfparams: Argon2idParams = { ...kdfParams };
  assertArgon2idParams(kdfparams);
  const salt = randomBytes(SALT_LENGTH_BYTES);
  const iv = randomBytes(IV_LENGTH_BYTES);

  const derivedKey = await deriveKey(password, salt, kdfparams);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
      await importAesKey(derivedKey),
      seedBytes as BufferSource,
    ),
  );
  const { address } = seedToAccount(seedBytes);

  return {
    version: 1,
    id: uuidV4(),
    // Same address casing as @theqrl/web3-qrl-accounts' encrypt().
    address: toKeystoreAddressLabel(address),
    crypto: {
      ciphertext: stripHexPrefix(bytesToHex(ciphertext)),
      cipherparams: { iv: stripHexPrefix(bytesToHex(iv)) },
      cipher: "aes-256-gcm",
      kdf: "argon2id",
      kdfparams: { ...kdfparams, salt: stripHexPrefix(bytesToHex(salt)) },
    },
  } as KeyStore;
};
