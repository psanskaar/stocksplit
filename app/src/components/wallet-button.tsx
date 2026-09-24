"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortenAddress, getExplorerUrl } from "@/lib/utils";
import { alignToDevnet } from "@/lib/devnet-align";
import {
  Wallet,
  LogOut,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

export function WalletButton() {
  const { publicKey, disconnect, connected, connecting, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aligning, setAligning] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);



  const handleCopy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualAlign = async () => {
    setAligning(true);
    try {
      await alignToDevnet(wallet);
    } finally {
      setAligning(false);
    }
  };

  if (!mounted) {
    return (
      <button className="px-4 py-2 text-sm font-medium rounded-xl bg-primary/20 text-primary border border-primary/30">
        Connect Wallet
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl bg-[#1a1a36] text-slate-200 border border-[#2a2a50] hover:border-primary/50 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{shortenAddress(publicKey)}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute right-0 mt-2 w-56 py-2 bg-[#12122a] border border-[#1e1e3a] rounded-xl shadow-2xl z-50 text-xs">
              <div className="px-3.5 py-2 border-b border-[#1e1e3a] space-y-1.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center justify-between">
                  <span>Network</span>
                  <button
                    onClick={handleManualAlign}
                    disabled={aligning}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors font-normal underline cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    {aligning ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : null}
                    <span>Align Devnet</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 text-slate-200 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Solana Devnet</span>
                </div>
              </div>

              {/* Copy Address */}
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-between px-3.5 py-2 text-slate-300 hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{copied ? "Copied!" : "Copy Address"}</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {shortenAddress(publicKey)}
                </span>
              </button>

              {/* View on Explorer */}
              <a
                href={getExplorerUrl("address", publicKey.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3.5 py-2 text-slate-300 hover:bg-white/5 transition-colors"
                onClick={() => setShowDropdown(false)}
              >
                <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                <span>View on Explorer</span>
              </a>

              <div className="border-t border-[#1e1e3a] my-1" />

              {/* Disconnect */}
              <button
                onClick={() => {
                  disconnect();
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      disabled={connecting}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-primary text-white hover:bg-primary-hover shadow-primary-glow transition-all disabled:opacity-50"
    >
      <Wallet className="w-4 h-4" />
      <span>{connecting ? "Connecting..." : "Connect Wallet"}</span>
    </button>
  );
}
