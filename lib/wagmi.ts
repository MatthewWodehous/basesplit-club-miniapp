"use client";

import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, injected } from "wagmi/connectors";
import { Attribution } from "ox/erc8021";
import type { Address, Hex } from "viem";

type WalletProvider = {
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  providers?: WalletProvider[];
};

type WalletWindow = Window & {
  ethereum?: WalletProvider;
  okxwallet?: WalletProvider;
};

export const builderCode = process.env.NEXT_PUBLIC_BUILDER_CODE || "bc_1qw80tpu";
export const dataSuffix = (process.env.NEXT_PUBLIC_DATA_SUFFIX && process.env.NEXT_PUBLIC_DATA_SUFFIX !== "[Encoded String]"
  ? process.env.NEXT_PUBLIC_DATA_SUFFIX
  : Attribution.toDataSuffix({ codes: [builderCode] })) as Hex;
export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || base.id);

export const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  chains: [base],
  dataSuffix,
  connectors: [
    injected({
      target() {
        return {
          id: "okx",
          name: "OKX Wallet",
          provider(walletWindow) {
            const source = walletWindow as WalletWindow | undefined;
            const providers: WalletProvider[] = source?.ethereum?.providers || [];
            return source?.okxwallet || providers.find((provider) => provider.isOkxWallet || provider.isOKExWallet) || source?.ethereum;
          }
        };
      }
    }),
    injected({
      target() {
        return {
          id: "metaMask",
          name: "MetaMask",
          provider(walletWindow) {
            const source = walletWindow as WalletWindow | undefined;
            const providers: WalletProvider[] = source?.ethereum?.providers || [];
            return providers.find((provider) => provider.isMetaMask && !provider.isOkxWallet && !provider.isOKExWallet) || source?.ethereum;
          }
        };
      }
    }),
    baseAccount({
      appName: "BaseSplit Club",
      preference: { options: "all" }
    })
  ],
  multiInjectedProviderDiscovery: false,
  ssr: true,
  transports: {
    [base.id]: http()
  }
});

export function isConfiguredAddress(address: Address) {
  return address !== "0x0000000000000000000000000000000000000000";
}
