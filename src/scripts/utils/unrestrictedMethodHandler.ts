import StorageUtil from "@/utilities/storageUtil";
import Web3, { FMT_BYTES, FMT_NUMBER } from "@theqrl/web3";
import { Web3RequestManager } from "@theqrl/web3-core";
import { qrlRpcMethods } from "@theqrl/web3-rpc-methods";
import { BaseProvider } from "@theqrl/qrl-wallet-provider/providers";
import { JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import axios from "axios";
import { UNRESTRICTED_METHODS } from "../constants/requestConstants";
import { getSerializableObject } from "./scriptUtils";

// Runs in the service worker. These calls used to be made from the content
// script, where Chrome applies the page's CORS policy to every fetch, so an RPC
// endpoint with a broken CORS header failed on every site. The service worker
// holds the <all_urls> host permission and is not subject to page CORS.

// Reuse one Web3 instance per RPC URL instead of building a new one for every
// forwarded dApp call.
let cachedWeb3: { rpcUrl: string; web3: Web3 } | undefined;

const getQrlProperties = async () => {
  const { defaultRpcUrl, defaultWsRpcUrl } =
    await StorageUtil.getActiveBlockChain();
  if (cachedWeb3?.rpcUrl !== defaultRpcUrl) {
    const qrlHttpProvider = new Web3.providers.HttpProvider(defaultRpcUrl);
    cachedWeb3 = {
      rpcUrl: defaultRpcUrl,
      web3: new Web3({ provider: qrlHttpProvider }),
    };
  }
  const { provider, qrl } = cachedWeb3.web3;
  return { provider, qrl, defaultWsRpcUrl };
};

export const handleUnrestrictedMethod = async (
  request: JsonRpcRequest<JsonRpcRequest>,
) => {
  const { provider, qrl, defaultWsRpcUrl } = await getQrlProperties();
  const method = request.method;
  if (method === UNRESTRICTED_METHODS.QRL_GET_BLOCK_BY_NUMBER) {
    // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
    const [block, hydrated] = request?.params ?? [];
    const blockInformation = await qrl.getBlock(block, hydrated);
    return getSerializableObject(blockInformation);
  } else if (
    method ===
      UNRESTRICTED_METHODS.QRL_GET_BLOCK_TRANSACTION_COUNT_BY_HASH ||
    method ===
      UNRESTRICTED_METHODS.QRL_GET_BLOCK_TRANSACTION_COUNT_BY_NUMBER
  ) {
    // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime
    const [blockHashOrNumber] = request.params;
    const transactionCount =
      await qrl.getBlockTransactionCount(blockHashOrNumber);
    return "0x".concat(transactionCount.toString(16));
  } else if (
    method === UNRESTRICTED_METHODS.QRL_WEB3_WALLET_GET_PROVIDER_STATE
  ) {
    const [chainId, networkId] = await Promise.all([
      qrl?.getChainId(),
      qrl?.net.getId(),
    ]);
    return {
      // getChainId() yields a bigint; the provider expects 0x-hex.
      chainId: chainId === undefined ? "" : `0x${chainId.toString(16)}`,
      networkVersion: networkId?.toString() ?? "",
      isUnlocked: false,
      accounts: [],
    } as Parameters<BaseProvider["_initializeState"]>[0];
  } else if (method === UNRESTRICTED_METHODS.QRL_SYNCING) {
    const isSyncing = await qrl.isSyncing();
    return isSyncing;
  } else if (method === UNRESTRICTED_METHODS.QRL_UNINSTALL_FILTER) {
    const [filterIdentifier] = request?.params ?? [];
    const isSuccess = await qrlRpcMethods.uninstallFilter(
      new Web3RequestManager(provider),
      filterIdentifier,
    );
    return isSuccess;
  } else if (method === UNRESTRICTED_METHODS.QRL_UNSUBSCRIBE) {
    const params = request?.params;
    const response = await axios.post(
      `${defaultWsRpcUrl}/qrl_unsubscribe`,
      { params },
    );
    const unsubscribed = response?.data?.unsubscribed as boolean;
    return unsubscribed;
  } else if (method === UNRESTRICTED_METHODS.NET_VERSION) {
    const networkId = await qrl.net.getId();
    return "0x".concat(networkId.toString(16));
  } else if (method === UNRESTRICTED_METHODS.QRL_ACCOUNTS) {
    const connectedAccountsData =
      await StorageUtil.getDAppsConnectedAccountsData(
        new URL(request?.senderData?.url ?? "").origin,
      );
    return connectedAccountsData?.accounts ?? [];
  } else if (method === UNRESTRICTED_METHODS.WALLET_GET_PERMISSIONS) {
    const dAppsConnectedAccountsData =
      await StorageUtil.getDAppsConnectedAccountsData(
        new URL(request?.senderData?.url ?? "").origin,
      );
    return getSerializableObject(
      dAppsConnectedAccountsData?.permissions ?? [],
    );
  } else if (method === UNRESTRICTED_METHODS.WALLET_REVOKE_PERMISSIONS) {
    await StorageUtil.clearDAppsConnectedAccountsData(
      new URL(request?.senderData?.url ?? "").origin,
    );
    return null;
  } else if (method === UNRESTRICTED_METHODS.WEB_3_CLIENT_VERSION) {
    const currentVersion = await qrl?.getNodeInfo();
    return currentVersion;
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_BALANCE) {
    const [accountAddress, accountBlockNumber] = request.params;
    const balance = await qrl?.getBalance(
      accountAddress,
      accountBlockNumber,
    );
    return "0x".concat(balance.toString(16));
  } else if (method === UNRESTRICTED_METHODS.QRL_ESTIMATE_GAS) {
    const [estimateGasParam] = request.params;
    const estimatedGas = await qrl.estimateGas(estimateGasParam);
    return "0x".concat(estimatedGas.toString(16));
  } else if (method === UNRESTRICTED_METHODS.QRL_FEE_HISTORY) {
    const [blockCount, newestBlock, rewardPercentiles] =
      request.params;
    const feeHistory = await qrl.getFeeHistory(
      blockCount,
      newestBlock,
      rewardPercentiles,
    );
    return getSerializableObject(feeHistory);
  } else if (method === UNRESTRICTED_METHODS.QRL_BLOCK_NUMBER) {
    const qrlBlockNumber = await qrl.getBlockNumber();
    return "0x".concat(qrlBlockNumber.toString(16));
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_TRANSACTION_RECEIPT) {
    const [txHashForTransactionReceipt] = request.params;
    const transactionReceipt = await qrl.getTransactionReceipt(
      txHashForTransactionReceipt,
    );
    return getSerializableObject(transactionReceipt);
  } else if (method === UNRESTRICTED_METHODS.QRL_NEW_BLOCK_FILTER) {
    const filterIdentifier = await qrlRpcMethods.newBlockFilter(
      new Web3RequestManager(provider),
    );
    return filterIdentifier;
  } else if (method === UNRESTRICTED_METHODS.QRL_NEW_FILTER) {
    const [filter] = request?.params ?? [];
    const filterIdentifier = await qrlRpcMethods.newFilter(
      new Web3RequestManager(provider),
      filter,
    );
    return filterIdentifier;
  } else if (
    method === UNRESTRICTED_METHODS.QRL_NEW_PENDING_TRANSACTION_FILTER
  ) {
    const filterIdentifier =
      await qrlRpcMethods.newPendingTransactionFilter(
        new Web3RequestManager(provider),
      );
    return filterIdentifier;
  } else if (method === UNRESTRICTED_METHODS.QRL_SEND_RAW_TRANSACTION) {
    const [rawTransaction] = request?.params ?? [];
    const transactionHash = (
      await qrl.sendSignedTransaction(rawTransaction)
    )?.transactionHash;
    return transactionHash;
  } else if (method === UNRESTRICTED_METHODS.QRL_SUBSCRIBE) {
    const params = request.params;
    const response = await axios.post(`${defaultWsRpcUrl}/qrl_subscribe`, {
      params,
    });
    const subscriptionId = response?.data?.subscriptionId as string;
    return subscriptionId;
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_TRANSACTION_BY_HASH) {
    const [txHashForTransactionByHash] = request.params;
    const transactionDetails = await qrl.getTransaction(
      txHashForTransactionByHash,
    );
    return getSerializableObject(transactionDetails);
  } else if (method === UNRESTRICTED_METHODS.QRL_CALL) {
    const [transactionObj, blockParam] = request.params;
    const qrlCallResponse = await qrl.call(transactionObj, blockParam);
    return qrlCallResponse;
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_CODE) {
    const [address, blockNumber] = request.params;
    const byteCode = await qrl.getCode(address, blockNumber);
    return byteCode;
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_FILTER_CHANGES) {
    const [filterIdentifier] = request.params;
    const logObjects = await qrlRpcMethods.getFilterChanges(
      new Web3RequestManager(provider),
      filterIdentifier,
    );
    return getSerializableObject(logObjects);
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_FILTER_LOGS) {
    const [filterIdentifier] = request.params;
    const logObjects = await qrlRpcMethods.getFilterLogs(
      new Web3RequestManager(provider),
      filterIdentifier,
    );
    return getSerializableObject(logObjects);
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_LOGS) {
    const [filter] = request.params;
    const logs = await qrl.getPastLogs(filter);
    return getSerializableObject(logs);
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_PROOF) {
    const [address, storageKeys, blockNumber] = request.params;
    const proof = await qrl.getProof(address, storageKeys, blockNumber);
    return getSerializableObject(proof);
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_STORAGE_AT) {
    const [address, storageSlot, blockNumber] = request.params;
    const storageAt = await qrl.getStorageAt(
      address,
      storageSlot,
      blockNumber,
    );
    return storageAt;
  } else if (
    method ===
      UNRESTRICTED_METHODS.QRL_GET_TRANSACTION_BY_BLOCK_HASH_AND_INDEX ||
    method ===
      UNRESTRICTED_METHODS.QRL_GET_TRANSACTION_BY_BLOCK_NUMBER_AND_INDEX
  ) {
    const [blockHashOrNumber, transactionIndex] = request?.params ?? [];
    const transactionInformation = await qrl?.getTransactionFromBlock(
      blockHashOrNumber,
      transactionIndex,
    );
    return getSerializableObject(transactionInformation);
  } else if (method === UNRESTRICTED_METHODS.QRL_CHAIN_ID) {
    const chainId = await qrl.getChainId({
      number: FMT_NUMBER.HEX,
      bytes: FMT_BYTES.HEX,
    });
    return chainId;
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_TRANSACTION_COUNT) {
    const [address, block] = request.params;
    const transactionCount = await qrl.getTransactionCount(address, block);
    return "0x".concat(transactionCount.toString(16));
  } else if (method === UNRESTRICTED_METHODS.QRL_GAS_PRICE) {
    const gasPrice = await qrl.getGasPrice();
    return "0x".concat(gasPrice.toString(16));
  } else if (method === UNRESTRICTED_METHODS.QRL_GET_BLOCK_BY_HASH) {
    const [blockHash, hydrated] = request.params;
    const blockInformation = await qrl.getBlock(blockHash, hydrated);
    return getSerializableObject(blockInformation);
  } else {
    return "";
  }
};
