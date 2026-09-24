"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useStockSplitProgram } from "@/hooks/use-stocksplit-program";
import { useVault } from "@/hooks/use-vault";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { DEMO_VAULT_PDA, MOCK_PT_MINT, MOCK_YT_MINT } from "@/lib/constants";
import { formatAmount, getExplorerUrl, shortenAddress } from "@/lib/utils";
import { alignToDevnet } from "@/lib/devnet-align";
import { CheckCircle2, AlertCircle, Loader2, Sparkles, Trophy, ArrowRight, ShieldCheck } from "lucide-react";

export function DemoVaultCard() {
  const { connected, publicKey, wallet } = useWallet();
  const { redeemPt, claimYt } = useStockSplitProgram();
  const vault = useVault(DEMO_VAULT_PDA);

  const { balance: ptBalance, rawBalance: ptRaw, refetch: refetchPt } = useTokenBalance(MOCK_PT_MINT, false, 6);
  const { balance: ytBalance, rawBalance: ytRaw, refetch: refetchYt } = useTokenBalance(MOCK_YT_MINT, false, 6);

  const [ptLoading, setPtLoading] = useState(false);
  const [ytLoading, setYtLoading] = useState(false);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string; tx?: string } | null>(null);

  const hasPt = ptBalance > 0;
  const hasYt = ytBalance > 0;

  // Use live on-chain vault data instead of hardcoded values
  const multiplierRatio = vault.currentMultiplier > 0 ? vault.multiplierAtDeposit / vault.currentMultiplier : 1 / 1.013;
  const expectedSpyx = hasPt ? (ptBalance * multiplierRatio).toFixed(4) : "0.0000";

  // YT payout from on-chain usdc_per_yt (read live from vault PDA)
  const usdcPerYt = vault.usdcPerYt > 0 ? vault.usdcPerYt : 0;
  const grossUsdc = hasYt ? ytBalance * usdcPerYt : 0;
  const feeUsdc   = grossUsdc * 0.01;
  const netUsdc   = grossUsdc * 0.99;
  const expectedUsdc = grossUsdc.toFixed(2);
  const netUsdcStr   = netUsdc.toFixed(2);
  const feeUsdcStr   = feeUsdc.toFixed(2);

  const handleAirdrop = async () => {
    if (!publicKey) return;
    setAirdropLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/airdrop-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Airdrop failed");
      setResult({
        type: "success",
        text: "Demo position airdropped! You received 18.5 PT and 18.5 YT.",
        tx: data.ytSignature || data.ptSignature,
      });
      await refetchPt();
      await refetchYt();
    } catch (err: any) {
      setResult({ type: "error", text: err.message });
    } finally {
      setAirdropLoading(false);
    }
  };

  const handleRedeemPt = async () => {
    if (!connected || !publicKey) return;
    const rawToRedeem = Math.min(Number(ptRaw), 18_500_000);
    if (rawToRedeem <= 0) {
      setResult({
        type: "error",
        text: "You do not have PT tokens in your wallet. Click 'Get demo position' above!",
      });
      return;
    }

    setPtLoading(true);
    setResult(null);
    try {
      await alignToDevnet(wallet);
      const txSig = await redeemPt(rawToRedeem, DEMO_VAULT_PDA);
      setResult({
        type: "success",
        text: `Successfully redeemed ${formatAmount(rawToRedeem)} PT-SPYx for raw SPYx equity!`,
        tx: txSig,
      });
      await refetchPt();
    } catch (err: any) {
      setResult({ type: "error", text: err.message || "Redeem PT failed" });
    } finally {
      setPtLoading(false);
    }
  };

  const handleClaimYt = async () => {
    if (!connected || !publicKey) return;
    const rawToClaim = Math.min(Number(ytRaw), 18_500_000);
    if (rawToClaim <= 0) {
      setResult({
        type: "error",
        text: "You do not have YT tokens in your wallet. Click 'Get demo position' above!",
      });
      return;
    }

    setYtLoading(true);
    setResult(null);
    try {
      await alignToDevnet(wallet);
      const txSig = await claimYt(rawToClaim, DEMO_VAULT_PDA);
      setResult({
        type: "success",
        text: `Successfully claimed pro-rata USDC dividends! Burned ${formatAmount(rawToClaim)} YT-SPYx.`,
        tx: txSig,
      });
      await refetchYt();
    } catch (err: any) {
      setResult({ type: "error", text: err.message || "Claim YT failed" });
    } finally {
      setYtLoading(false);
    }
  };

  return (
    <div className="w-full glass-panel p-6 sm:p-8 rounded-2xl border border-indigo-500/40 shadow-2xl relative overflow-hidden space-y-6">
      {/* Glow background accent */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1e1e3a]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xl font-bold text-white tracking-tight">Pre-Settled Demo Vault</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Settled
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Vault PDA: <span className="font-mono text-slate-300">{shortenAddress(DEMO_VAULT_PDA, 6)}</span> · Multiplier: 1.000000 → 1.013000
          </p>
        </div>

        {/* Quick Airdrop Button for Judges */}
        {connected && (
          <button
            onClick={handleAirdrop}
            disabled={airdropLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-950/60 border border-indigo-600/50 hover:bg-indigo-900/60 transition-colors self-start sm:self-auto disabled:opacity-50"
          >
            {airdropLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Get demo position →</span>
          </button>
        )}
      </div>

      {/* Interactive Settlement Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: PT Redemption */}
        <div className="p-5 rounded-xl bg-[#0d0d20] border border-blue-900/40 shadow-pt-glow space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                Principal Redemption
              </span>
              <span className="text-xs text-slate-400">
                Your Balance: <strong className="text-white font-mono">{formatAmount(ptBalance)} PT</strong>
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-xl font-bold text-white font-mono">{expectedSpyx} raw SPYx</div>
              <p className="text-xs text-slate-400">
                {hasPt
                  ? `Returns ${expectedSpyx} SPYx at exact multiplier ratio (${vault.multiplierAtDeposit.toFixed(3)} / ${vault.currentMultiplier.toFixed(3)}).`
                  : `Returns SPYx at exact multiplier ratio. You currently have 0.00 PT tokens in your wallet.`}
              </p>
            </div>
          </div>

          <button
            onClick={handleRedeemPt}
            disabled={ptLoading || !connected || !hasPt}
            className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-pt-glow transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:hover:bg-blue-600"
          >
            {ptLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Redeeming...</span>
              </>
            ) : !connected ? (
              <span>Connect Wallet to Redeem</span>
            ) : hasPt ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Redeem {formatAmount(ptBalance)} PT → {expectedSpyx} SPYx</span>
              </>
            ) : (
              <span>No PT to Redeem (0.00 PT)</span>
            )}
          </button>
        </div>

        {/* Right: YT Dividend Claim */}
        <div className="p-5 rounded-xl bg-[#0d0d20] border border-emerald-900/40 shadow-yt-glow space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Yield / Dividend Payout
              </span>
              <span className="text-xs text-slate-400">
                Your Balance: <strong className="text-white font-mono">{formatAmount(ytBalance)} YT</strong>
              </span>
            </div>

            <div className="space-y-1">
              {/* 3-line fee breakdown */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Gross yield</span>
                  <span className="text-white font-mono">${expectedUsdc} USDC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    Clearinghouse fee
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 border border-slate-600/30">
                      1.0%
                    </span>
                  </span>
                  <span className="text-slate-400 font-mono">−${feeUsdcStr} USDC</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#1e1e3a] pt-1.5">
                  <span className="font-semibold text-emerald-400">You receive</span>
                  <span className="text-2xl font-bold text-emerald-400 font-mono">${netUsdcStr}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {hasYt
                  ? `Pro-rata dividend accruals ($${usdcPerYt.toFixed(3)} / YT) settled on-chain. 1% clearinghouse fee retained by protocol.`
                  : "Distributes pro-rata dividend accruals swapped via Jupiter. You currently have 0.00 YT tokens in your wallet."}
              </p>
            </div>
          </div>

          <button
            onClick={handleClaimYt}
            disabled={ytLoading || !connected || !hasYt}
            className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-yt-glow transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:hover:bg-emerald-600"
          >
            {ytLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Claiming...</span>
              </>
            ) : !connected ? (
              <span>Connect Wallet to Claim</span>
            ) : hasYt ? (
              <>
                <Trophy className="w-3.5 h-3.5" />
                <span>Claim {formatAmount(ytBalance)} YT → ${netUsdcStr} USDC</span>
              </>
            ) : (
              <span>No YT to Claim ($0.00)</span>
            )}
          </button>
        </div>
      </div>

      {/* Result Toast */}
      {result && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            result.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              : "bg-red-950/40 border-red-800/60 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {result.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{result.text}</span>
          </div>

          {result.tx && (
            <a
              href={getExplorerUrl("tx", result.tx)}
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
