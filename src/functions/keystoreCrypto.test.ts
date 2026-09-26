import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@theqrl/web3-qrl-accounts";
import { decryptKeystore, encryptKeystore } from "./keystoreCrypto";

// Extended seed (3-byte descriptor + 48-byte seed) used in the web3.js docs.
const SEED =
  "0x010000cea755979937e2dc6137c0e51ba0d1eb2a44920cefffb1a860cf194ea7d23d694045fd2c8a72ec5aecf1e7e5bb591ff2";
const PASSWORD = "correct horse battery staple";
// Cheap parameters keep the pure-JS reference implementation fast in tests.
const FAST_PARAMS = { m: 19456, t: 2, p: 1, dklen: 32 };
// The reference library rejects jsdom's TextEncoder output (cross-realm
// Uint8Array), so hand it the UTF-8 password bytes directly.
const PASSWORD_BYTES = Buffer.from(PASSWORD, "utf8");

describe("keystoreCrypto", () => {
  it("decrypts keystores produced by @theqrl/web3-qrl-accounts", async () => {
    const keystore = await encrypt(SEED, PASSWORD_BYTES, FAST_PARAMS);
    const result = await decryptKeystore(keystore, PASSWORD);
    const reference = await decrypt(keystore, PASSWORD_BYTES);
    expect(result.seed).toBe(SEED);
    expect(result.address).toBe(reference.address);
  });

  it("produces keystores @theqrl/web3-qrl-accounts can decrypt", async () => {
    const keystore = await encryptKeystore(SEED, PASSWORD, FAST_PARAMS);
    const reference = await encrypt(SEED, PASSWORD_BYTES, FAST_PARAMS);
    expect(keystore.address).toBe(reference.address);
    expect(keystore.crypto.kdfparams).toMatchObject(FAST_PARAMS);
    const decrypted = await decrypt(keystore, PASSWORD_BYTES);
    expect(decrypted.seed).toBe(SEED);
  });

  it("uses the recommended parameters by default", async () => {
    const keystore = await encryptKeystore(SEED, PASSWORD);
    expect(keystore.crypto.kdfparams).toMatchObject({ m: 262144, t: 8, p: 1 });
    const { seed } = await decryptKeystore(keystore, PASSWORD);
    expect(seed).toBe(SEED);
  }, 30000);

  it("rejects a wrong password", async () => {
    const keystore = await encryptKeystore(SEED, PASSWORD, FAST_PARAMS);
    await expect(decryptKeystore(keystore, "wrong")).rejects.toThrow();
  });

  it("accepts a legacy 20-byte address label", async () => {
    const keystore = await encryptKeystore(SEED, PASSWORD, FAST_PARAMS);
    keystore.address = "Q20b714091cf2a62dadda2847803e3f1b9d2d3779";
    const { address, seed } = await decryptKeystore(keystore, PASSWORD);
    expect(seed).toBe(SEED);
    expect(address).toMatch(/^Q[0-9a-fA-F]{128}$/);
  });

  it("rejects a keystore whose 64-byte label does not match its seed", async () => {
    const keystore = await encryptKeystore(SEED, PASSWORD, FAST_PARAMS);
    keystore.address = `Q${"ab".repeat(64)}`;
    await expect(decryptKeystore(keystore, PASSWORD)).rejects.toThrow(
      /does not match/,
    );
  });

  it("rejects out-of-range KDF parameters", async () => {
    const keystore = await encryptKeystore(SEED, PASSWORD, FAST_PARAMS);
    keystore.crypto.kdfparams.m = 8;
    await expect(decryptKeystore(keystore, PASSWORD)).rejects.toThrow(
      /out of range/,
    );
  });
});
