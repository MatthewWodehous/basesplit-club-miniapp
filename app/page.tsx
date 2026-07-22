"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift, Receipt, Split } from "lucide-react";
import { concatHex, encodeFunctionData, formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { WalletPanel } from "@/components/WalletPanel";
import { baseSplitClubAbi, CONTRACT_ADDRESS, ZERO_ADDRESS } from "@/lib/contracts";
import { dataSuffix } from "@/lib/wagmi";

const LOCAL_BILL_KEY = "basesplit.club.localBill";
const LOCAL_POINTS_KEY = "basesplit.club.rewardPoints";
const LOCAL_RECEIPTS_KEY = "basesplit.club.receipts";
const LOCAL_BALANCES_KEY = "basesplit.club.balances";
const LOCAL_TRANSFERS_KEY = "basesplit.club.transfers";
const GUEST_WALLET = "guest";

type FormParticipant = {
  address: string;
  amount: string;
};

type LocalParticipant = {
  address: string;
  amount: string;
  paid: boolean;
};

type LocalBill = {
  id: string;
  title: string;
  creator: string;
  participants: LocalParticipant[];
  receiptMinted: boolean;
};

type TransferRecord = {
  id: string;
  from: string;
  to: string;
  amount: string;
  note: string;
  createdAt: string;
};

function formatShare(value?: bigint) {
  if (value === undefined) return "0.00";
  return Number(formatUnits(value, 6)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseAppAmount(value: string) {
  return parseUnits(value || "0", 6);
}

function normalizeUserId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return isAddress(trimmed) ? trimmed.toLowerCase() : trimmed.toLowerCase().replace(/\s+/g, "-");
}

function compactAddress(address?: string) {
  if (!address) return "Not connected";
  if (!address.startsWith("0x")) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readStoredNumber(key: string) {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(key) || "0");
}

function readJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function sumParticipants(participants: LocalParticipant[], paidOnly = false) {
  return participants.reduce((total, participant) => {
    if (paidOnly && !participant.paid) return total;
    return total + BigInt(participant.amount);
  }, 0n);
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: transactionHash, isPending: isWriting, sendTransaction } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isRecordedOnchain } = useWaitForTransactionReceipt({
    hash: transactionHash
  });
  const walletId = normalizeUserId(address || GUEST_WALLET);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("Weekend dinner in SoHo");
  const [participants, setParticipants] = useState<FormParticipant[]>([
    { address: "", amount: "18.50" },
    { address: "", amount: "18.50" }
  ]);
  const [localBill, setLocalBill] = useState<LocalBill | null>(null);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [receiptBalance, setReceiptBalance] = useState(0);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  useEffect(() => {
    setLocalBill(readJson<LocalBill | null>(LOCAL_BILL_KEY, null));
    setRewardPoints(readStoredNumber(LOCAL_POINTS_KEY));
    setReceiptBalance(readStoredNumber(LOCAL_RECEIPTS_KEY));
    setBalances(readJson<Record<string, string>>(LOCAL_BALANCES_KEY, {}));
    setTransfers(readJson<TransferRecord[]>(LOCAL_TRANSFERS_KEY, []));
  }, []);

  useEffect(() => {
    if (!isRecordedOnchain || !transactionHash) return;
    setStatus("Recorded on Base. Dashboard attribution can update after indexing.");
  }, [isRecordedOnchain, transactionHash]);

  const referrer = useMemo(() => {
    if (typeof window === "undefined") return ZERO_ADDRESS;
    const value = new URLSearchParams(window.location.search).get("ref");
    return value && isAddress(value) ? (value as Address) : ZERO_ADDRESS;
  }, []);

  const myParticipant = useMemo(() => {
    if (!localBill) return undefined;
    return localBill.participants.find((participant) => participant.address === walletId);
  }, [localBill, walletId]);

  const currentTitle = localBill?.title || title;
  const activeBillId = localBill?.id || "draft";
  const paidAmount = localBill ? sumParticipants(localBill.participants, true) : 0n;
  const totalAmount = localBill ? sumParticipants(localBill.participants) : 0n;
  const myShare = myParticipant ? BigInt(myParticipant.amount) : 0n;
  const myBalance = BigInt(balances[walletId] || "0");
  const hasPaid = Boolean(myParticipant?.paid);
  const isSettled = Boolean(localBill && localBill.participants.every((participant) => participant.paid));
  const canMint = Boolean(localBill && isSettled && !localBill.receiptMinted);
  const receiptMinted = Boolean(localBill?.receiptMinted);

  const referralLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("ref", address || walletId);
    return url.toString();
  }, [address, walletId]);

  const billStatus = !localBill ? "Ready" : isSettled ? "Settled" : paidAmount > 0n ? "Collecting" : "Open";
  const needsBalance = myShare > 0n && !hasPaid && myBalance < myShare;

  const shouldRecordOnBase = isConnected && !transactionHash;
  const primaryLabel = isWriting
    ? "Open Wallet"
    : isConfirming
      ? "Recording"
      : shouldRecordOnBase
        ? "Record on Base"
      : canMint
    ? "Mint Receipt"
    : myShare > 0n && !hasPaid
      ? needsBalance
        ? "Add Balance"
        : "Pay My Share"
      : hasPaid
        ? "Paid"
        : "Create Split";
  const primaryDone = hasPaid && !canMint;

  function persistBill(nextBill: LocalBill | null) {
    setLocalBill(nextBill);
    if (nextBill) {
      window.localStorage.setItem(LOCAL_BILL_KEY, JSON.stringify(nextBill));
    } else {
      window.localStorage.removeItem(LOCAL_BILL_KEY);
    }
  }

  function persistBalances(nextBalances: Record<string, string>) {
    setBalances(nextBalances);
    window.localStorage.setItem(LOCAL_BALANCES_KEY, JSON.stringify(nextBalances));
  }

  function persistTransfers(nextTransfers: TransferRecord[]) {
    setTransfers(nextTransfers);
    window.localStorage.setItem(LOCAL_TRANSFERS_KEY, JSON.stringify(nextTransfers));
  }

  function addPoints(points: number) {
    const nextPoints = rewardPoints + points;
    setRewardPoints(nextPoints);
    window.localStorage.setItem(LOCAL_POINTS_KEY, String(nextPoints));
  }

  function recordTransfer(from: string, to: string, amount: bigint, note: string) {
    const nextTransfers = [
      {
        id: Date.now().toString(),
        from,
        to,
        amount: amount.toString(),
        note,
        createdAt: new Date().toISOString()
      },
      ...transfers
    ].slice(0, 8);
    persistTransfers(nextTransfers);
  }

  function createLocalBill() {
    const validRows = participants.filter((row) => normalizeUserId(row.address) && Number(row.amount) > 0);
    const rows = validRows.length > 0 ? validRows : [{ address: walletId, amount: "1.00" }];

    const nextBill: LocalBill = {
      id: Date.now().toString(),
      title,
      creator: walletId,
      participants: rows.map((row) => ({
        address: normalizeUserId(row.address),
        amount: parseAppAmount(row.amount).toString(),
        paid: false
      })),
      receiptMinted: false
    };

    persistBill(nextBill);
    addPoints(10);
    setStatus("Split saved. First reward unlocked.");
  }

  function handleCreateBill() {
    createLocalBill();

    if (!isConnected || !address) {
      setStatus("Split saved locally. Connect a wallet to record it on Base.");
      return;
    }

    const callData = encodeFunctionData({
      abi: baseSplitClubAbi,
      functionName: "createBill",
      args: [`${title || "BaseSplit Club"} check-in`, [address], [parseAppAmount("1.00")]]
    });

    sendTransaction({
      to: CONTRACT_ADDRESS,
      data: concatHex([callData, dataSuffix])
    });
  }

  function handlePayShare() {
    if (!localBill || !myParticipant) {
      setStatus("Open a split that includes your wallet, address, or nickname.");
      return;
    }

    if (myBalance < myShare) {
      setStatus("Add app balance first. Wallet balance is required before paying.");
      return;
    }

    const nextBill = {
      ...localBill,
      participants: localBill.participants.map((participant) =>
        participant.address === myParticipant.address ? { ...participant, paid: true } : participant
      )
    };
    const isSelfPayment = localBill.creator === walletId;
    const nextBalances = isSelfPayment
      ? balances
      : {
          ...balances,
          [walletId]: (myBalance - myShare).toString(),
          [localBill.creator]: (BigInt(balances[localBill.creator] || "0") + myShare).toString()
        };

    persistBill(nextBill);
    persistBalances(nextBalances);
    recordTransfer(walletId, localBill.creator, myShare, `Paid share for ${localBill.title}`);
    addPoints(referrer !== ZERO_ADDRESS ? 15 : 5);
    setStatus(isSelfPayment ? "Self payment recorded. Balance unchanged." : "Share paid from app balance and recorded.");
  }

  function handleAddRequiredBalance() {
    const amount = myShare > myBalance ? myShare - myBalance : parseAppAmount("1.00");
    const nextBalances = {
      ...balances,
      [walletId]: (myBalance + amount).toString()
    };

    persistBalances(nextBalances);
    recordTransfer(walletId, walletId, amount, "Added app balance");
    addPoints(5);
    setStatus("App balance added. You can pay your share now.");
  }

  function handleMintReceipt() {
    if (!localBill || !canMint) return;
    const nextBill = { ...localBill, receiptMinted: true };
    const nextReceipts = receiptBalance + 1;

    persistBill(nextBill);
    setReceiptBalance(nextReceipts);
    window.localStorage.setItem(LOCAL_RECEIPTS_KEY, String(nextReceipts));
    addPoints(15);
    setStatus("Receipt added to your local collection.");
  }

  function handlePrimaryAction() {
    if (primaryDone || isWriting || isConfirming) {
      return;
    }

    if (shouldRecordOnBase) {
      handleCreateBill();
    } else if (canMint) {
      handleMintReceipt();
    } else if (needsBalance) {
      handleAddRequiredBalance();
    } else if (myShare > 0n && !hasPaid) {
      handlePayShare();
    } else if (!hasPaid) {
      handleCreateBill();
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
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

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Metric label="App balance" value={formatShare(myBalance)} />
            <Metric label="My share" value={formatShare(myShare)} />
            <Metric label="Bill status" value={billStatus} />
            <Metric label="Confirmed" value={`${formatShare(paidAmount)} / ${formatShare(totalAmount)}`} />
            <Metric label="Points" value={rewardPoints.toString()} />
          </div>

          <button
            type="button"
            onClick={handlePrimaryAction}
            aria-disabled={primaryDone}
            className={`mt-6 flex h-14 w-full items-center justify-center rounded-lg px-5 text-base font-black transition ${
              primaryDone
                ? "cursor-default border border-line bg-ink text-white/70"
                : "bg-mint text-ink hover:bg-white"
            }`}
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
                <p className="text-sm text-white/50">Bill #{activeBillId}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/50">Wallet: {compactAddress(address || GUEST_WALLET)}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-line bg-panel/70 p-4">
          <h2 className="text-base font-bold text-white">Create Split</h2>
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
                  aria-label={`Participant ${index + 1}`}
                  value={row.address}
                  onChange={(event) => {
                    const next = [...participants];
                    next[index] = { ...row, address: event.target.value };
                    setParticipants(next);
                  }}
                  placeholder="address or nickname"
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
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-line bg-panel/70 p-4">
            <h2 className="text-base font-bold text-white">Invite</h2>
            <p
              onClick={() => referralLink && navigator.clipboard.writeText(referralLink)}
              className="mt-3 break-all rounded-lg border border-line bg-ink p-3 text-sm text-white/60"
            >
              {referralLink}
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
              <Metric label="Wallet" value={compactAddress(address || GUEST_WALLET)} />
            </div>
          </div>
          <div className="rounded-lg border border-line bg-panel/70 p-4">
            <h2 className="text-base font-bold text-white">Rewards</h2>
            <div className="mt-3 grid gap-2">
              {transfers.length === 0 ? (
                <p className="rounded-lg border border-line bg-ink p-3 text-sm text-white/45">Your first action unlocks points instantly.</p>
              ) : (
                transfers.slice(0, 3).map((transfer) => (
                  <div key={transfer.id} className="rounded-lg border border-line bg-ink p-3 text-sm text-white/60">
                    <p className="font-semibold text-white">{formatShare(BigInt(transfer.amount))}</p>
                    <p className="break-all text-xs text-white/45">
                      {compactAddress(transfer.from)} to {compactAddress(transfer.to)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-lg border border-line bg-ink p-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-2 whitespace-nowrap text-base font-black text-white sm:text-lg">{value}</p>
    </div>
  );
}
