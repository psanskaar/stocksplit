"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatAmount, formatCurrency, getExplorerUrl, shortenAddress } from "@/lib/utils";
import {
  CheckCircle2,
  ExternalLink,
  Layers,
  ArrowRight,
  TrendingUp,
  Copy,
  Check,
  X,
  Calendar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export interface SplitSuccessData {
  spyxAmount: number;
  usdValue: number;
  ptAmount: number;
  ytAmount: number;
  maturityDays: number;
  maturityDate: string;
  estUsdcYield: number;
  vaultPda: string;
  txSignature: string;
}

interface SplitSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: SplitSuccessData | null;
}

export function SplitSuccessModal({ isOpen, onClose, data }: SplitSuccessModalProps) {
  const [copiedTx, setCopiedTx] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen || !data) return null;

  const handleCopyTx = () => {
    navigator.clipboard.writeText(data.txSignature);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md bg-[#0e0e22] border border-[#232348] rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 text-white max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 pr-6">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Split Successful!
            </h3>
            <p className="text-xs text-slate-400">
              Split {formatAmount(data.spyxAmount)} SPYx ({formatCurrency(data.usdValue)})
            </p>
          </div>
        </div>

        {/* Tokens Received */}
        <div className="grid grid-cols-2 gap-3">
          {/* PT Card */}
          <div className="p-3.5 rounded-xl bg-[#141432] border border-blue-500/20 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>PT-SPYx</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              +{formatAmount(data.ptAmount)}
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Redeem for {formatAmount(data.ptAmount)} SPYx
            </p>
          </div>

          {/* YT Card */}
          <div className="p-3.5 rounded-xl bg-[#141432] border border-emerald-500/20 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>YT-SPYx</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              +{formatAmount(data.ytAmount)}
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              ~{formatCurrency(data.estUsdcYield)} USDC dividends
            </p>
          </div>
        </div>

        {/* Key Info */}
        <div className="p-3 rounded-xl bg-[#090916] border border-[#1e1e3a] space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>Maturity:</span>
            <span className="font-medium text-slate-200">
              {data.maturityDays >= 1 ? `${data.maturityDays} Days (${data.maturityDate})` : "⚡ 2 Mins (Dev Test)"}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span>Transaction:</span>
            <div className="flex items-center gap-1.5">
              <a
                href={getExplorerUrl("tx", data.txSignature)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
              >
                <span>{shortenAddress(data.txSignature, 4)}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={handleCopyTx}
                className="text-slate-400 hover:text-white transition-colors"
                title="Copy Signature"
              >
                {copiedTx ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <Link
            href="/redeem#positions"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 shadow-primary-glow transition-all flex items-center justify-center gap-2 text-xs"
          >
            <span>View Position</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl font-medium text-slate-400 hover:text-white bg-[#14142e] hover:bg-[#1a1a3a] border border-[#1e1e3a] transition-all text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
