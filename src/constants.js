export const ENGINE_VERSION = "batch-executor/1.0.0";
export const NETWORK = {
  name: "Pharos Pacific Mainnet",
  chainId: 1672,
  nativeSymbol: "PROS",
  rpcUrl: "https://rpc.pharos.xyz",
  explorer: "https://www.pharosscan.xyz",
};
export const BATCH_CONTRACT = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const MAX_ACTIONS = 12;
export const MAX_CALLDATA_BYTES = 16_384;
export const SIMULATION_TTL_MS = 10 * 60 * 1000;
export const MULTICALL_ABI = [
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)",
  "function getChainId() view returns (uint256)",
  "function getBlockNumber() view returns (uint256)",
  "function getEthBalance(address addr) view returns (uint256)",
];
