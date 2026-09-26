import { describe, expect, it } from "vitest";
import {
  BlockchainDataType,
  QRL_BLOCKCHAINS,
  getBlockExplorerUrl,
  migrateLegacyBlockchain,
  normalizeStoredBlockchains,
} from "./qrlBlockchainConfig";

const [MAINNET, TESTNET] = QRL_BLOCKCHAINS;

// Built-in chains as persisted by wallet versions before testnet v3.
const legacyMainnet: BlockchainDataType = {
  ...MAINNET,
  chainName: "Zond Mainnet",
  nativeCurrency: { name: "Quanta", symbol: "QRL", decimals: 18 },
  iconUrls: ["icons/chains/zond_mainnet.svg"],
  defaultIconUrl: "icons/chains/zond_mainnet.svg",
  blockExplorerUrls: ["https://www.theqrl.org/markets/"],
  defaultBlockExplorerUrl: "https://www.theqrl.org/markets/",
  rpcUrls: ["http://my-node:8545"],
  defaultRpcUrl: "http://my-node:8545",
};
const legacyTestnetV2: BlockchainDataType = {
  ...TESTNET,
  chainId: "0x539",
  chainName: "QRL Zond Testnet v2",
  rpcUrls: ["http://209.250.255.226:8545"],
  defaultRpcUrl: "http://209.250.255.226:8545",
};

describe("qrlBlockchainConfig", () => {
  it("uses QRL naming for the built-in chains", () => {
    QRL_BLOCKCHAINS.forEach((chain) => {
      expect(chain.chainName).not.toMatch(/zond/i);
      expect(chain.nativeCurrency).toEqual({
        name: "QRL",
        symbol: "QRL",
        decimals: 18,
      });
      expect(chain.defaultIconUrl).not.toMatch(/zond/i);
    });
  });

  it("targets the private QRL testnet v3 with ZondScan as explorer", () => {
    expect(TESTNET.chainId).toBe("0x301825");
    expect(TESTNET.isTestnet).toBe(true);
    expect(TESTNET.defaultBlockExplorerUrl).toBe("https://zondscan.com");
  });

  describe("migrateLegacyBlockchain", () => {
    it("renames a built-in chain stored by an older version", () => {
      const migrated = migrateLegacyBlockchain(legacyMainnet);
      expect(migrated.chainName).toBe(MAINNET.chainName);
      expect(migrated.nativeCurrency.name).toBe("QRL");
      expect(migrated.iconUrls).toEqual([MAINNET.defaultIconUrl]);
      expect(migrated.defaultIconUrl).toBe(MAINNET.defaultIconUrl);
      expect(migrated.blockExplorerUrls).toEqual([]);
      expect(migrated.defaultBlockExplorerUrl).toBe("");
      // User-configured values are kept.
      expect(migrated.defaultRpcUrl).toBe("http://my-node:8545");
    });

    it("keeps names the user changed", () => {
      const chain = { ...MAINNET, chainName: "My node" };
      expect(migrateLegacyBlockchain(chain).chainName).toBe("My node");
    });

    it("leaves custom chains untouched", () => {
      const custom = { ...legacyMainnet, chainId: "0x99", isCustomChain: true };
      expect(migrateLegacyBlockchain(custom)).toBe(custom);
    });
  });

  describe("normalizeStoredBlockchains", () => {
    it("drops the retired testnet v2 and adds testnet v3", () => {
      const normalized = normalizeStoredBlockchains([
        legacyMainnet,
        legacyTestnetV2,
      ]);
      expect(normalized.map((chain) => chain.chainId)).toEqual([
        "0x1",
        "0x301825",
      ]);
      expect(normalized[1]).toEqual(TESTNET);
    });

    it("keeps a custom chain that reuses the old testnet id", () => {
      const custom = { ...legacyTestnetV2, isCustomChain: true };
      const normalized = normalizeStoredBlockchains([custom]);
      expect(normalized).toContain(custom);
    });
  });

  describe("getBlockExplorerUrl", () => {
    it("builds ZondScan links", () => {
      expect(getBlockExplorerUrl(TESTNET, { tx: "0xabc" })).toBe(
        "https://zondscan.com/tx/0xabc",
      );
      expect(getBlockExplorerUrl(TESTNET, { address: "Qabc" })).toBe(
        "https://zondscan.com/address/Qabc",
      );
    });

    it("returns an empty string when the chain has no explorer", () => {
      expect(getBlockExplorerUrl(MAINNET, { tx: "0xabc" })).toBe("");
    });
  });
});
