const QRL_MAINNET_DATA = {
  chainId: "0x1",
  chainName: "QRL Mainnet",
  rpcUrls: ["http://127.0.0.1:8545"],
  // QRL 2.0 mainnet has no public explorer yet.
  blockExplorerUrls: [] as string[],
  nativeCurrency: {
    name: "QRL",
    symbol: "QRL",
    decimals: 18,
  },
  iconUrls: ["icons/chains/qrl_mainnet.svg"],
};

// Private QRL testnet v3 (64-byte addresses). The RPC endpoint is the
// community-run proxy also used by ZondScan (https://zondscan.com).
const QRL_TESTNET_DATA = {
  chainId: "0x301825",
  chainName: "QRL Testnet v3 (Private)",
  rpcUrls: ["https://qrlwallet.com/api/qrl-rpc/testnet"],
  blockExplorerUrls: ["https://zondscan.com"],
  nativeCurrency: {
    name: "QRL",
    symbol: "QRL",
    decimals: 18,
  },
  iconUrls: ["icons/chains/qrl_testnet.svg"],
};

export type BlockchainBaseDataType = typeof QRL_MAINNET_DATA;

export type BlockchainAdditionalDataType = {
  defaultRpcUrl: string;
  defaultBlockExplorerUrl: string;
  defaultIconUrl: string;
  isTestnet: boolean;
  defaultWsRpcUrl: string;
  isCustomChain: boolean;
  qrnsRegistryAddress?: string;
};

export type BlockchainDataType = BlockchainBaseDataType &
  BlockchainAdditionalDataType;

export const QRL_BLOCKCHAINS: BlockchainDataType[] = [
  {
    ...QRL_MAINNET_DATA,
    defaultRpcUrl: QRL_MAINNET_DATA.rpcUrls[0],
    defaultBlockExplorerUrl: QRL_MAINNET_DATA.blockExplorerUrls[0] ?? "",
    defaultIconUrl: QRL_MAINNET_DATA.iconUrls[0],
    isTestnet: false,
    defaultWsRpcUrl: "http://localhost:3000",
    isCustomChain: false,
  },
  {
    ...QRL_TESTNET_DATA,
    defaultRpcUrl: QRL_TESTNET_DATA.rpcUrls[0],
    defaultBlockExplorerUrl: QRL_TESTNET_DATA.blockExplorerUrls[0],
    defaultIconUrl: QRL_TESTNET_DATA.iconUrls[0],
    isTestnet: true,
    defaultWsRpcUrl: "http://localhost:3000",
    isCustomChain: false,
  },
];

export const DEFAULT_BLOCKCHAIN = QRL_BLOCKCHAINS[1]; // Testnet

// Built-in chains shipped by older wallet versions that no longer exist
// (QRL testnet v2, 20-byte addresses). They are dropped from stored lists.
const RETIRED_BUILT_IN_CHAIN_IDS = ["0x539"];

// Names / assets used by the built-in chains before the "Zond" branding was
// retired. The native currency is QRL (denominated in quanta / shor / planck).
const LEGACY_CHAIN_NAMES = ["Zond Mainnet"];
const LEGACY_CURRENCY_NAMES = ["Quanta", "Zond"];
const LEGACY_ICON_URL = /^icons\/chains\/zond_(mainnet|testnet)\.svg$/;
const LEGACY_MAINNET_EXPLORER_URL = "https://www.theqrl.org/markets/";

const findBuiltInChain = (chainId?: string) =>
  QRL_BLOCKCHAINS.find(
    (defaultChain) =>
      defaultChain.chainId.toLowerCase() === chainId?.toLowerCase(),
  );

/**
 * Updates a built-in chain persisted by an older wallet version to the
 * current QRL naming, leaving any user-edited values untouched.
 */
export const migrateLegacyBlockchain = (
  chain: BlockchainDataType,
): BlockchainDataType => {
  if (chain.isCustomChain) return chain;
  const builtIn = findBuiltInChain(chain.chainId);
  if (!builtIn) return chain;
  const migrateIcon = (url: string) =>
    LEGACY_ICON_URL.test(url) ? builtIn.defaultIconUrl : url;
  const blockExplorerUrls = chain.blockExplorerUrls?.filter(
    (url) => url !== LEGACY_MAINNET_EXPLORER_URL,
  );
  return {
    ...chain,
    chainName: LEGACY_CHAIN_NAMES.includes(chain.chainName)
      ? builtIn.chainName
      : chain.chainName,
    nativeCurrency: chain.nativeCurrency && {
      ...chain.nativeCurrency,
      name: LEGACY_CURRENCY_NAMES.includes(chain.nativeCurrency.name)
        ? builtIn.nativeCurrency.name
        : chain.nativeCurrency.name,
    },
    iconUrls: chain.iconUrls?.map(migrateIcon),
    defaultIconUrl: chain.defaultIconUrl && migrateIcon(chain.defaultIconUrl),
    blockExplorerUrls,
    defaultBlockExplorerUrl:
      chain.defaultBlockExplorerUrl === LEGACY_MAINNET_EXPLORER_URL
        ? (blockExplorerUrls?.[0] ?? "")
        : chain.defaultBlockExplorerUrl,
  };
};

/**
 * Normalises a chain list persisted by any wallet version: retired built-in
 * chains are removed, legacy naming is updated and built-in chains added in
 * newer versions (e.g. testnet v3) are appended.
 */
export const normalizeStoredBlockchains = (
  blockchains: BlockchainDataType[],
): BlockchainDataType[] => {
  const kept = blockchains
    .filter(
      (chain) =>
        chain.isCustomChain ||
        !RETIRED_BUILT_IN_CHAIN_IDS.includes(chain.chainId?.toLowerCase()),
    )
    .map(migrateLegacyBlockchain);
  const missingBuiltIns = QRL_BLOCKCHAINS.filter(
    (builtIn) =>
      !kept.some(
        (chain) => chain.chainId?.toLowerCase() === builtIn.chainId.toLowerCase(),
      ),
  );
  return [...kept, ...missingBuiltIns];
};

/** Block-explorer page for a transaction or address, if the chain has one. */
export const getBlockExplorerUrl = (
  chain: Pick<BlockchainDataType, "defaultBlockExplorerUrl"> | undefined,
  path: { tx: string } | { address: string },
) => {
  const baseUrl = chain?.defaultBlockExplorerUrl?.replace(/\/+$/, "");
  if (!baseUrl) return "";
  return "tx" in path
    ? `${baseUrl}/tx/${path.tx}`
    : `${baseUrl}/address/${path.address}`;
};
