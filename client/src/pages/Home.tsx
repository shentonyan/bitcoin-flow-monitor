import SankeyDiagram from "@/components/SankeyDiagram";
import { trpc } from "@/lib/trpc";
import type { FlowTransaction } from "../../../server/blockstream";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Loader2,
  Moon,
  RefreshCcw,
  Search,
  Sun,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const REFRESH_OPTIONS = [15, 30, 60, 120] as const;
const ADDRESS_PATTERN = /^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,71})$/i;

function compact(value: string, start = 10, end = 8) {
  return value.length <= start + end + 1 ? value : `${value.slice(0, start)}…${value.slice(-end)}`;
}

function formatBtc(satoshis: number) {
  return `${(satoshis / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 8 })} BTC`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDate(timestamp?: number | null) {
  if (!timestamp) return "等待确认";
  return new Date(timestamp * 1000).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
  toast.success("TXID 已复制到剪贴板");
}

function transactionExplorerUrl(provider: "Blockstream.info" | "Blockchain.info", txid: string) {
  return provider === "Blockstream.info"
    ? `https://blockstream.info/tx/${txid}`
    : `https://www.blockchain.com/explorer/transactions/btc/${txid}`;
}

export default function Home() {
  const [addressInput, setAddressInput] = useState("");
  const [activeAddress, setActiveAddress] = useState("");
  const [refreshSeconds, setRefreshSeconds] = useState<number>(30);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [localError, setLocalError] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>();

  const flowQuery = trpc.bitcoin.addressFlow.useQuery(
    { address: activeAddress, limit: 5 },
    {
      enabled: Boolean(activeAddress),
      retry: false,
      refetchInterval: autoRefresh ? refreshSeconds * 1_000 : false,
      refetchIntervalInBackground: false,
    },
  );

  const data = flowQuery.data;
  const selectedTransaction = useMemo(
    () => data?.transactions.find(transaction => transaction.txid === selectedTransactionId) || data?.transactions[0],
    [data?.transactions, selectedTransactionId],
  );

  useEffect(() => {
    if (data?.transactions.length && !data.transactions.some(transaction => transaction.txid === selectedTransactionId)) {
      setSelectedTransactionId(data.transactions[0]?.txid);
    }
  }, [data?.transactions, selectedTransactionId]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = addressInput.trim();
    if (!ADDRESS_PATTERN.test(candidate)) {
      setLocalError("请输入有效的 BTC 主网地址（以 1、3 或 bc1 开头）。");
      return;
    }
    setLocalError("");
    setSelectedTransactionId(undefined);
    setActiveAddress(candidate);
  };

  return (
    <div className={`flow-shell ${theme === "dark" ? "dark" : ""}`}>
      <header className="top-nav sticky top-0 z-20">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="brand-mark"><CircleDollarSign className="h-[19px] w-[19px]" /></span>
            <div>
              <p className="text-[0.94rem] font-bold tracking-[-0.035em]">Bitcoin Flow Monitor</p>
              <p className="text-[0.63rem] font-medium tracking-[0.08em] muted">ON-CHAIN VISUALIZER</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {flowQuery.isFetching && activeAddress ? <span className="hidden items-center gap-1.5 text-xs muted sm:flex"><Loader2 className="h-3.5 w-3.5 animate-spin" />同步中</span> : null}
            <button className="icon-button" onClick={() => setTheme(current => current === "light" ? "dark" : "light")} aria-label={theme === "light" ? "切换深色主题" : "切换浅色主题"}>
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-9 sm:px-6 lg:px-8">
        <section className="mb-7 max-w-3xl">
          <p className="eyebrow">Bitcoin Mainnet · Public data</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.055em] sm:text-[2.65rem]">看见比特币资金在链上的路径。</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 muted sm:text-[0.94rem]">查询一个 BTC 地址，将其关联交易的输入、交易和输出以清晰的资金流图展开。数据来自无需密钥的公开链上接口。</p>
        </section>

        <section className="glass-card mb-6 p-4 sm:p-5">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">比特币地址</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 muted" />
              <input className="address-input" value={addressInput} onChange={event => setAddressInput(event.target.value)} placeholder="粘贴 BTC 主网地址，例如 bc1… 或 1…" autoComplete="off" spellCheck="false" />
            </label>
            <button type="submit" className="primary-button shrink-0" disabled={flowQuery.isFetching && !data}>
              {flowQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              查询链上流向
            </button>
          </form>
          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--flow-border)" }}>
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => setAutoRefresh(current => !current)} className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors ${autoRefresh ? "border-[color:var(--flow-green)] text-[color:var(--flow-green)]" : "muted"}`} style={!autoRefresh ? { borderColor: "var(--flow-border)" } : undefined} aria-pressed={autoRefresh}>
                <span className={`status-dot ${autoRefresh ? "confirmed" : "mempool"}`} />{autoRefresh ? "自动刷新已开启" : "自动刷新已关闭"}
              </button>
              <label className="flex items-center gap-2 text-xs muted">
                间隔
                <select className="select-control" value={refreshSeconds} onChange={event => setRefreshSeconds(Number(event.target.value))} disabled={!autoRefresh} aria-label="自动刷新间隔">
                  {REFRESH_OPTIONS.map(seconds => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--flow-blue)] disabled:opacity-50" onClick={() => void flowQuery.refetch()} disabled={!activeAddress || flowQuery.isFetching}>
              <RefreshCcw className={`h-3.5 w-3.5 ${flowQuery.isFetching ? "animate-spin" : ""}`} />立即刷新
            </button>
          </div>
          {localError ? <p className="mt-3 text-xs text-[color:var(--flow-red)]">{localError}</p> : null}
          {flowQuery.isError ? <p className="mt-3 text-xs text-[color:var(--flow-red)]">{flowQuery.error.message}</p> : null}
        </section>

        {!activeAddress && !flowQuery.isLoading ? (
          <section className="glass-card flex min-h-[410px] flex-col items-center justify-center px-6 text-center">
            <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[color:color-mix(in_srgb,var(--flow-blue)_12%,transparent)] text-[color:var(--flow-blue)]"><Activity className="h-7 w-7" /></span>
            <h2 className="text-xl font-bold tracking-[-0.04em]">从一个地址开始追踪</h2>
            <p className="mt-2 max-w-md text-sm leading-6 muted">我们不会预加载示例交易或保存输入内容。请输入你要查看的比特币主网地址，实时生成可交互资金流视图。</p>
          </section>
        ) : null}

        {flowQuery.isLoading && !data ? <LoadingState /> : null}

        {data ? (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric title="链上余额" value={formatBtc(data.summary.balance)} tone="blue" label="已确认 + 内存池" icon={<CircleDollarSign className="h-3.5 w-3.5" />} />
              <Metric title="已确认交易" value={formatNumber(data.summary.confirmedTxCount)} tone="green" label={`${data.provider} 地址统计`} icon={<Check className="h-3.5 w-3.5" />} />
              <Metric title="内存池交易" value={formatNumber(data.summary.mempoolTxCount)} tone="amber" label="等待确认的相关交易" icon={<Activity className="h-3.5 w-3.5" />} />
              <Metric title="当前图窗口" value={`${data.transactions.length} 笔`} tone="blue" label={`最近同步 ${new Date(data.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`} icon={<RefreshCcw className="h-3.5 w-3.5" />} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.68fr)_minmax(310px,0.72fr)]">
              <div className="min-w-0 space-y-6">
                <div className="glass-card overflow-hidden">
                  <div className="flex flex-col gap-3 px-5 pb-1 pt-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="section-title">交易资金流</h2>
                      <p className="panel-subtitle">{compact(data.address, 13, 10)} 的最近关联交易结构。蓝、琥珀、绿分别代表输入、交易和输出。</p>
                    </div>
                    <a href={data.provider === "Blockstream.info" ? `https://blockstream.info/address/${data.address}` : `https://www.blockchain.com/explorer/addresses/btc/${data.address}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[color:var(--flow-blue)]">来源：{data.provider} <ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>
                  <SankeyDiagram nodes={data.sankey.nodes} links={data.sankey.links} selectedTransactionId={selectedTransaction?.txid} onTransactionSelect={setSelectedTransactionId} />
                </div>

                <div className="glass-card p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between"><div><h2 className="section-title">最新关联交易</h2><p className="panel-subtitle">点击任一交易，在详情面板中查看它的输入和输出。</p></div><span className="text-xs muted">最新优先</span></div>
                  <div className="grid gap-1.5">
                    {data.transactions.map(transaction => {
                      const isSelected = selectedTransaction?.txid === transaction.txid;
                      const direction = transaction.trackedInputValue > 0 && transaction.trackedOutputValue > 0 ? "混合" : transaction.trackedInputValue > 0 ? "支出" : "收入";
                      return (
                        <button key={transaction.txid} onClick={() => setSelectedTransactionId(transaction.txid)} className={`transaction-row ${isSelected ? "is-selected" : ""}`}>
                          <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><span className={`status-dot ${transaction.status.confirmed ? "confirmed" : "mempool"}`} /><div className="min-w-0"><p className="truncate font-mono text-xs font-semibold">{compact(transaction.txid, 14, 10)}</p><p className="mt-1 text-[0.7rem] muted">{transaction.status.confirmed ? `区块 #${formatNumber(transaction.status.block_height || 0)} · ${formatDate(transaction.status.block_time)}` : "内存池 · 等待确认"}</p></div></div><div className="shrink-0 text-right"><p className="text-xs font-semibold">{formatBtc(transaction.outputTotal)}</p><p className="mt-1 text-[0.7rem] muted">{direction} · {transaction.status.confirmed ? "已确认" : "未确认"}</p></div></div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="glass-card h-fit p-5 xl:sticky xl:top-24">
                <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Transaction detail</p><h2 className="mt-1 section-title">交易详情</h2></div>{selectedTransaction ? <a href={transactionExplorerUrl(data.provider, selectedTransaction.txid)} target="_blank" rel="noreferrer" className="icon-button" aria-label={`在 ${data.provider} 查看此交易`}><ExternalLink className="h-4 w-4" /></a> : null}</div>
                {selectedTransaction ? <TransactionDetail transaction={selectedTransaction} provider={data.provider} /> : <p className="mt-8 text-sm muted">此地址暂无可展示的交易详情。</p>}
              </aside>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Metric({ title, value, label, tone, icon }: { title: string; value: string; label: string; tone: "blue" | "green" | "amber"; icon: React.ReactNode }) {
  return <div className="glass-card metric-card"><div className={`metric-badge ${tone}`}>{icon}{title}</div><p className="metric-value">{value}</p><p className="mt-1.5 text-[0.7rem] muted">{label}</p></div>;
}

function LoadingState() {
  return <section className="space-y-6"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="glass-card metric-card"><div className="skeleton h-4 w-24" /><div className="skeleton mt-5 h-8 w-36" /><div className="skeleton mt-3 h-3 w-28" /></div>)}</div><div className="glass-card p-5"><div className="skeleton h-5 w-44" /><div className="skeleton mt-4 h-[340px] w-full" /></div></section>;
}

function TransactionDetail({ transaction, provider }: { transaction: FlowTransaction; provider: "Blockstream.info" | "Blockchain.info" }) {
  return <div className="mt-5"><div className="rounded-2xl p-3.5" style={{ background: "color-mix(in srgb, var(--flow-surface-strong) 60%, transparent)" }}><div className="flex items-center justify-between gap-3"><span className={`flex items-center gap-2 text-xs font-semibold ${transaction.status.confirmed ? "text-[color:var(--flow-green)]" : "text-[color:var(--flow-amber)]"}`}><span className={`status-dot ${transaction.status.confirmed ? "confirmed" : "mempool"}`} />{transaction.status.confirmed ? "已确认" : "内存池中"}</span><button className="flex items-center gap-1 text-xs muted hover:text-[color:var(--flow-text)]" onClick={() => copyText(transaction.txid)}><Copy className="h-3.5 w-3.5" />复制</button></div><p className="mt-3 break-all font-mono text-xs font-semibold tracking-tight">{transaction.txid}</p></div>
    <div className="detail-list mt-5"><Detail label="区块高度" value={transaction.status.confirmed ? `#${formatNumber(transaction.status.block_height || 0)}` : "等待确认"} /><Detail label="时间" value={formatDate(transaction.status.block_time)} /><Detail label="手续费" value={formatBtc(transaction.fee)} /><Detail label="输入总额" value={formatBtc(transaction.inputTotal)} /><Detail label="输出总额" value={formatBtc(transaction.outputTotal)} /></div>
    <div className="detail-divider my-5" />
    <EndpointGroup title="输入地址" icon={<ArrowDownToLine className="h-3.5 w-3.5 text-[color:var(--flow-blue)]" />} endpoints={transaction.inputs} />
    <div className="mt-4"><EndpointGroup title="输出地址" icon={<ArrowUpRight className="h-3.5 w-3.5 text-[color:var(--flow-green)]" />} endpoints={transaction.outputs} /></div>
    <p className="disclaimer">图表反映公开 UTXO 结构，而非身份或支付意图。多输入、找零和协作交易可能导致地址关系无法直接归属。 <a className="font-semibold text-[color:var(--flow-blue)]" href={transactionExplorerUrl(provider, transaction.txid)} target="_blank" rel="noreferrer">在 {provider} 查看</a></p>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><strong title={value}>{value}</strong></div>; }

function EndpointGroup({ title, icon, endpoints }: { title: string; icon: React.ReactNode; endpoints: Array<{ label: string; value: number; isTracked: boolean }> }) {
  return <div><div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">{icon}{title}</div><div className="endpoint-list">{endpoints.map(endpoint => <div className="endpoint-item" key={endpoint.label}><span title={endpoint.label} className={endpoint.isTracked ? "text-[color:var(--flow-blue)]" : ""}>{compact(endpoint.label, 11, 7)}</span><strong>{formatBtc(endpoint.value)}</strong></div>)}</div></div>;
}
