"use client";

import { Check, LogOut, Wallet } from "lucide-react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useDisconnect } from "wagmi";

const walletNames = ["OKX Wallet", "MetaMask", "Coinbase Wallet"];

function compactAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletPanel() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="rounded-lg border border-line bg-panel/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Connected wallet</p>
            <p className="truncate pt-1 text-sm font-semibold text-white">{compactAddress(address)}</p>
          </div>
          <button
            type="button"
            onClick={() => disconnect()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
            aria-label="Disconnect"
            title="Disconnect"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const namedConnectors = walletNames
    .map((name) => connectors.find((connector) => connector.name === name))
    .filter((connector): connector is Connector => Boolean(connector));

  return (
    <div className="grid gap-2">
      {namedConnectors.map((connector) => (
        <button
          key={connector.uid}
          type="button"
          onClick={() => connect({ connector })}
          className="flex h-12 items-center justify-between rounded-lg border border-line bg-panel px-4 text-sm font-semibold text-white transition hover:border-mint/60 hover:bg-white/8"
        >
          <span className="inline-flex items-center gap-2">
            <Wallet className="h-4 w-4 text-mint" />
            {connector.name}
          </span>
          {isPending && variables?.connector?.name === connector.name ? (
            <span className="text-xs text-white/50">Opening</span>
          ) : (
            <Check className="h-4 w-4 text-white/35" />
          )}
        </button>
      ))}
    </div>
  );
}
