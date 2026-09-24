"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { DemoBanner } from "@/components/demo-banner";
import { usePtPool } from "@/hooks/use-pt-pool";
import { useYtPool } from "@/hooks/use-yt-pool";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useSpyxPrice } from "@/hooks/use-spyx-price";
import { useVault } from "@/hooks/use-vault";
import {
  MOCK_PT_MINT,
  MOCK_YT_MINT,
  USDC_MINT,
  PT_DAMM_POOL,
  YT_DAMM_POOL,
  DEMO_VAULT_PDA,
} from "@/lib/constants";
import { formatAmount, formatCurrency, getExplorerUrl, shortenAddress } from "@/lib/utils";
import BN from "bn.js";
import {
  ArrowDownUp,
  ExternalLink,
  Info,
  Loader2,
  TrendingUp,
  Wallet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function TradePage() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const ptPool = usePtPool();
  const ytPool = useYtPool();
  const { spyxPrice } = useSpyxPrice();
  const vault = useVault(DEMO_VAULT_PDA);

  const { balance: usdcBalance, refetch: refetchUsdc } = useTokenBalance(USDC_MINT, false, 6);
  const { balance: ptBalance, refetch: refetchPt } = useTokenBalance(MOCK_PT_MINT, false, 6);
  const { balance: ytBalance, refetch: refetchYt } = useTokenBalance(MOCK_YT_MINT, false, 6);

  // Left Panel (PT Swap) State
  const [ptInputAmount, setPtInputAmount] = useState("533");
  const [ptSwapDirection, setPtSwapDirection] = useState<"usdc_to_pt" | "pt_to_usdc">("usdc_to_pt");
  const [ptLoading, setPtLoading] = useState(false);
  const [ptResult, setPtResult] = useState<{ type: "success" | "error"; text: string; tx?: string } | null>(null);

  // Right Panel (YT Swap) State
  const [ytInputAmount, setYtInputAmount] = useState("5");
  const [ytSwapDirection, setYtSwapDirection] = useState<"usdc_to_yt" | "yt_to_usdc">("usdc_to_yt");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytResult, setYtResult] = useState<{ type: "success" | "error"; text: string; tx?: string } | null>(null);

  // Internal safe slippage buffer (2.5% for robust devnet execution without requiring manual configuration)
  const DEFAULT_SLIPPAGE_RATE = 0.025;

  // =========================================================================
  // LIVE AMM CONSTANT PRODUCT CALCULATIONS (PT DAMM v2 Pool)
  // Devnet pool: tokenAAmount (PT), tokenBAmount (USDC), fee = 100 bps (1%)
  // =========================================================================
  const PT_POOL_FEE_RATE = 0.01;
  const numPtInput = parseFloat(ptInputAmount) || 0;

  let estPtOutput = 0;
  let ptPriceImpact = 0;
  let minPtOutput = 0;

  if (numPtInput > 0 && ptPool.tokenAAmount > 0 && ptPool.tokenBAmount > 0) {
    const netIn = numPtInput * (1 - PT_POOL_FEE_RATE);
    if (ptSwapDirection === "usdc_to_pt") {
      // In: USDC (Token B), Out: PT (Token A)
      const reserveIn = ptPool.tokenBAmount;
      const reserveOut = ptPool.tokenAAmount;
      estPtOutput = (reserveOut * netIn) / (reserveIn + netIn);

      const spotPrice = ptPool.tokenBAmount / ptPool.tokenAAmount; // e.g. 5330 / 10 = 533.00 USDC/PT
      const execPrice = estPtOutput > 0 ? numPtInput / estPtOutput : spotPrice;
      ptPriceImpact = Math.max(0, ((execPrice - spotPrice) / spotPrice) * 100);
    } else {
      // In: PT (Token A), Out: USDC (Token B)
      const reserveIn = ptPool.tokenAAmount;
      const reserveOut = ptPool.tokenBAmount;
      estPtOutput = (reserveOut * netIn) / (reserveIn + netIn);

      const spotPrice = ptPool.tokenBAmount / ptPool.tokenAAmount;
      const execPrice = numPtInput > 0 ? estPtOutput / numPtInput : spotPrice;
      ptPriceImpact = Math.max(0, ((spotPrice - execPrice) / spotPrice) * 100);
    }
    minPtOutput = estPtOutput * (1 - DEFAULT_SLIPPAGE_RATE);
  }

  // Implied Discount from vault multiplier math: 1 - (m0 / m1)
  // This is the real financial discount: how much cheaper PT is vs NAV based on dividend yield
  const ptDiscount = vault.currentMultiplier > 0
    ? (1 - vault.multiplierAtDeposit / vault.currentMultiplier) * 100
    : 0;

  // =========================================================================
  // LIVE AMM CONSTANT PRODUCT CALCULATIONS (YT DAMM v2 Pool)
  // Devnet pool: tokenAAmount (YT), tokenBAmount (USDC), fee = 100 bps (1%)
  // =========================================================================
  const YT_POOL_FEE_RATE = 0.01;
  const numYtInput = parseFloat(ytInputAmount) || 0;

  let estYtOutput = 0;
  let ytPriceImpact = 0;
  let minYtOutput = 0;

  if (numYtInput > 0 && ytPool.tokenAAmount > 0 && ytPool.tokenBAmount > 0) {
    const netIn = numYtInput * (1 - YT_POOL_FEE_RATE);
    if (ytSwapDirection === "usdc_to_yt") {
      // In: USDC (Token B), Out: YT (Token A)
      const reserveIn = ytPool.tokenBAmount;
      const reserveOut = ytPool.tokenAAmount;
      estYtOutput = (reserveOut * netIn) / (reserveIn + netIn);

      const spotPrice = ytPool.tokenBAmount / ytPool.tokenAAmount; // e.g. 175 / 25 = 7.00 USDC/YT
      const execPrice = estYtOutput > 0 ? numYtInput / estYtOutput : spotPrice;
      ytPriceImpact = Math.max(0, ((execPrice - spotPrice) / spotPrice) * 100);
    } else {
      // In: YT (Token A), Out: USDC (Token B)
      const reserveIn = ytPool.tokenAAmount;
      const reserveOut = ytPool.tokenBAmount;
      estYtOutput = (reserveOut * netIn) / (reserveIn + netIn);

      const spotPrice = ytPool.tokenBAmount / ytPool.tokenAAmount;
      const execPrice = numYtInput > 0 ? estYtOutput / numYtInput : spotPrice;
      ytPriceImpact = Math.max(0, ((spotPrice - execPrice) / spotPrice) * 100);
    }
    minYtOutput = estYtOutput * (1 - DEFAULT_SLIPPAGE_RATE);
  }

  // Implied Yield from vault multiplier math: (m1 - m0) / m1
  // This equals the PT discount — two sides of the same yield strip
  const ytYieldApy = vault.currentMultiplier > 0
    ? ((vault.currentMultiplier - vault.multiplierAtDeposit) / vault.currentMultiplier) * 100
    : 0;

  // Execute PT Swap (DAMM v2)
  const handlePtSwap = async () => {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    if (numPtInput <= 0) return;

    setPtLoading(true);
    setPtResult(null);

    try {
      const inToken = ptSwapDirection === "usdc_to_pt" ? USDC_MINT : MOCK_PT_MINT;
      const rawIn = new BN(Math.floor(numPtInput * 1e6));
      // Safe slippage threshold:
      const rawMinOut = new BN(Math.max(1, Math.floor(minPtOutput * 1e6)));

      const sig = await ptPool.swap(inToken, rawIn, rawMinOut);
      setPtResult({
        type: "success",
        text: `Swapped ${numPtInput} ${ptSwapDirection === "usdc_to_pt" ? "USDC" : "PT-SPYx"} successfully!`,
        tx: sig,
      });

      // Instantly update balances across the entire app
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stocksplit_balance_updated"));
      }
      await Promise.all([
        refetchUsdc(),
        refetchPt(),
        refetchYt(),
        ptPool.refetch(),
        ytPool.refetch(),
      ]);
    } catch (err: any) {
      setPtResult({
        type: "error",
        text: err.message || "Swap failed",
      });
    } finally {
      setPtLoading(false);
    }
  };

  // Execute YT Swap (DAMM v2)
  const handleYtSwap = async () => {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    if (numYtInput <= 0) return;

    setYtLoading(true);
    setYtResult(null);

    try {
      const inToken = ytSwapDirection === "usdc_to_yt" ? USDC_MINT : MOCK_YT_MINT;
      const rawIn = new BN(Math.floor(numYtInput * 1e6));
      // Safe slippage threshold:
      const rawMinOut = new BN(Math.max(1, Math.floor(minYtOutput * 1e6)));

      const sig = await ytPool.swap(inToken, rawIn, rawMinOut);
      setYtResult({
        type: "success",
        text: `Swapped ${numYtInput} ${ytSwapDirection === "usdc_to_yt" ? "USDC" : "YT-SPYx"} successfully!`,
        tx: sig,
      });

      // Instantly update balances across the entire app
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stocksplit_balance_updated"));
      }
      await Promise.all([
        refetchUsdc(),
        refetchPt(),
        refetchYt(),
        ptPool.refetch(),
        ytPool.refetch(),
      ]);
    } catch (err: any) {
      setYtResult({
        type: "error",
        text: err.message || "Swap failed",
      });
    } finally {
      setYtLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <DemoBanner />

      {/* Title */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Trade PT & YT
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          Execute real swaps on devnet. Trade Principal Tokens and Yield Tokens directly via Meteora DAMM v2 pools.
        </p>
      </div>

      {/* Info Banner */}
      <div className="glass-panel p-4 rounded-xl border border-indigo-900/40 flex items-start gap-3 text-xs text-slate-300 max-w-4xl mx-auto">
        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Live On-Chain Meteora Pools: </span>
          PT and YT are newly minted instruments tradeable directly on devnet. These pools have seeded initial liquidity. On mainnet, liquidity deepens automatically as users split their tokenized stocks.
        </div>
      </div>

      {/* Dual Trading Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {/* LEFT PANEL: PT-SPYx / USDC (Meteora DAMM v2) */}
        <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-blue-900/40 shadow-pt-glow space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1e1e3a]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  <h2 className="text-lg font-bold text-white">PT-SPYx / USDC</h2>
                </div>
                <span className="text-xs text-blue-400 font-medium">Meteora DAMM v2 Pool</span>
              </div>
              <a
                href={getExplorerUrl("address", PT_DAMM_POOL.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                Pool: {shortenAddress(PT_DAMM_POOL)} <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Live Pool Liquidity Depth Badge */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${ptPool.loading ? "bg-slate-500 animate-pulse" : ptPool.error ? "bg-red-400" : "bg-blue-400"}`} />
                {ptPool.loading ? "Loading Pool..." : ptPool.error ? "Pool Unavailable" : "Live Pool Reserves"}
              </span>
              {!ptPool.loading && !ptPool.error && (
              <span className="font-mono text-slate-200 font-medium">
                {ptPool.tokenAAmount.toFixed(1)} PT / ${ptPool.tokenBAmount.toLocaleString()} USDC
                <span className="text-slate-500 text-[11px] ml-1">(${ptPool.tvl.toLocaleString()} TVL)</span>
              </span>
              )}
            </div>

            {/* Price & Stats */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Pool Spot Price</span>
                {ptPool.loading ? (
                  <span className="text-xl font-bold text-slate-600 font-mono animate-pulse">---.--</span>
                ) : (
                <span className="text-xl font-bold text-white font-mono">
                  ${ptPool.price.toFixed(2)}
                </span>
                )}
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Meteora DAMM v2
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">Discount to NAV</span>
                {vault.loading ? (
                  <span className="text-xl font-bold text-slate-600 font-mono animate-pulse">--.--% </span>
                ) : (
                <span className="text-xl font-bold text-blue-400 font-mono">
                  {ptDiscount.toFixed(2)}%
                </span>
                )}
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  1 - (m₀/m₁) · vault yield
                </span>
              </div>
            </div>

            {/* Swap Inputs */}
            <div className="space-y-3">
              <div className="p-3 bg-[#0d0d20] rounded-xl border border-[#1e1e3a] space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Pay</span>
                  <span>
                    Balance:{" "}
                    {ptSwapDirection === "usdc_to_pt"
                      ? `${formatAmount(usdcBalance)} USDC`
                      : `${formatAmount(ptBalance)} PT`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    value={ptInputAmount}
                    onChange={(e) => setPtInputAmount(e.target.value)}
                    className="w-full bg-transparent text-xl font-bold text-white focus:outline-none"
                    placeholder="0.00"
                    min="0"
                  />
                  <span className="font-bold text-sm text-slate-200 ml-2">
                    {ptSwapDirection === "usdc_to_pt" ? "USDC" : "PT-SPYx"}
                  </span>
                </div>
              </div>

              {/* Direction Toggle */}
              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={() =>
                    setPtSwapDirection(
                      ptSwapDirection === "usdc_to_pt" ? "pt_to_usdc" : "usdc_to_pt"
                    )
                  }
                  className="p-2 rounded-lg bg-[#1a1a36] border border-[#2a2a50] text-slate-300 hover:text-white transition-colors shadow-sm"
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-3 bg-[#0d0d20] rounded-xl border border-[#1e1e3a] space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Receive (AMM Constant Product)</span>
                  <span>
                    Balance:{" "}
                    {ptSwapDirection === "usdc_to_pt" ? (
                      <span>
                        {formatAmount(ptBalance)} PT
                        {ptBalance === 0 && (
                          <Link href="/split" className="text-blue-400 hover:underline ml-1">
                            (Split SPYx →)
                          </Link>
                        )}
                      </span>
                    ) : (
                      `${formatAmount(usdcBalance)} USDC`
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xl font-bold text-blue-400 font-mono">
                    ~{estPtOutput.toFixed(4)}
                  </div>
                  <span className="font-bold text-sm text-slate-200 ml-2">
                    {ptSwapDirection === "usdc_to_pt" ? "PT-SPYx" : "USDC"}
                  </span>
                </div>
              </div>

              {/* Execution Details: Price Impact */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0b0b1a] border border-[#1a1a32] text-xs">
                <span className="text-slate-400">Price Impact:</span>
                <span
                  className={`font-mono font-bold ${
                    ptPriceImpact > 5
                      ? "text-amber-400"
                      : ptPriceImpact > 1
                      ? "text-yellow-400"
                      : "text-emerald-400"
                  }`}
                >
                  {ptPriceImpact.toFixed(2)}%
                  {ptPriceImpact > 5 && (
                    <span className="text-[10px] text-amber-500/90 font-normal ml-1">
                      (Devnet Depth)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* PT Action Button & Result */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handlePtSwap}
              disabled={ptLoading || numPtInput <= 0}
              className="w-full py-3 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-pt-glow transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {ptLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Swapping on DAMM v2...</span>
                </>
              ) : (
                <span>Swap {ptSwapDirection === "usdc_to_pt" ? "USDC → PT" : "PT → USDC"}</span>
              )}
            </button>

            {ptResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  ptResult.type === "success"
                    ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                    : "bg-red-950/40 border-red-800/60 text-red-300"
                }`}
              >
                <span>{ptResult.text}</span>
                {ptResult.tx && (
                  <a
                    href={getExplorerUrl("tx", ptResult.tx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-white shrink-0 font-medium"
                  >
                    Explorer ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: YT-SPYx / USDC (Meteora DAMM v2) */}
        <div className="glass-panel p-6 sm:p-7 rounded-2xl border border-emerald-900/40 shadow-yt-glow space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1e1e3a]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  <h2 className="text-lg font-bold text-white">YT-SPYx / USDC</h2>
                </div>
                <span className="text-xs text-emerald-400 font-medium">
                  Meteora DAMM v2 Pool
                </span>
              </div>
              <a
                href={getExplorerUrl("address", YT_DAMM_POOL.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                Pool: {shortenAddress(YT_DAMM_POOL)} <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Live Pool Liquidity Depth Badge */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${ytPool.loading ? "bg-slate-500 animate-pulse" : ytPool.error ? "bg-red-400" : "bg-emerald-400"}`} />
                {ytPool.loading ? "Loading Pool..." : ytPool.error ? "Pool Unavailable" : "Live Pool Reserves"}
              </span>
              {!ytPool.loading && !ytPool.error && (
              <span className="font-mono text-slate-200 font-medium">
                {ytPool.tokenAAmount.toFixed(1)} YT / ${ytPool.tokenBAmount.toLocaleString()} USDC
                <span className="text-slate-500 text-[11px] ml-1">(${ytPool.tvl.toLocaleString()} TVL)</span>
              </span>
              )}
            </div>

            {/* Price & Stats */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#0d0d20] border border-[#1e1e3a] text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Pool Spot Price</span>
                {ytPool.loading ? (
                  <span className="text-xl font-bold text-slate-600 font-mono animate-pulse">---.--</span>
                ) : (
                <span className="text-xl font-bold text-white font-mono">
                  ${ytPool.price.toFixed(2)}
                </span>
                )}
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Meteora DAMM v2
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">Implied Yield</span>
                {vault.loading ? (
                  <span className="text-xl font-bold text-slate-600 font-mono animate-pulse">--.--% APY</span>
                ) : (
                <span className="text-xl font-bold text-emerald-400 font-mono">
                  {ytYieldApy.toFixed(2)}% APY
                </span>
                )}
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  (m₁-m₀)/m₁ · dividend accrual
                </span>
              </div>
            </div>

            {/* Swap Inputs */}
            <div className="space-y-3">
              <div className="p-3 bg-[#0d0d20] rounded-xl border border-[#1e1e3a] space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Pay</span>
                  <span>
                    Balance:{" "}
                    {ytSwapDirection === "usdc_to_yt"
                      ? `${formatAmount(usdcBalance)} USDC`
                      : `${formatAmount(ytBalance)} YT`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    value={ytInputAmount}
                    onChange={(e) => setYtInputAmount(e.target.value)}
                    className="w-full bg-transparent text-xl font-bold text-white focus:outline-none"
                    placeholder="0.00"
                    min="0"
                  />
                  <span className="font-bold text-sm text-slate-200 ml-2">
                    {ytSwapDirection === "usdc_to_yt" ? "USDC" : "YT-SPYx"}
                  </span>
                </div>
              </div>

              {/* Direction Toggle */}
              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={() =>
                    setYtSwapDirection(
                      ytSwapDirection === "usdc_to_yt" ? "yt_to_usdc" : "usdc_to_yt"
                    )
                  }
                  className="p-2 rounded-lg bg-[#1a1a36] border border-[#2a2a50] text-slate-300 hover:text-white transition-colors shadow-sm"
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-3 bg-[#0d0d20] rounded-xl border border-[#1e1e3a] space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Receive</span>
                  <span>
                    Balance:{" "}
                    {ytSwapDirection === "usdc_to_yt" ? (
                      <span>
                        {formatAmount(ytBalance)} YT
                        {ytBalance === 0 && (
                          <Link href="/split" className="text-emerald-400 hover:underline ml-1">
                            (Split SPYx →)
                          </Link>
                        )}
                      </span>
                    ) : (
                      `${formatAmount(usdcBalance)} USDC`
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xl font-bold text-emerald-400 font-mono">
                    ~{estYtOutput.toFixed(4)}
                  </div>
                  <span className="font-bold text-sm text-slate-200 ml-2">
                    {ytSwapDirection === "usdc_to_yt" ? "YT-SPYx" : "USDC"}
                  </span>
                </div>
              </div>

              {/* Execution Details: Price Impact */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0b0b1a] border border-[#1a1a32] text-xs">
                <span className="text-slate-400">Price Impact:</span>
                <span
                  className={`font-mono font-bold ${
                    ytPriceImpact > 5
                      ? "text-amber-400"
                      : ytPriceImpact > 1
                      ? "text-yellow-400"
                      : "text-emerald-400"
                  }`}
                >
                  {ytPriceImpact.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* YT Action Button & Result */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleYtSwap}
              disabled={ytLoading || numYtInput <= 0}
              className="w-full py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-yt-glow transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {ytLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Swapping on Meteora DAMM...</span>
                </>
              ) : (
                <span>Swap {ytSwapDirection === "usdc_to_yt" ? "USDC → YT" : "YT → USDC"}</span>
              )}
            </button>

            {ytResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  ytResult.type === "success"
                    ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                    : "bg-red-950/40 border-red-800/60 text-red-300"
                }`}
              >
                <span>{ytResult.text}</span>
                {ytResult.tx && (
                  <a
                    href={getExplorerUrl("tx", ytResult.tx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-white shrink-0 font-medium"
                  >
                    Explorer ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
