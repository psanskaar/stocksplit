"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getExplorerUrl } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Radio,
  Sparkles,
  X,
} from "lucide-react";

export function DemoBanner() {
  const { publicKey } = useWallet();
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
    tx?: string;
  } | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleFaucet = async () => {
    if (!publicKey) {
      setMessage({ text: "Please connect your wallet first.", type: "error" });
      return;
    }
    setFaucetLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet request failed");
      setMessage({
        text: "Success! 50 mock SPYx & devnet SOL sent to your wallet.",
        type: "success",
        tx: data.signature,
      });
      window.dispatchEvent(new Event("stocksplit_balance_updated"));
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleAirdropPosition = async () => {
    if (!publicKey) {
      setMessage({ text: "Please connect your wallet first.", type: "error" });
      return;
    }
    setAirdropLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/airdrop-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Airdrop request failed");
      setMessage({
        text: data.message || "Demo position ready! You hold PT-SPYx & YT-SPYx.",
        type: "success",
        tx: data.ytSignature || data.ptSignature,
      });
      window.dispatchEvent(new Event("stocksplit_balance_updated"));
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setAirdropLoading(false);
    }
  };

  return (
    <div className="w-full bg-[#101026] border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl relative backdrop-blur-md">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Info Section */}
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                Devnet Faucet & Position Dispenser
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                Devnet
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Claim test SPYx stock and pre-funded PT/YT positions to test instant splitting, Meteora swaps, and vault settlement.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleFaucet}
            disabled={faucetLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-all shadow-md hover:shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
          >
            {faucetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Get 50 test SPYx</span>
          </button>

          <button
            onClick={handleAirdropPosition}
            disabled={airdropLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#181838] border border-indigo-500/40 text-indigo-200 hover:bg-[#202048] hover:text-white transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {airdropLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
            <span>Get demo position</span>
          </button>
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div
          className={`mt-3.5 pt-3 border-t text-xs flex items-center justify-between gap-2 ${
            message.type === "success"
              ? "border-emerald-800/60 text-emerald-300"
              : "border-red-800/60 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>

          {message.tx && (
            <a
              href={getExplorerUrl("tx", message.tx)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline text-white hover:text-indigo-200 shrink-0 flex items-center gap-1"
            >
              <span>Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
