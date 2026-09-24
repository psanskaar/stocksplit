"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useStockSplitProgram } from "@/hooks/use-stocksplit-program";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useSpyxPrice } from "@/hooks/use-spyx-price";
import { MOCK_SPYX_MINT, USDC_MINT } from "@/lib/constants";
import { formatAmount, formatCurrency, getExplorerUrl } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Loader2, Sparkles, Wallet, ArrowRight } from "lucide-react";
import { SplitSuccessModal, SplitSuccessData } from "./split-success-modal";

// Configurable maturity options. Easily add or remove options here.
const MATURITY_OPTIONS = [
  { id: "30d", label: "30 Days", days: 30 },
  { id: "90d", label: "90 Days", days: 90 },
  { id: "180d", label: "180 Days", days: 180 },
  { id: "365d", label: "365 Days", days: 365 },
  // [DEV ONLY] 1-Min rapid test option (to remove: delete this single line)
  { id: "1m_dev", label: "1 Min", days: 1 / 1440, isDev: true },
];

export function SplitForm() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { split } = useStockSplitProgram();
  const { balance: spyxBalance, refetch: refetchSpyx } = useTokenBalance(MOCK_SPYX_MINT, true, 6);
  const { spyxPrice } = useSpyxPrice();

  const [amount, setAmount] = useState("10");
  const [selectedMaturityId, setSelectedMaturityId] = useState<string>("30d");
  const [loading, setLoading] = useState(false);
  const [splitStage, setSplitStage] = useState<"idle" | "preparing" | "signing" | "confirming">("idle");
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string; tx?: string } | null>(null);
  const [successData, setSuccessData] = useState<SplitSuccessData | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  const selectedMaturity =
    MATURITY_OPTIONS.find((o) => o.id === selectedMaturityId) || MATURITY_OPTIONS[0];
  const maturityDays = selectedMaturity.days;

  // Listen for external balance updates (e.g. from faucet or banner)
  useEffect(() => {
    const handleUpdate = () => {
      refetchSpyx();
    };
    window.addEventListener("stocksplit_balance_updated", handleUpdate);
    return () => window.removeEventListener("stocksplit_balance_updated", handleUpdate);
  }, [refetchSpyx]);

  const numAmount = parseFloat(amount) || 0;
  const rawAmount = Math.floor(numAmount * 1e6);
  const usdValue = numAmount * spyxPrice;

  // Protocol split fee: 10 bps (0.10%) — matches on-chain: fee_raw = amount × 10 / 10_000
  const feeAmount = numAmount * 0.001;
  const effectiveAmount = numAmount - feeAmount; // PT and YT actually received

  // Dynamic ticker for DEV mode so displayed countdown/timestamp never grows stale
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!selectedMaturity.isDev) return;
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedMaturity.isDev]);

  // Estimated dividend payout:
  // For the dev 1-min option, display standard 1.30% benchmark dividend yield so test displays realistic payout
  const dividendYieldRate = selectedMaturity.isDev ? 0.013 : 0.013 * (maturityDays / 365);
  const estUsdcYield = usdValue * dividendYieldRate;

  // Stable maturity timestamp (with 120s buffer for dev mode to allow signing time + live countdown)
  const maturityTimestamp = useMemo(() => {
    if (selectedMaturity.isDev) {
      return nowSec + 120;
    }
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000) + Math.round(selectedMaturity.days * 86400);
  }, [selectedMaturity, nowSec]);

  const maturityDateStr = useMemo(() => {
    if (selectedMaturity.isDev) {
      return (
        new Date(maturityTimestamp * 1000).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " (~2 min dev timer)"
      );
    }
    return new Date(maturityTimestamp * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [maturityTimestamp, selectedMaturity]);

  const handleQuickFaucet = async () => {
    if (!publicKey) return;
    setFaucetLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58(), assetType: "spyx" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet failed");
      setResult({
        type: "success",
        text: "Delivered 50 mock SPYx to your wallet!",
        tx: data.signature,
      });
      window.dispatchEvent(new Event("stocksplit_balance_updated"));
      await refetchSpyx();
    } catch (err: any) {
      setResult({ type: "error", text: err.message });
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleSplit = async () => {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    if (numAmount <= 0) {
      setResult({ type: "error", text: "Please enter a valid SPYx amount." });
      return;
    }
    if (numAmount > spyxBalance) {
      setResult({
        type: "error",
        text: `Insufficient SPYx balance. You have ${formatAmount(spyxBalance)} SPYx. Click "Get 50 test SPYx" above!`,
      });
      return;
    }

    // For DEV option, ensure a guaranteed fresh timestamp at the exact moment Split is clicked
    const activeMaturity = selectedMaturity.isDev
      ? Math.floor(Date.now() / 1000) + 120
      : maturityTimestamp;

    const activeMaturityDateStr = selectedMaturity.isDev
      ? new Date(activeMaturity * 1000).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " (~2 min dev timer)"
      : maturityDateStr;

    setLoading(true);
    setSplitStage("preparing");
    setResult(null);

    try {
      // Execute atomic split: initializes vault if new, deposits in ONE single transaction
      const { signature, vaultPda } = await split(
        rawAmount,
        activeMaturity,
        MOCK_SPYX_MINT,
        1.0,
        USDC_MINT,
        () => setSplitStage("signing"),
        () => setSplitStage("confirming")
      );

      // Save vault PDA to localStorage so it appears on Redeem page under Your Positions
      try {
        const saved = JSON.parse(localStorage.getItem("stocksplit_user_vaults") || "[]");
        const pdaStr = vaultPda.toBase58();
        if (!saved.includes(pdaStr)) {
          localStorage.setItem("stocksplit_user_vaults", JSON.stringify([...saved, pdaStr]));
        }
        window.dispatchEvent(new Event("stocksplit_balance_updated"));
      } catch {}

      // Open Success Modal Popup with all decomposition details
      setSuccessData({
        spyxAmount: numAmount,
        usdValue,
        ptAmount: numAmount,
        ytAmount: numAmount,
        maturityDays: selectedMaturity.isDev ? 0 : Math.round(selectedMaturity.days),
        maturityDate: activeMaturityDateStr,
        estUsdcYield,
        vaultPda: vaultPda.toBase58(),
        txSignature: signature,
      });
      setIsSuccessModalOpen(true);

      setResult({
        type: "success",
        text: `Successfully split ${formatAmount(numAmount)} SPYx into ${formatAmount(numAmount)} PT-SPYx and ${formatAmount(numAmount)} YT-SPYx!`,
        tx: signature,
      });

      await refetchSpyx();
    } catch (err: any) {
      setResult({
        type: "error",
        text: err.message || "Split transaction failed.",
      });
    } finally {
      setLoading(false);
      setSplitStage("idle");
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto glass-panel p-6 sm:p-8 rounded-2xl border border-[#1e1e3a] shadow-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Split SPYx</h2>
          <p className="text-xs text-slate-400 mt-1">
            Split S&P 500 into Principal (discount) and Yield (dividends).
          </p>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#1a1a36] text-slate-300 border border-[#2a2a50]">
          Token-2022
        </span>
      </div>

      {/* Input Section */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Amount to Split</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                Balance:{" "}
                <button
                  type="button"
                  onClick={() => setAmount(spyxBalance.toString())}
                  className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                >
                  {formatAmount(spyxBalance)} SPYx
                </button>
              </span>
              {spyxBalance <= 0 && connected && (
                <button
                  type="button"
                  onClick={handleQuickFaucet}
                  disabled={faucetLoading}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {faucetLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                  <span>+ Claim 50 SPYx</span>
                </button>
              )}
            </div>
          </div>

          <div className="relative flex items-center bg-[#0d0d20] rounded-xl border border-[#1e1e3a] focus-within:border-primary transition-colors p-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="any"
              className="w-full bg-transparent text-xl sm:text-2xl font-bold text-white placeholder-slate-600 focus:outline-none"
            />
            <div className="flex items-center gap-2 pl-3 border-l border-[#1e1e3a]">
              <span className="font-bold text-sm text-slate-200">SPYx</span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 mt-1">
            ≈ {formatCurrency(usdValue)}
          </div>
        </div>

        {/* Maturity Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Select Maturity</label>
            {selectedMaturity.isDev && (
              <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1 font-semibold">
                <span>⚡ DEV MODE: Matures in ~2 mins for live countdown testing</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {MATURITY_OPTIONS.map((opt) => {
              const isSelected = selectedMaturity.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedMaturityId(opt.id)}
                  className={`py-2 px-1 text-xs font-semibold rounded-lg border transition-all flex items-center justify-center gap-1 ${
                    isSelected
                      ? opt.isDev
                        ? "bg-amber-500 text-amber-950 border-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                        : "bg-primary text-white border-primary shadow-primary-glow"
                      : opt.isDev
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                      : "bg-[#12122a] text-slate-300 border-[#1e1e3a] hover:bg-[#1a1a36]"
                  }`}
                >
                  {opt.isDev && <span className="text-[11px]">⚡</span>}
                  <span>{opt.label}</span>
                  {opt.isDev && (
                    <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-400/25 border border-amber-400/40 text-amber-300 font-bold">
                      DEV
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Output Preview */}
        <div className="p-4 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] space-y-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            You will receive:
          </span>

          <div className="space-y-2.5">
            {/* Fee line */}
            <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Protocol fee</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 border border-slate-600/30">
                  0.10%
                </span>
              </div>
              <span className="text-slate-400 font-mono">
                {numAmount > 0 ? feeAmount.toFixed(4) : "0.0000"} SPYx
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="font-semibold text-blue-400">
                  {numAmount > 0 ? formatAmount(effectiveAmount) : "0.00"} PT-SPYx
                </span>
              </div>
              <span className="text-slate-400">
                Redeem for ~{numAmount > 0 ? formatAmount(effectiveAmount) : "0.00"} SPYx at maturity
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-emerald-400">
                  {numAmount > 0 ? formatAmount(effectiveAmount) : "0.00"} YT-SPYx
                </span>
              </div>
              <span className="text-slate-400">
                Claim ~{formatCurrency(estUsdcYield)} USDC at maturity
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#1e1e3a] flex items-center justify-between text-[11px] text-slate-500">
            <span>Vault Multiplier: 1.000000x</span>
            <span>Maturity Date: {maturityDateStr}</span>
          </div>
        </div>
      </div>

      {/* Action Button */}
      {connected ? (
        <button
          onClick={handleSplit}
          disabled={loading || numAmount <= 0}
          className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 shadow-primary-glow transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {splitStage === "preparing" && "Preparing Transaction..."}
                {splitStage === "signing" && "Approve in wallet..."}
                {splitStage === "confirming" && "Confirming on Devnet..."}
                {splitStage === "idle" && "Processing..."}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Split SPYx → PT + YT</span>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={() => setVisible(true)}
          className="w-full py-3.5 rounded-xl font-semibold text-white bg-primary hover:bg-primary-hover shadow-primary-glow transition-all flex items-center justify-center gap-2"
        >
          <Wallet className="w-4 h-4" />
          <span>Connect Wallet to Split</span>
        </button>
      )}

      {/* Result Toast / Alert */}
      {result && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            result.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              : "bg-red-950/40 border-red-800/60 text-red-300"
          }`}
        >
          <div className="flex items-start gap-2">
            {result.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold text-white">{result.text}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {result.tx && (
                  <a
                    href={getExplorerUrl("tx", result.tx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-emerald-400 hover:text-white inline-block"
                  >
                    View transaction on Solana Explorer ↗
                  </a>
                )}
                {result.type === "success" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsSuccessModalOpen(true)}
                      className="text-indigo-300 hover:text-white underline font-semibold cursor-pointer"
                    >
                      View Split Details Modal
                    </button>
                    <Link
                      href="/redeem#positions"
                      className="text-emerald-300 hover:text-white font-semibold underline flex items-center gap-1"
                    >
                      Go to Your Positions →
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Confirmation Modal */}
      <SplitSuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        data={successData}
      />
    </div>
  );
}
