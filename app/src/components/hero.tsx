"use client";

import React from "react";
import Link from "next/link";
import { useSpyxPrice } from "@/hooks/use-spyx-price";
import { useVault } from "@/hooks/use-vault";
import { usePtPool } from "@/hooks/use-pt-pool";
import { useYtPool } from "@/hooks/use-yt-pool";
import { DEMO_VAULT_PDA } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { ArrowRight, TrendingUp, ShieldCheck, Activity, Clock, Layers } from "lucide-react";

export function Hero() {
  const { spyPrice, isMarketClosed, loading: priceLoading } = useSpyxPrice();
  const vault = useVault(DEMO_VAULT_PDA);
  const ptPool = usePtPool();
  const ytPool = useYtPool();

  // SPYx NAV = PT pool price + YT pool price (the fundamental StockSplit invariant)
  const poolsLoaded = !ptPool.loading && !ytPool.loading && ptPool.price > 0 && ytPool.price > 0;
  const spyxNav = poolsLoaded ? ptPool.price + ytPool.price : 0;
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
      {/* Background radial gradients & subtle dot grid */}
      <div className="absolute inset-0 bg-[#0a0a1a] bg-[radial-gradient(#1e1e3a_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-indigo-600/15 via-purple-600/15 to-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-5xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#12122a] border border-[#1e1e3a] text-xs font-medium text-slate-300 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <a
            href="https://hackathons.solana.com/hackathons/stocklana"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white transition-colors"
          >
            Stocklana_ Hackathon
          </a>
          <span className="text-slate-600">·</span>
          <span className="text-indigo-400 font-semibold">$126K Prize Pool · Sep 26</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
          Split any stock into{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400">
            price and dividends.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-400 font-normal leading-relaxed">
          Buy the S&P 500 at a known discount — or buy just the dividends. 
          On-chain instruments that don&apos;t exist anywhere else in DeFi.
        </p>

        {/* Live Data Panel: Pyth Feed + On-chain NAV */}
        <div className="max-w-2xl mx-auto glass-panel p-5 rounded-2xl shadow-xl space-y-4">
          <div className="grid grid-cols-2 gap-4 divide-x divide-[#1e1e3a]">
            {/* Left: VOO Live from Pyth */}
            <div className="text-left space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>VOO S&P 500 (TradFi)</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {priceLoading ? "Loading..." : spyPrice > 0 ? formatCurrency(spyPrice) : "Unavailable"}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                {isMarketClosed ? (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Market closed (last close)
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Live via Pyth Hermes
                  </span>
                )}
              </div>
            </div>

            {/* Right: SPYx NAV from live Meteora pools */}
            <div className="text-left pl-4 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span>SPYx NAV (On-chain)</span>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-indigo-300 tracking-tight">
                {poolsLoaded ? formatCurrency(spyxNav) : "Loading..."}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-400" />
                {poolsLoaded
                  ? `$${ptPool.price.toFixed(2)} PT + $${ytPool.price.toFixed(2)} YT`
                  : "Fetching Meteora pools..."}
              </div>
            </div>
          </div>

          {/* Bottom Bar: StockSplit invariant + vault multiplier */}
          <div className="pt-3 border-t border-[#1e1e3a] flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>PT + YT = SPYx</span>
              {poolsLoaded && (
              <span className="font-mono font-semibold text-emerald-400">
                ${ptPool.price.toFixed(2)} + ${ytPool.price.toFixed(2)} = ${spyxNav.toFixed(2)} ✓
              </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 bg-[#1a1a36] px-2.5 py-1 rounded-lg border border-[#2a2a50]">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Vault Multiplier:</span>
              <span className="font-mono font-bold text-white">
                {vault.loading ? "..." : `${vault.currentMultiplier.toFixed(6)}x`}
              </span>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            href="/split"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:opacity-95 shadow-primary-glow transition-all group"
          >
            <span>Launch App</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/docs"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-medium text-slate-300 bg-[#12122a] border border-[#1e1e3a] hover:bg-[#1a1a36] hover:text-white transition-colors"
          >
            How it works
          </Link>
        </div>
      </div>
    </section>
  );
}
