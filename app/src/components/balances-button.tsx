"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAllBalances } from "@/hooks/use-all-balances";
import { formatAmount, getExplorerUrl, shortenAddress } from "@/lib/utils";
import {
  Coins,
  RefreshCw,
  X,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  LogOut,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export function BalancesButton() {
  const { connected, publicKey, disconnect } = useWallet();
  const { balances, loading, refetch } = useAllBalances();

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  if (!connected || !publicKey) {
    return null;
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFaucetRequest = async (type: "usdc" | "spyx" | "all" | "position") => {
    if (!publicKey) return;
    setActionLoading(type);
    setActionMessage(null);

    try {
      if (type === "position") {
        const res = await fetch("/api/airdrop-position", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to airdrop demo position");
        setActionMessage({
          text: data.message || "Demo PT & YT position added to wallet!",
          type: "success",
        });
      } else {
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: publicKey.toBase58(),
            assetType: type,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Faucet request failed");
        setActionMessage({
          text: data.message || "Test tokens delivered!",
          type: "success",
        });
      }
      await refetch();
    } catch (err: any) {
      setActionMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Extract individual balances
  const solItem = balances.find((b) => b.id === "sol");
  const usdcItem = balances.find((b) => b.symbol === "USDC");
  const spyxItem = balances.find((b) => b.symbol === "SPYx");
  const ptItem = balances.find((b) => b.symbol === "PT-SPYx");
  const ytItem = balances.find((b) => b.symbol === "YT-SPYx");

  const solBal = solItem?.balance || 0;
  const usdcBal = usdcItem?.balance || 0;
  const spyxBal = spyxItem?.balance || 0;
  const ptBal = ptItem?.balance || 0;
  const ytBal = ytItem?.balance || 0;

  return (
    <div className="relative">
      {/* Trigger Button in Navbar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl bg-[#141432] text-slate-200 border border-[#272752] hover:border-emerald-500/50 hover:bg-[#1b1b42] transition-all shadow-sm cursor-pointer group"
      >
        <Coins className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
        <span>Balances</span>
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          ${formatAmount(usdcBal, 0)} USDC
        </span>
      </button>

      {/* Popout Card (Floating directly below navbar) */}
      {isOpen && (
        <>
          {/* Transparent Backdrop to close on click outside */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[360px] bg-[#0c0c1e] border border-[#222244] rounded-2xl shadow-2xl p-4 space-y-3.5 z-50 animate-fadeIn text-slate-200">
            {/* Popout Header */}
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-white text-sm">
                  Devnet Embedded Wallet
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => refetch()}
                  disabled={loading}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  title="Refresh Balances"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`}
                  />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Address
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#131328] border border-[#1e1e3c] text-xs font-mono text-slate-200">
                <span>{shortenAddress(publicKey)}</span>
                <div className="flex items-center gap-2 text-slate-400">
                  <button
                    onClick={() => handleCopy(publicKey.toBase58())}
                    className="hover:text-white transition-colors cursor-pointer"
                    title="Copy Address"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={getExplorerUrl("address", publicKey.toBase58())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-400 transition-colors"
                    title="View on Explorer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Balances Grid */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Balances
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* SOL Gas Card */}
                <div className="p-3 rounded-xl bg-[#131328] border border-[#1e1e3c] space-y-0.5">
                  <div className="text-[11px] text-slate-400 font-medium">
                    SOL Gas
                  </div>
                  <div className="text-base font-bold text-white font-mono">
                    {formatAmount(solBal, 3)}
                  </div>
                </div>

                {/* USDC Card */}
                <div className="p-3 rounded-xl bg-[#131328] border border-[#1e1e3c] space-y-0.5">
                  <div className="text-[11px] text-slate-400 font-medium">
                    USDC
                  </div>
                  <div className="text-base font-bold text-emerald-400 font-mono">
                    {formatAmount(usdcBal, 2)}
                  </div>
                </div>

                {/* SPYx Stock Card */}
                <div className="p-3 rounded-xl bg-[#131328] border border-[#1e1e3c] space-y-0.5">
                  <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                    <span>SPYx Stock</span>
                  </div>
                  <div className="text-base font-bold text-indigo-300 font-mono">
                    {formatAmount(spyxBal, 2)}
                  </div>
                </div>

                {/* PT-SPYx Card */}
                <div className="p-3 rounded-xl bg-[#131328] border border-[#1e1e3c] space-y-0.5">
                  <div className="text-[11px] text-slate-400 font-medium">
                    PT-SPYx
                  </div>
                  <div className="text-base font-bold text-blue-400 font-mono">
                    {formatAmount(ptBal, 2)}
                  </div>
                </div>

                {/* YT-SPYx Card (Full width) */}
                <div className="col-span-2 p-3 rounded-xl bg-[#131328] border border-[#1e1e3c] flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      YT-SPYx Yield
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Entitled to dividend payouts
                    </div>
                  </div>
                  <div className="text-base font-bold text-emerald-400 font-mono">
                    {formatAmount(ytBal, 2)}{" "}
                    <span className="text-xs text-slate-400 font-sans">YT</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Testnet Faucet Refills */}
            <div className="space-y-2 pt-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Testnet Faucet Refills
              </div>

              {/* Two quick buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleFaucetRequest("usdc")}
                  disabled={actionLoading !== null}
                  className="py-2 px-3 rounded-xl bg-[#161633] border border-[#25254a] hover:bg-[#1d1d45] hover:border-emerald-500/40 text-xs font-semibold text-emerald-400 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === "usdc" && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>+ 100 USDC</span>
                </button>

                <button
                  onClick={() => handleFaucetRequest("spyx")}
                  disabled={actionLoading !== null}
                  className="py-2 px-3 rounded-xl bg-[#161633] border border-[#25254a] hover:bg-[#1d1d45] hover:border-indigo-500/40 text-xs font-semibold text-indigo-300 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading === "spyx" && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>+ 50 SPYx</span>
                </button>
              </div>

              {/* Big Teal/Cyan Highlight Button (Refill Both) */}
              <button
                onClick={() => handleFaucetRequest("all")}
                disabled={actionLoading !== null}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-400 hover:from-indigo-400 hover:to-emerald-300 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "all" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Refill Both (100 USDC + 50 SPYx)</span>
              </button>

              {/* Demo Position Refill */}
              <button
                onClick={() => handleFaucetRequest("position")}
                disabled={actionLoading !== null}
                className="w-full py-2 px-3 rounded-xl bg-[#131328] border border-[#222244] hover:bg-[#191936] text-xs font-medium text-indigo-300 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "position" && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>+ Get Demo Position (18.5 PT + 18.5 YT)</span>
              </button>

              {/* Toast Feedback */}
              {actionMessage && (
                <div
                  className={`pt-1 text-[11px] flex items-center gap-1.5 ${
                    actionMessage.type === "success" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {actionMessage.type === "success" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{actionMessage.text}</span>
                </div>
              )}
            </div>

            {/* Bottom Disconnect Button */}
            <div className="pt-2 border-t border-[#1e1e3a]">
              <button
                onClick={() => {
                  disconnect();
                  setIsOpen(false);
                }}
                className="w-full py-2 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect Wallet</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
