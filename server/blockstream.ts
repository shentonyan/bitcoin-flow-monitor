export const BLOCKSTREAM_API_BASE = "https://blockstream.info/api";
export const BLOCKCHAIN_INFO_API_BASE = "https://blockchain.info";

const SATOSHIS_PER_BITCOIN = 100_000_000;
const MAX_ENDPOINTS_PER_TRANSACTION = 6;

export type BlockstreamStatus = {
  confirmed: boolean;
  block_height?: number | null;
  block_time?: number | null;
};

export type BlockstreamPrevout = {
  scriptpubkey_address?: string;
  scriptpubkey_type?: string;
  value: number;
};

export type BlockstreamVin = {
  is_coinbase?: boolean;
  prevout?: BlockstreamPrevout | null;
};

export type BlockstreamVout = {
  scriptpubkey_address?: string;
  scriptpubkey_type?: string;
  value: number;
};

export type BlockstreamTransaction = {
  txid: string;
  fee: number;
  vin: BlockstreamVin[];
  vout: BlockstreamVout[];
  status: BlockstreamStatus;
};

export type BlockstreamAddressSummary = {
  address: string;
  chain_stats: {
    tx_count: number;
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
  mempool_stats: {
    tx_count: number;
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
};

export type FlowNode = {
  id: string;
  label: string;
  role: "input" | "transaction" | "output";
  value: number;
  isTracked: boolean;
};

export type FlowLink = {
  id: string;
  source: string;
  target: string;
  value: number;
  direction: "inbound" | "outbound";
};

export type FlowEndpoint = {
  label: string;
  value: number;
  isTracked: boolean;
};

export type FlowTransaction = {
  txid: string;
  fee: number;
  status: BlockstreamStatus;
  inputs: FlowEndpoint[];
  outputs: FlowEndpoint[];
  inputTotal: number;
  outputTotal: number;
  trackedInputValue: number;
  trackedOutputValue: number;
};

export type AddressFlowResponse = {
  address: string;
  provider: "Blockstream.info" | "Blockchain.info";
  summary: {
    confirmedTxCount: number;
    mempoolTxCount: number;
    totalReceived: number;
    totalSpent: number;
    balance: number;
  };
  transactions: FlowTransaction[];
  sankey: {
    nodes: FlowNode[];
    links: FlowLink[];
  };
  fetchedAt: string;
};

function shortId(value: string, start = 9, end = 6) {
  return value.length <= start + end + 1 ? value : `${value.slice(0, start)}…${value.slice(-end)}`;
}

function unknownEndpoint(role: "input" | "output", index: number, type?: string) {
  const descriptor = type?.replaceAll("_", " ") || "未知脚本";
  return `${role === "input" ? "输入" : "输出"} ${index + 1} · ${descriptor}`;
}

function aggregateEndpoints(
  endpoints: Array<{ label: string; value: number; isTracked: boolean }>,
  role: "input" | "output",
) {
  const byLabel = new Map<string, FlowEndpoint>();

  endpoints.forEach(endpoint => {
    const existing = byLabel.get(endpoint.label);
    if (existing) {
      existing.value += endpoint.value;
      existing.isTracked ||= endpoint.isTracked;
    } else {
      byLabel.set(endpoint.label, { ...endpoint });
    }
  });

  const ordered = Array.from(byLabel.values()).sort((a, b) => b.value - a.value);
  if (ordered.length <= MAX_ENDPOINTS_PER_TRANSACTION) return ordered;

  const visible = ordered.slice(0, MAX_ENDPOINTS_PER_TRANSACTION);
  const remainder = ordered.slice(MAX_ENDPOINTS_PER_TRANSACTION);
  visible.push({
    label: `其他${role === "input" ? "输入" : "输出"}（${remainder.length} 项）`,
    value: remainder.reduce((total, endpoint) => total + endpoint.value, 0),
    isTracked: false,
  });
  return visible;
}

function nodeId(role: FlowNode["role"], label: string) {
  return `${role}:${label}`;
}

export function buildAddressFlow(
  address: string,
  summary: BlockstreamAddressSummary,
  transactions: BlockstreamTransaction[],
  limit: number,
  provider: AddressFlowResponse["provider"] = "Blockstream.info",
): AddressFlowResponse {
  const selectedTransactions = transactions.slice(0, limit).map(transaction => {
    const inputs = aggregateEndpoints(
      transaction.vin.map((input, index) => {
        const prevout = input.prevout;
        const label = prevout?.scriptpubkey_address || unknownEndpoint("input", index, prevout?.scriptpubkey_type);
        return {
          label,
          value: prevout?.value || 0,
          isTracked: label === address,
        };
      }),
      "input",
    );
    const outputs = aggregateEndpoints(
      transaction.vout.map((output, index) => {
        const label = output.scriptpubkey_address || unknownEndpoint("output", index, output.scriptpubkey_type);
        return {
          label,
          value: output.value,
          isTracked: label === address,
        };
      }),
      "output",
    );

    return {
      txid: transaction.txid,
      fee: transaction.fee,
      status: transaction.status,
      inputs,
      outputs,
      inputTotal: inputs.reduce((total, input) => total + input.value, 0),
      outputTotal: outputs.reduce((total, output) => total + output.value, 0),
      trackedInputValue: inputs.filter(input => input.isTracked).reduce((total, input) => total + input.value, 0),
      trackedOutputValue: outputs.filter(output => output.isTracked).reduce((total, output) => total + output.value, 0),
    } satisfies FlowTransaction;
  });

  const nodes = new Map<string, FlowNode>();
  const links: FlowLink[] = [];
  const addNode = (role: FlowNode["role"], label: string, value: number, isTracked: boolean) => {
    const id = nodeId(role, label);
    const existing = nodes.get(id);
    if (existing) {
      existing.value += value;
      existing.isTracked ||= isTracked;
    } else {
      nodes.set(id, { id, label, role, value, isTracked });
    }
    return id;
  };

  selectedTransactions.forEach(transaction => {
    const transactionId = nodeId("transaction", transaction.txid);
    const existingTransaction = nodes.get(transactionId);
    if (existingTransaction) {
      existingTransaction.value += Math.max(transaction.inputTotal, transaction.outputTotal);
    } else {
      nodes.set(transactionId, {
        id: transactionId,
        label: shortId(transaction.txid),
        role: "transaction",
        value: Math.max(transaction.inputTotal, transaction.outputTotal),
        isTracked: false,
      });
    }

    transaction.inputs.forEach(input => {
      const source = addNode("input", input.label, input.value, input.isTracked);
      links.push({
        id: `${source}->${transactionId}`,
        source,
        target: transactionId,
        value: input.value,
        direction: "inbound",
      });
    });

    transaction.outputs.forEach(output => {
      const target = addNode("output", output.label, output.value, output.isTracked);
      links.push({
        id: `${transactionId}->${target}`,
        source: transactionId,
        target,
        value: output.value,
        direction: "outbound",
      });
    });
  });

  const totalReceived = summary.chain_stats.funded_txo_sum + summary.mempool_stats.funded_txo_sum;
  const totalSpent = summary.chain_stats.spent_txo_sum + summary.mempool_stats.spent_txo_sum;

  return {
    address,
    provider,
    summary: {
      confirmedTxCount: summary.chain_stats.tx_count,
      mempoolTxCount: summary.mempool_stats.tx_count,
      totalReceived,
      totalSpent,
      balance: totalReceived - totalSpent,
    },
    transactions: selectedTransactions,
    sankey: { nodes: Array.from(nodes.values()), links },
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchPublicJson<T>(baseUrl: string, path: string, provider: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const reason = response.status === 404 ? "未找到该地址，或地址格式无效。" : `${provider} 暂时不可用（HTTP ${response.status}）。`;
      throw new Error(reason);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${provider} 响应超时。`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type BlockchainInfoEndpoint = {
  addr?: string;
  value: number;
  type?: number;
};

type BlockchainInfoTransaction = {
  hash: string;
  fee: number;
  time: number;
  block_height?: number;
  inputs: Array<{ prev_out?: BlockchainInfoEndpoint }>;
  out: BlockchainInfoEndpoint[];
};

type BlockchainInfoAddressResponse = {
  address: string;
  n_tx: number;
  total_received: number;
  total_sent: number;
  txs: BlockchainInfoTransaction[];
};

function toBlockstreamTransaction(transaction: BlockchainInfoTransaction): BlockstreamTransaction {
  return {
    txid: transaction.hash,
    fee: transaction.fee,
    vin: transaction.inputs.map(input => ({
      prevout: input.prev_out ? {
        scriptpubkey_address: input.prev_out.addr,
        scriptpubkey_type: input.prev_out.type === undefined ? undefined : `script-${input.prev_out.type}`,
        value: input.prev_out.value,
      } : null,
    })),
    vout: transaction.out.map(output => ({
      scriptpubkey_address: output.addr,
      scriptpubkey_type: output.type === undefined ? undefined : `script-${output.type}`,
      value: output.value,
    })),
    status: {
      confirmed: Boolean(transaction.block_height),
      block_height: transaction.block_height ?? null,
      block_time: transaction.block_height ? transaction.time : null,
    },
  };
}

function toBlockstreamSummary(response: BlockchainInfoAddressResponse): BlockstreamAddressSummary {
  const mempoolTxCount = response.txs.filter(transaction => !transaction.block_height).length;
  return {
    address: response.address,
    chain_stats: {
      tx_count: Math.max(response.n_tx - mempoolTxCount, 0),
      funded_txo_sum: response.total_received,
      spent_txo_sum: response.total_sent,
    },
    mempool_stats: {
      tx_count: mempoolTxCount,
      funded_txo_sum: 0,
      spent_txo_sum: 0,
    },
  };
}

async function getBlockstreamAddressFlow(address: string, limit: number) {
  const encodedAddress = encodeURIComponent(address);
  const [summary, transactions] = await Promise.all([
    fetchPublicJson<BlockstreamAddressSummary>(BLOCKSTREAM_API_BASE, `/address/${encodedAddress}`, "Blockstream.info"),
    fetchPublicJson<BlockstreamTransaction[]>(BLOCKSTREAM_API_BASE, `/address/${encodedAddress}/txs`, "Blockstream.info"),
  ]);
  return buildAddressFlow(address, summary, transactions, limit, "Blockstream.info");
}

async function getBlockchainInfoAddressFlow(address: string, limit: number) {
  const encodedAddress = encodeURIComponent(address);
  const response = await fetchPublicJson<BlockchainInfoAddressResponse>(
    BLOCKCHAIN_INFO_API_BASE,
    `/rawaddr/${encodedAddress}?limit=${limit}`,
    "Blockchain.info",
  );
  return buildAddressFlow(address, toBlockstreamSummary(response), response.txs.map(toBlockstreamTransaction), limit, "Blockchain.info");
}

export async function getAddressFlow(address: string, limit: number) {
  try {
    return await getBlockstreamAddressFlow(address, limit);
  } catch (blockstreamError) {
    try {
      return await getBlockchainInfoAddressFlow(address, limit);
    } catch (blockchainInfoError) {
      const blockstreamMessage = blockstreamError instanceof Error ? blockstreamError.message : "Blockstream.info 请求失败。";
      const blockchainInfoMessage = blockchainInfoError instanceof Error ? blockchainInfoError.message : "Blockchain.info 请求失败。";
      throw new Error(`无法读取该地址的链上数据。${blockstreamMessage} ${blockchainInfoMessage}`);
    }
  }
}

export function satoshisToBtc(satoshis: number) {
  return satoshis / SATOSHIS_PER_BITCOIN;
}
