"use client";

import React, { useState, useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { UserPosition } from "@/hooks/use-user-positions";
import { useStockSplitProgram } from "@/hooks/use-stocksplit-program";
import { useCountdown } from "@/hooks/use-countdown";
import { formatAmount, shortenAddress, getExplorerUrl } from "@/lib/utils";
import { alignToDevnet } from "@/lib/devnet-align";
import {
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  ShieldCheck,
  Trophy,
  Undo2,
} from "lucide-react";

export function PositionCard({
  position,
  onRefresh,
}: {
  position: UserPosition;
  onRefresh: () => Promise<void>;
}) {
  const { wallet } = useWallet();
  const { withdraw, settle, redeemPt, claimYt } = useStockSplitProgram();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tx?: string; type: "success" | "error" } | null>(null);

  const countdown = useCountdown(position.maturityTimestamp);
  const isMatured = position.isMatured || countdown.isMatured;

  const maturityDateStr = useMemo(() => {
    if (!position.maturityTimestamp) return "—";
    return new Date(position.maturityTimestamp * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [position.maturityTimestamp]);

  const vaultPubkey = new PublicKey(position.vaultPda);

  const handleWithdraw = async () => {
    const rawToWithdraw = Math.min(Number(position.ptBalanceRaw), Number(position.ytBalanceRaw));
    if (rawToWithdraw <= 0) return;
    setLoadingAction("withdraw");
    try {
      await alignToDevnet(wallet);
      const sig = await withdraw(rawToWithdraw, vaultPubkey);
      setMessage({ type: "success", text: `Withdrew ${formatAmount(rawToWithdraw / 1e6)} SPYx!`, tx: sig });
      await onRefresh();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSettle = async () => {
    setLoadingAction("settle");
    try {
      await alignToDevnet(wallet);
      const sig = await settle(vaultPubkey);
      setMessage({ type: "success", text: "Vault settled successfully!", tx: sig });
      await onRefresh();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRedeemPt = async () => {
    if (Number(position.ptBalanceRaw) <= 0) return;
    setLoadingAction("redeem_pt");
    try {
      await alignToDevnet(wallet);
      const sig = await redeemPt(Number(position.ptBalanceRaw), vaultPubkey);
      setMessage({ type: "success", text: "Redeemed PT for SPYx!", tx: sig });
      await onRefresh();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleClaimYt = async () => {
    if (Number(position.ytBalanceRaw) <= 0) return;
    setLoadingAction("claim_yt");
    try {
      await alignToDevnet(wallet);
      const sig = await claimYt(Number(position.ytBalanceRaw), vaultPubkey);
      setMessage({ type: "success", text: "Claimed USDC dividends!", tx: sig });
      await onRefresh();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border border-[#1e1e3a] space-y-4 hover:border-[#2a2a50] transition-colors">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1e1e3a]">
        <div>
          <span className="font-mono text-xs text-slate-400">
            Vault: {shortenAddress(position.vaultPda, 6)}
          </span>
          <div className="text-xs text-slate-500 mt-0.5">
            Multiplier: {position.multiplierAtDeposit}x → {position.currentMultiplier}x
          </div>
        </div>

        {/* Status Badge */}
        {position.settled ? (
          <span className="self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Settled
          </span>
        ) : isMatured ? (
          <span className="self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Matured (Ready to Settle)
          </span>
        ) : (
          <span className="self-start sm:self-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1.5 font-mono">
            <Clock className="w-3 h-3 animate-pulse text-blue-400" />
            <span>Active • {countdown.formatted}</span>
          </span>
        )}
      </div>

      {/* Live Maturity Countdown Banner for Active Positions */}
      {!position.settled && !isMatured && (
        <div className="p-3 rounded-xl bg-gradient-to-r from-blue-950/40 via-[#10102e] to-indigo-950/40 border border-blue-500/25 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-blue-300">
                Live Maturity Countdown
              </div>
              <div className="text-[11px] text-slate-400">
                Matures {maturityDateStr}
              </div>
            </div>
          </div>

          {/* Live Digits Display */}
          <div className="flex items-center gap-1 font-mono text-xs">
            <div className="px-2 py-1 rounded bg-[#090918] border border-blue-500/30 text-white font-bold text-center">
              <span className="text-blue-300">{countdown.days}</span>
              <span className="text-[9px] text-slate-500 ml-0.5">d</span>
            </div>
            <span className="text-slate-500 font-bold">:</span>
            <div className="px-2 py-1 rounded bg-[#090918] border border-blue-500/30 text-white font-bold text-center">
              <span className="text-blue-300">{countdown.hours.toString().padStart(2, "0")}</span>
              <span className="text-[9px] text-slate-500 ml-0.5">h</span>
            </div>
            <span className="text-slate-500 font-bold">:</span>
            <div className="px-2 py-1 rounded bg-[#090918] border border-blue-500/30 text-white font-bold text-center">
              <span className="text-blue-300">{countdown.minutes.toString().padStart(2, "0")}</span>
              <span className="text-[9px] text-slate-500 ml-0.5">m</span>
            </div>
            <span className="text-slate-500 font-bold">:</span>
            <div className="px-2 py-1 rounded bg-[#090918] border border-blue-500/30 text-emerald-400 font-bold text-center min-w-[2.2rem]">
              <span>{countdown.seconds.toString().padStart(2, "0")}</span>
              <span className="text-[9px] text-slate-500 ml-0.5">s</span>
            </div>
          </div>
        </div>
      )}

      {/* User Balances */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-[#0d0d20] rounded-xl border border-[#1e1e3a] text-xs">
        <div>
          <span className="text-slate-400 block mb-0.5">PT Balance</span>
          <span className="font-bold text-blue-400 font-mono text-sm">
            {formatAmount(position.ptBalance)} PT
          </span>
        </div>
        <div>
          <span className="text-slate-400 block mb-0.5">YT Balance</span>
          <span className="font-bold text-emerald-400 font-mono text-sm">
            {formatAmount(position.ytBalance)} YT
          </span>
        </div>
      </div>

      {/* Actions dependent on lifecycle stage */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {position.settled ? (
          <>
            {/* YT fee breakdown: show before claim button when settled */}
            {position.ytBalance > 0 && (() => {
              const usdcPerYt = position.usdcPerYt;
              const grossUsdcAmt = position.ytBalance * usdcPerYt;
              const feeUsdcAmt   = grossUsdcAmt * 0.01;
              const netUsdcAmt   = grossUsdcAmt * 0.99;
              return (
                <div className="px-3 py-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/30 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross yield</span>
                    <span className="text-white font-mono">${grossUsdcAmt.toFixed(4)} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 flex items-center gap-1">
                      Clearinghouse fee
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-700/60 text-slate-400 border border-slate-600/30">1.0%</span>
                    </span>
                    <span className="text-slate-400 font-mono">−${feeUsdcAmt.toFixed(4)} USDC</span>
                  </div>
                  <div className="flex justify-between border-t border-emerald-800/30 pt-1">
                    <span className="font-semibold text-emerald-400">You receive</span>
                    <span className="font-bold text-emerald-400 font-mono">${netUsdcAmt.toFixed(4)} USDC</span>
                  </div>
                </div>
              );
            })()}

            <button
              onClick={handleRedeemPt}
              disabled={loadingAction !== null || position.ptBalance <= 0}
              className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
            >
              {loadingAction === "redeem_pt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>Redeem PT</span>
            </button>

            <button
              onClick={handleClaimYt}
              disabled={loadingAction !== null || position.ytBalance <= 0}
              className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
            >
              {loadingAction === "claim_yt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trophy className="w-3.5 h-3.5" />}
              <span>Claim YT</span>
            </button>
          </>
        ) : isMatured ? (
          <button
            onClick={handleSettle}
            disabled={loadingAction !== null}
            className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
          >
            {loadingAction === "settle" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coins className="w-3.5 h-3.5" />}
            <span>Settle Vault (Permissionless)</span>
          </button>
        ) : (
          <button
            onClick={handleWithdraw}
            disabled={loadingAction !== null || Math.min(position.ptBalance, position.ytBalance) <= 0}
            className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-[#1a1a36] border border-[#2a2a50] hover:bg-[#252548] text-white transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
          >
            {loadingAction === "withdraw" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
            <span>Withdraw Early (Recombine)</span>
          </button>
        )}
      </div>

      {/* Action Notification */}
      {message && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              : "bg-red-950/40 border-red-800/60 text-red-300"
          }`}
        >
          <span>{message.text}</span>
          {message.tx && (
            <a
              href={getExplorerUrl("tx", message.tx)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-white font-medium shrink-0"
            >
              Explorer ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
