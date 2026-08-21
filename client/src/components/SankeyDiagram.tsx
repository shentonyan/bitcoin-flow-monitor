import type { FlowLink, FlowNode } from "../../../server/blockstream";
import { ArrowRight, Network } from "lucide-react";
import { useMemo, useState } from "react";

type DiagramProps = {
  nodes: FlowNode[];
  links: FlowLink[];
  selectedTransactionId?: string;
  onTransactionSelect: (txid: string) => void;
  onAddressSelect?: (address: string) => void;
};

type NodePosition = FlowNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

const columns = {
  input: { x: 24, width: 154, title: "输入地址" },
  transaction: { x: 373, width: 154, title: "交易" },
  output: { x: 722, width: 154, title: "输出地址" },
} as const;

const roleClass = {
  input: "sankey-input",
  transaction: "sankey-transaction",
  output: "sankey-output",
} as const;

function compact(value: string, start = 7, end = 5) {
  return value.length <= start + end + 1 ? value : `${value.slice(0, start)}…${value.slice(-end)}`;
}

function formatBtc(satoshis: number) {
  return `${(satoshis / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 8 })} BTC`;
}

function linkWidth(value: number) {
  return Math.max(2.2, Math.min(22, 1.5 + Math.log10(Math.max(value, 1)) * 2.1));
}

function midpoint(position: NodePosition) {
  return position.y + position.height / 2;
}

function isAddress(value: string) {
  return /^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,71})$/i.test(value);
}

export default function SankeyDiagram({ nodes, links, selectedTransactionId, onTransactionSelect, onAddressSelect }: DiagramProps) {
  const [hoveredLink, setHoveredLink] = useState<string>();
  const layout = useMemo(() => {
    const byRole = {
      input: nodes.filter(node => node.role === "input"),
      transaction: nodes.filter(node => node.role === "transaction"),
      output: nodes.filter(node => node.role === "output"),
    };
    const tallestColumn = Math.max(byRole.input.length, byRole.transaction.length, byRole.output.length, 1);
    const height = Math.max(420, tallestColumn * 52 + 96);
    const positions = new Map<string, NodePosition>();

    (Object.keys(byRole) as Array<keyof typeof byRole>).forEach(role => {
      const group = byRole[role];
      const maxValue = Math.max(...group.map(node => node.value), 1);
      const rowGap = Math.max(12, Math.min(24, (height - 84 - group.length * 30) / Math.max(group.length - 1, 1)));
      group.forEach((node, index) => {
        const column = columns[role];
        positions.set(node.id, {
          ...node,
          x: column.x,
          y: 60 + index * (30 + rowGap),
          width: column.width,
          height: Math.max(28, Math.min(48, 26 + (Math.sqrt(node.value) / Math.sqrt(maxValue)) * 20)),
        });
      });
    });
    return { positions, height };
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="diagram-empty">
        <Network className="h-6 w-6" />
        <p>该地址暂无可展示的交易流。</p>
        <span>输入有效地址后，系统将从公开链上接口加载最新记录。</span>
      </div>
    );
  }

  const resolveTransactionId = (node: FlowNode) => {
    if (node.role !== "transaction") return undefined;
    const transaction = links.find(link => link.target === node.id || link.source === node.id);
    return transaction?.target === node.id ? node.id.replace("transaction:", "") : transaction?.source.replace("transaction:", "");
  };

  const positionedNodes: NodePosition[] = [];
  layout.positions.forEach(position => positionedNodes.push(position));

  return (
    <div className="sankey-wrap" aria-label="比特币交易资金流桑基图">
      <div className="diagram-column-labels" aria-hidden="true">
        <span>{columns.input.title}</span>
        <span>{columns.transaction.title}</span>
        <span>{columns.output.title}</span>
      </div>
      <svg viewBox={`0 0 900 ${layout.height}`} className="sankey-svg" role="img" aria-label="输入地址到交易再到输出地址的比特币资金流">
        <defs>
          <linearGradient id="flow-inbound" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--flow-blue)" stopOpacity="0.46" />
            <stop offset="100%" stopColor="var(--flow-amber)" stopOpacity="0.68" />
          </linearGradient>
          <linearGradient id="flow-outbound" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--flow-amber)" stopOpacity="0.68" />
            <stop offset="100%" stopColor="var(--flow-green)" stopOpacity="0.46" />
          </linearGradient>
        </defs>

        {links.map(link => {
          const source = layout.positions.get(link.source);
          const target = layout.positions.get(link.target);
          if (!source || !target) return null;
          const startX = source.x + source.width;
          const endX = target.x;
          const centerY = midpoint(source);
          const targetY = midpoint(target);
          const isHovered = hoveredLink === link.id;
          return (
            <path
              key={link.id}
              d={`M ${startX} ${centerY} C ${startX + 86} ${centerY}, ${endX - 86} ${targetY}, ${endX} ${targetY}`}
              fill="none"
              stroke={`url(#flow-${link.direction})`}
              strokeWidth={linkWidth(link.value)}
              strokeLinecap="round"
              className={`sankey-link ${isHovered ? "is-hovered" : ""}`}
              onMouseEnter={() => setHoveredLink(link.id)}
              onMouseLeave={() => setHoveredLink(undefined)}
            >
              <title>{`${formatBtc(link.value)} · ${link.direction === "inbound" ? "输入至交易" : "交易至输出"}`}</title>
            </path>
          );
        })}

        {positionedNodes.map(node => {
          const transactionId = resolveTransactionId(node);
          const address = node.role !== "transaction" && isAddress(node.label) ? node.label : undefined;
          const isSelected = transactionId === selectedTransactionId;
          return (
            <g
              key={node.id}
              className={`sankey-node ${roleClass[node.role]} ${node.isTracked ? "is-tracked" : ""} ${isSelected ? "is-selected" : ""}`}
              onClick={() => transactionId ? onTransactionSelect(transactionId) : address && onAddressSelect?.(address)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  if (transactionId) onTransactionSelect(transactionId);
                  else if (address) onAddressSelect?.(address);
                }
              }}
              role={transactionId || address ? "button" : undefined}
              tabIndex={transactionId || address ? 0 : undefined}
            >
              <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="12" />
              <circle cx={node.x + 15} cy={midpoint(node)} r="4" />
              <text x={node.x + 27} y={midpoint(node) - 2} className="node-label">{node.role === "transaction" ? compact(node.label, 6, 5) : compact(node.label)}</text>
              <text x={node.x + 27} y={midpoint(node) + 12} className="node-value">{formatBtc(node.value)}</text>
              <title>{`${node.role === "input" ? "输入" : node.role === "output" ? "输出" : "交易"}：${node.label}\n${formatBtc(node.value)}${address ? "\n点击查看地址详情" : ""}`}</title>
            </g>
          );
        })}
      </svg>
      {hoveredLink ? (
        <div className="diagram-hint"><ArrowRight className="h-3.5 w-3.5" /> 将光标悬停于色带可查看金额；点击交易节点可展开详情。</div>
      ) : null}
    </div>
  );
}
