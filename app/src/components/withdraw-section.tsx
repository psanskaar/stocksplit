"use client";

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserPositions, UserPosition } from "@/hooks/use-user-positions";
import { useStockSplitProgram } from "@/hooks/use-stocksplit-program";
import { useCountdown } from "@/hooks/use-countdown";
import { formatAmount, shortenAddress, getExplorerUrl } from "@/lib/utils";
import { ArrowUpRight, CheckCircle2, AlertCircle, Loader2, Undo2, Clock } from "lucide-react";

export function WithdrawSection() {
  const { connected } = useWallet();
  const { positions, loading, refetch } = useUserPositions();
  const { withdraw } = useStockSplitProgram();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ [vaultPda: string]: { type: "success" | "error"; text: string; tx?: string } }>({});

  if (!connected) return null;

  // Filter only unsettled active positions where user has both PT and YT (eligible for early withdraw)
  const activePositions = positions.filter((p) => !p.settled && (p.ptBalance > 0 || p.ytBalance > 0));

  if (!loading && activePositions.length === 0) {
    return null;
  }

  const handleWithdraw = async (pos: UserPosition) => {
    const rawToWithdraw = Math.min(Number(pos.ptBalanceRaw), Number(pos.ytBalanceRaw));
    if (rawToWithdraw <= 0) return;

    setActionLoading(pos.vaultPda);
    try {
      const txSig = await withdraw(rawToWithdraw, new PublicKey(pos.vaultPda));
      setResult((prev) => ({
        ...prev,
        [pos.vaultPda]: {
          type: "success",
          text: `Withdrew ${formatAmount(rawToWithdraw / 1e6)} SPYx by burning equal PT & YT!`,
          tx: txSig,
        },
      }));
      await refetch();
    } catch (err: any) {
      setResult((prev) => ({
        ...prev,
        [pos.vaultPda]: {
          type: "error",
          text: err.message || "Withdraw failed",
        },
      }));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Undo2 className="w-4 h-4 text-indigo-400" /> Early Exit / Recombine
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Burn matching PT + YT tokens to reclaim your underlying SPYx before maturity.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {activePositions.map((pos) => (
          <ActiveWithdrawCard
            key={pos.vaultPda}
            pos={pos}
            isActing={actionLoading === pos.vaultPda}
            posResult={result[pos.vaultPda]}
            onWithdraw={handleWithdraw}
          />
        ))}
      </div>
    </div>
  );
}

function ActiveWithdrawCard({
  pos,
  isActing,
  posResult,
  onWithdraw,
}: {
  pos: UserPosition;
  isActing: boolean;
  posResult?: { type: "success" | "error"; text: string; tx?: string };
  onWithdraw: (pos: UserPosition) => Promise<void>;
}) {
  const countdown = useCountdown(pos.maturityTimestamp);
  const maxRawReclaim = Math.min(Number(pos.ptBalanceRaw), Number(pos.ytBalanceRaw));
  const maxReclaim = maxRawReclaim / 1e6;

  return (
    <div className="glass-panel p-5 rounded-2xl border border-[#1e1e3a] space-y-3 hover:border-[#2a2a50] transition-colors">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-slate-400">Vault: {shortenAddress(pos.vaultPda)}</span>
        <span className="text-amber-400 flex items-center gap-1 font-mono text-[11px]">
          <Clock className="w-3.5 h-3.5 animate-pulse" /> Active ({countdown.formatted} left)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] text-xs">
        <div>
          <span className="text-slate-400 block mb-0.5">Your PT Balance</span>
          <span className="font-bold text-blue-400 font-mono">
            {formatAmount(pos.ptBalance)} PT
          </span>
        </div>
        <div>
          <span className="text-slate-400 block mb-0.5">Your YT Balance</span>
          <span className="font-bold text-emerald-400 font-mono">
            {formatAmount(pos.ytBalance)} YT
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-xs text-slate-400">
          Reclaimable: <strong className="text-white">{formatAmount(maxReclaim)} SPYx</strong>
        </div>

        <button
          onClick={() => onWithdraw(pos)}
          disabled={isActing || maxRawReclaim <= 0}
          className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1e1e3a] hover:bg-[#2a2a50] border border-[#2a2a50] transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
          <span>Withdraw SPYx</span>
        </button>
      </div>

      {posResult && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            posResult.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              : "bg-red-950/40 border-red-800/60 text-red-300"
          }`}
        >
          <span>{posResult.text}</span>
          {posResult.tx && (
            <a
              href={getExplorerUrl("tx", posResult.tx)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-white font-medium"
            >
              Explorer ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
