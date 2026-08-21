import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAddressFlow, getLatestTransactionFlow, type BlockstreamAddressSummary, type BlockstreamTransaction } from "./blockstream";

const trackedAddress = "bc1qtrackedaddress0000000000000000000000";

const summary: BlockstreamAddressSummary = {
  address: trackedAddress,
  chain_stats: {
    tx_count: 3,
    funded_txo_sum: 800_000,
    spent_txo_sum: 125_000,
  },
  mempool_stats: {
    tx_count: 1,
    funded_txo_sum: 20_000,
    spent_txo_sum: 0,
  },
};

const transactions: BlockstreamTransaction[] = [
  {
    txid: "a".repeat(64),
    fee: 1_000,
    vin: [
      { prevout: { scriptpubkey_address: trackedAddress, value: 125_000 } },
      { prevout: { scriptpubkey_address: "bc1qcopayer000000000000000000000000", value: 75_000 } },
    ],
    vout: [
      { scriptpubkey_address: "bc1qrecipient00000000000000000000000", value: 150_000 },
      { scriptpubkey_address: trackedAddress, value: 49_000 },
    ],
    status: { confirmed: true, block_height: 900_000, block_time: 1_700_000_000 },
  },
];

describe("buildAddressFlow", () => {
  it("creates distinct input, transaction, and output nodes from public API data", () => {
    const result = buildAddressFlow(trackedAddress, summary, transactions, 5);

    expect(result.summary.balance).toBe(695_000);
    expect(result.provider).toBe("Blockstream.info");
    expect(result.transactions[0]?.trackedInputValue).toBe(125_000);
    expect(result.transactions[0]?.trackedOutputValue).toBe(49_000);
    expect(result.sankey.nodes.filter(node => node.role === "input")).toHaveLength(2);
    expect(result.sankey.nodes.filter(node => node.role === "transaction")).toHaveLength(1);
    expect(result.sankey.nodes.filter(node => node.role === "output")).toHaveLength(2);
    expect(result.sankey.links).toHaveLength(4);
  });

  it("limits the transaction window without mutating the returned summary", () => {
    const result = buildAddressFlow(trackedAddress, summary, [...transactions, ...transactions], 1);

    expect(result.transactions).toHaveLength(1);
    expect(result.summary.confirmedTxCount).toBe(3);
  });
});

describe("getLatestTransactionFlow", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps public unconfirmed transactions into a no-address latest flow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      txs: [{
        hash: "b".repeat(64), fee: 120, time: 1_700_000_000,
        inputs: [{ prev_out: { addr: "bc1qsource0000000000000000000000000000000", value: 10_000 } }],
        out: [{ addr: "bc1qtarget0000000000000000000000000000000", value: 9_880 }],
      }],
    }), { status: 200 })));

    const result = await getLatestTransactionFlow(5);

    expect(result.address).toBe("latest-mempool");
    expect(result.provider).toBe("Blockchain.info");
    expect(result.summary.mempoolTxCount).toBe(1);
    expect(result.transactions[0]?.fee).toBe(120);
    expect(result.sankey.links).toHaveLength(2);
  });
});
