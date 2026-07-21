"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Gift, Receipt, Split, Users } from "lucide-react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import { WalletPanel } from "@/components/WalletPanel";
import { ZERO_ADDRESS } from "@/lib/contracts";

const LOCAL_BILL_KEY = "basesplit.club.localBill";
const LOCAL_POINTS_KEY = "basesplit.club.rewardPoints";
const LOCAL_RECEIPTS_KEY = "basesplit.club.receipts";
const GUEST_WALLET = "guest-wallet";

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

function formatShare(value?: bigint) {
  if (value === undefined) return "0.00";
  return Number(formatUnits(value, 6)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function compactAddress(address?: string) {
  if (!address) return "Not connected";
  if (!address.startsWith("0x")) return "Guest";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readStoredNumber(key: string) {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(key) || "0");
}

function parseStoredBill() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LOCAL_BILL_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LocalBill;
  } catch {
    window.localStorage.removeItem(LOCAL_BILL_KEY);
    return null;
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
  const walletId = (address || GUEST_WALLET).toLowerCase();
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("Weekend dinner in SoHo");
  const [participants, setParticipants] = useState<FormParticipant[]>([
    { address: "", amount: "18.50" },
    { address: "", amount: "18.50" }
  ]);
  const [localBill, setLocalBill] = useState<LocalBill | null>(null);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [receiptBalance, setReceiptBalance] = useState(0);

  useEffect(() => {
    setLocalBill(parseStoredBill());
    setRewardPoints(readStoredNumber(LOCAL_POINTS_KEY));
    setReceiptBalance(readStoredNumber(LOCAL_RECEIPTS_KEY));
  }, []);

  const referrer = useMemo(() => {
    if (typeof window === "undefined") return ZERO_ADDRESS;
    const value = new URLSearchParams(window.location.search).get("ref");
    return value && isAddress(value) ? (value as Address) : ZERO_ADDRESS;
  }, []);

  const myParticipant = useMemo(() => {
    if (!localBill) return undefined;
    if (address) {
      return localBill.participants.find((participant) => participant.address.toLowerCase() === walletId);
    }
    return localBill.participants.find((participant) => !participant.paid);
  }, [address, localBill, walletId]);

  const currentTitle = localBill?.title || title;
  const activeBillId = localBill?.id || "draft";
  const paidAmount = localBill ? sumParticipants(localBill.participants, true) : 0n;
  const totalAmount = localBill ? sumParticipants(localBill.participants) : 0n;
  const myShare = myParticipant ? BigInt(myParticipant.amount) : 0n;
  const hasPaid = Boolean(myParticipant?.paid);
  const isSettled = Boolean(localBill && localBill.participants.every((participant) => participant.paid));
  const canMint = Boolean(localBill && isSettled && !localBill.receiptMinted);
  const receiptMinted = Boolean(localBill?.receiptMinted);

  const referralLink = useMemo(() => {
    if (typeof window === "undefined" || !address) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("ref", address);
    return url.toString();
  }, [address]);

  const billStatus = !localBill ? "Ready" : isSettled ? "Settled" : paidAmount > 0n ? "Collecting" : "Open";

  const primaryLabel = canMint
    ? "Mint Receipt"
    : myShare > 0n && !hasPaid
      ? "Pay My Share"
      : hasPaid
        ? "Paid"
        : "Create Split";

  function persistBill(nextBill: LocalBill | null) {
    setLocalBill(nextBill);
    if (nextBill) {
      window.localStorage.setItem(LOCAL_BILL_KEY, JSON.stringify(nextBill));
    } else {
      window.localStorage.removeItem(LOCAL_BILL_KEY);
    }
  }

  function addPoints(points: number) {
    const nextPoints = rewardPoints + points;
    setRewardPoints(nextPoints);
    window.localStorage.setItem(LOCAL_POINTS_KEY, String(nextPoints));
  }

  function handleCreateBill() {
    const validRows = participants.filter((row) => isAddress(row.address) && Number(row.amount) > 0);
    const fallbackRows = isConnected && address && participants.every((row) => !row.address)
      ? [{ address, amount: "1.00" }]
      : [];
    const rows = validRows.length > 0 ? validRows : fallbackRows;

    if (rows.length === 0) {
      setStatus("Add at least one participant address, or connect a wallet to create a personal split.");
      return;
    }

    const nextBill: LocalBill = {
      id: Date.now().toString(),
      title,
      creator: address || GUEST_WALLET,
      participants: rows.map((row) => ({
        address: row.address.toLowerCase(),
        amount: parseUnits(row.amount, 6).toString(),
        paid: false
      })),
      receiptMinted: false
    };

    persistBill(nextBill);
    setStatus("Split saved. No token or gas required.");
  }

  function handlePayShare() {
    if (!localBill || !myParticipant) {
      setStatus("Open a split that includes your wallet address.");
      return;
    }

    const nextBill = {
      ...localBill,
      participants: localBill.participants.map((participant) =>
        participant.address.toLowerCase() === myParticipant.address.toLowerCase()
          ? { ...participant, paid: true }
          : participant
      )
    };

    persistBill(nextBill);
    addPoints(referrer !== ZERO_ADDRESS ? 15 : 5);
    setStatus("Share confirmed locally. No wallet balance needed.");
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
    if (canMint) {
      handleMintReceipt();
    } else if (myShare > 0n && !hasPaid) {
      handlePayShare();
    } else if (!hasPaid) {
      handleCreateBill();
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
            <Metric label="My share" value={formatShare(myShare)} />
            <Metric label="Bill status" value={billStatus} />
            <Metric label="Total confirmed" value={`${formatShare(paidAmount)} / ${formatShare(totalAmount)}`} />
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
                <p className="text-sm text-white/50">Bill #{activeBillId}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                persistBill(null);
                setStatus("Draft ready.");
              }}
              className="mt-4 h-10 rounded-lg border border-line px-3 text-sm font-semibold text-white/75 transition hover:bg-white/8"
            >
              New Split
            </button>
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
