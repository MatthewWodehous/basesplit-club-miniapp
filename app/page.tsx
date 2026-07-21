"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Gift, Receipt, Split, Users } from "lucide-react";
import { formatUnits, isAddress, parseEventLogs, parseUnits, type Address } from "viem";
import { base } from "wagmi/chains";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import { WalletPanel } from "@/components/WalletPanel";
import { baseSplitClubAbi, CONTRACT_ADDRESS, erc20Abi, USDC_ADDRESS, ZERO_ADDRESS } from "@/lib/contracts";
import { dataSuffix, isConfiguredAddress } from "@/lib/wagmi";

const demoBillId = 0n;

type FormParticipant = {
  address: string;
  amount: string;
};

function formatUsdc(value?: bigint) {
  if (value === undefined) return "0.00";
  return Number(formatUnits(value, 6)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function compactAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [activeBillId, setActiveBillId] = useState<bigint>(demoBillId);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("Weekend dinner in SoHo");
  const [participants, setParticipants] = useState<FormParticipant[]>([
    { address: "", amount: "18.50" },
    { address: "", amount: "18.50" }
  ]);

  const appReady = isConfiguredAddress(CONTRACT_ADDRESS);

  const referrer = useMemo(() => {
    if (typeof window === "undefined") return ZERO_ADDRESS;
    const value = new URLSearchParams(window.location.search).get("ref");
    return value && isAddress(value) ? (value as Address) : ZERO_ADDRESS;
  }, []);

  const billRead = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: baseSplitClubAbi,
    functionName: "bills",
    args: [activeBillId],
    query: { enabled: appReady }
  });

  const myShareRead = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: baseSplitClubAbi,
    functionName: "amountDue",
    args: [activeBillId, (address || ZERO_ADDRESS) as Address],
    query: { enabled: appReady && Boolean(address) }
  });

  const paidRead = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: baseSplitClubAbi,
    functionName: "paid",
    args: [activeBillId, (address || ZERO_ADDRESS) as Address],
    query: { enabled: appReady && Boolean(address) }
  });

  const settledRead = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: baseSplitClubAbi,
    functionName: "billSettled",
    args: [activeBillId],
    query: { enabled: appReady }
  });

  const pointsRead = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: baseSplitClubAbi,
    functionName: "rewardPoints",
    args: [(address || ZERO_ADDRESS) as Address],
    query: { enabled: appReady && Boolean(address) }
  });

  const receiptBalanceRead = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: baseSplitClubAbi,
    functionName: "balanceOf",
    args: [(address || ZERO_ADDRESS) as Address],
    query: { enabled: appReady && Boolean(address) }
  });

  const canMintRead = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: baseSplitClubAbi,
    functionName: "canMintReceipt",
    args: [activeBillId, (address || ZERO_ADDRESS) as Address],
    query: { enabled: appReady && Boolean(address) }
  });

  const refreshReads = useCallback(async () => {
    await Promise.all([
      billRead.refetch(),
      myShareRead.refetch(),
      paidRead.refetch(),
      settledRead.refetch(),
      pointsRead.refetch(),
      receiptBalanceRead.refetch(),
      canMintRead.refetch()
    ]);
  }, [billRead, canMintRead, myShareRead, paidRead, pointsRead, receiptBalanceRead, settledRead]);

  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();
  const txReceipt = useWaitForTransactionReceipt({ hash: lastHash });

  useEffect(() => {
    if (txReceipt.isSuccess) {
      void refreshReads();
      setStatus("Transaction confirmed.");
    }
  }, [refreshReads, txReceipt.isSuccess]);

  const bill = billRead.data;
  const currentTitle = bill?.[1] || title;
  const paidAmount = bill?.[3] || 0n;
  const receiptMinted = bill?.[4] || false;
  const myShare = myShareRead.data || 0n;
  const hasPaid = Boolean(paidRead.data);
  const isSettled = Boolean(settledRead.data);
  const canMint = Boolean(canMintRead.data);
  const rewardPoints = pointsRead.data || 0n;
  const receiptBalance = receiptBalanceRead.data || 0n;

  const referralLink = useMemo(() => {
    if (typeof window === "undefined" || !address) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("ref", address);
    return url.toString();
  }, [address]);

  const billStatus = isSettled ? "Settled" : paidAmount > 0n ? "Collecting" : appReady ? "Open" : "Setup needed";

  const primaryLabel = !isConnected
    ? "Connect Wallet"
    : !appReady
      ? "Add Contract Address"
      : canMint
        ? "Mint Receipt"
        : myShare > 0n && !hasPaid
          ? "Pay My Share"
          : hasPaid
            ? "Paid"
            : "Create Split";

  async function ensureBase() {
    if (currentChainId !== base.id) {
      await switchChainAsync({ chainId: base.id });
    }
  }

  async function trackTransaction(hash: `0x${string}`, message: string) {
    setLastHash(hash);
    setStatus(message);
    return hash;
  }

  async function handleCreateBill() {
    if (!address) return;
    await ensureBase();

    const validRows = participants.filter((row) => isAddress(row.address) && Number(row.amount) > 0);
    if (validRows.length === 0) {
      setStatus("Add at least one participant with a valid address and amount.");
      return;
    }

    const hash = await writeContractAsync({
      address: CONTRACT_ADDRESS,
      abi: baseSplitClubAbi,
      functionName: "createBill",
      args: [
        title,
        validRows.map((row) => row.address as Address),
        validRows.map((row) => parseUnits(row.amount, 6))
      ],
      dataSuffix
    });
    await trackTransaction(hash, "Split submitted. Waiting for confirmation.");

    const { waitForTransactionReceipt } = await import("@wagmi/core");
    const { wagmiConfig } = await import("@/lib/wagmi");
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
    const logs = parseEventLogs({
      abi: baseSplitClubAbi,
      logs: receipt.logs,
      eventName: "BillCreated"
    });
    const createdBillId = logs[0]?.args.billId;
    if (createdBillId !== undefined) {
      setActiveBillId(createdBillId);
    }
    await refreshReads();
  }

  async function handlePayShare() {
    if (!address || myShare === 0n) return;
    await ensureBase();

    const allowance = await fetchAllowance(address);
    if (allowance < myShare) {
      const approveHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "approve",
        args: [CONTRACT_ADDRESS, myShare],
        dataSuffix
      });
      await trackTransaction(approveHash, "USDC approval submitted. Confirm payment after approval lands.");
      return;
    }

    const hash = await writeContractAsync({
      address: CONTRACT_ADDRESS,
      abi: baseSplitClubAbi,
      functionName: "payShare",
      args: [activeBillId, referrer],
      dataSuffix
    });
    await trackTransaction(hash, "Payment submitted. Waiting for confirmation.");
  }

  async function fetchAllowance(owner: Address) {
    const { readContract } = await import("@wagmi/core");
    const { wagmiConfig } = await import("@/lib/wagmi");
    return readContract(wagmiConfig, {
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, CONTRACT_ADDRESS]
    });
  }

  async function handleMintReceipt() {
    await ensureBase();
    const hash = await writeContractAsync({
      address: CONTRACT_ADDRESS,
      abi: baseSplitClubAbi,
      functionName: "mintReceipt",
      args: [activeBillId],
      dataSuffix
    });
    await trackTransaction(hash, "Receipt mint submitted. Waiting for confirmation.");
  }

  async function handlePrimaryAction() {
    try {
      if (!isConnected) {
        setStatus("Choose OKX Wallet, MetaMask, or Coinbase Wallet.");
      } else if (!appReady) {
        setStatus("Set NEXT_PUBLIC_CONTRACT_ADDRESS before sending transactions.");
      } else if (canMint) {
        await handleMintReceipt();
      } else if (myShare > 0n && !hasPaid) {
        await handlePayShare();
      } else if (!hasPaid) {
        await handleCreateBill();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Transaction failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-line bg-panel/75 p-4 shadow-glow sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mint">BaseSplit Club</p>
              <h1 className="pt-2 text-3xl font-black tracking-normal text-white sm:text-5xl">BaseSplit Club</h1>
              <p className="max-w-xl pt-3 text-sm leading-6 text-white/65 sm:text-base">
                Split bills. Settle on Base. Keep the memory.
              </p>
            </div>
            <div className="rounded-lg border border-mint/30 bg-mint/10 p-3 text-mint">
              <Split className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="My share" value={`$${formatUsdc(myShare)}`} />
            <Metric label="Bill status" value={billStatus} />
            <Metric label="Total paid" value={`$${formatUsdc(paidAmount)}`} />
            <Metric label="Reward points" value={rewardPoints.toString()} />
          </div>

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={hasPaid && !canMint}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-lg bg-mint px-5 text-base font-black text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/18 disabled:text-white/45"
          >
            {primaryLabel}
          </button>

          {status ? <p className="mt-3 text-sm text-white/60">{status}</p> : null}
        </div>

        <div className="grid gap-4">
          <WalletPanel />
          <div className="rounded-lg border border-line bg-panel/70 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Current bill</p>
            <div className="mt-3 flex items-center gap-3">
              <Receipt className="h-5 w-5 text-sky" />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-white">{currentTitle}</p>
                <p className="text-sm text-white/50">Bill #{activeBillId.toString()}</p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45" htmlFor="billId">
              Open bill ID
            </label>
            <input
              id="billId"
              value={activeBillId.toString()}
              onChange={(event) => setActiveBillId(BigInt(event.target.value || "0"))}
              className="mt-2 h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-white"
              inputMode="numeric"
            />
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-line bg-panel/70 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Create Split</h2>
            <Users className="h-5 w-5 text-white/45" />
          </div>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45" htmlFor="title">
            Bill title
          </label>
          <input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-11 w-full rounded-lg border border-line bg-ink px-3 text-sm text-white"
          />
          <div className="mt-4 grid gap-2">
            {participants.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_5.5rem] gap-2">
                <input
                  aria-label={`Participant ${index + 1} address`}
                  value={row.address}
                  onChange={(event) => {
                    const next = [...participants];
                    next[index] = { ...row, address: event.target.value };
                    setParticipants(next);
                  }}
                  placeholder="0x participant"
                  className="h-11 min-w-0 rounded-lg border border-line bg-ink px-3 text-sm text-white placeholder:text-white/25"
                />
                <input
                  aria-label={`Participant ${index + 1} amount`}
                  value={row.amount}
                  onChange={(event) => {
                    const next = [...participants];
                    next[index] = { ...row, amount: event.target.value };
                    setParticipants(next);
                  }}
                  className="h-11 rounded-lg border border-line bg-ink px-3 text-sm text-white"
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setParticipants([...participants, { address: "", amount: "0.00" }])}
            className="mt-3 h-10 rounded-lg border border-line px-3 text-sm font-semibold text-white/75 transition hover:bg-white/8"
          >
            Add participant
          </button>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-line bg-panel/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Invite</h2>
              <button
                type="button"
                onClick={() => referralLink && navigator.clipboard.writeText(referralLink)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/70 transition hover:bg-white/8"
                aria-label="Copy referral link"
                title="Copy referral link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 break-all rounded-lg border border-line bg-ink p-3 text-sm text-white/60">
              {referralLink || "Connect a wallet to generate your referral link."}
            </p>
            <p className="mt-3 text-sm text-white/50">Referral source: {referrer === ZERO_ADDRESS ? "None" : compactAddress(referrer)}</p>
          </div>

          <div className="rounded-lg border border-line bg-panel/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Receipt NFTs</h2>
              <Gift className="h-5 w-5 text-rose" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric label="Receipt" value={receiptMinted ? "Minted" : canMint ? "Ready" : "Pending"} />
              <Metric label="Owned" value={receiptBalance.toString()} />
              <Metric label="Wallet" value={compactAddress(address)} />
            </div>
          </div>
        </div>
      </section>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/92 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {["Split", "Rewards", "Invite"].map((item) => (
            <button key={item} type="button" className="h-10 rounded-lg text-sm font-bold text-white/70 transition hover:bg-white/8">
              {item}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-lg border border-line bg-ink p-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 break-words text-lg font-black text-white">{value}</p>
    </div>
  );
}
