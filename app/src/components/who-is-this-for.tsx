"use client";

import React from "react";
import { Tag, TrendingUp, Zap } from "lucide-react";
import { useSpyxPrice } from "@/hooks/use-spyx-price";

export function WhoIsThisFor() {
  const { spyxPrice } = useSpyxPrice();

  const ptDiscount = 1.28; // 1 - 1/1.013 = 1.28%
  const discountedPrice = (spyxPrice * (1 - ptDiscount / 100)).toFixed(2);
  const ytValue = (spyxPrice * 0.013).toFixed(2);

  const cards = [
    {
      title: "Buy at a Discount",
      role: "PT Buyer",
      color: "border-blue-500/30 hover:border-blue-500/60 shadow-pt-glow",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      icon: Tag,
      description: `Buy SPYx at ~$${discountedPrice} instead of $${spyxPrice.toFixed(
        2
      )} (${ptDiscount}% discount to spot). You give up future dividends in exchange for locking in a fixed capital gain at maturity.`,
      highlight: `Save ~${ptDiscount}% on S&P 500 exposure`,
    },
    {
      title: "Bet on Dividends",
      role: "YT Buyer",
      color: "border-emerald-500/30 hover:border-emerald-500/60 shadow-yt-glow",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      icon: TrendingUp,
      description: `Pay ~$${ytValue} to receive 100% of the cash dividend payouts from the stock until maturity. Pure yield leverage without taking directional price risk on the underlying equity.`,
      highlight: "Pure dividend yield exposure",
    },
    {
      title: "Unlock Capital",
      role: "Splitter",
      color: "border-indigo-500/30 hover:border-indigo-500/60 shadow-primary-glow",
      badgeColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
      icon: Zap,
      description:
        "Deposit your tokenized stocks to receive PT and YT. Sell your yield upfront on Meteora DBC to unlock immediate liquidity while holding your principal.",
      highlight: "Instant liquidity for future dividends",
    },
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center space-y-3 mb-12">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
          Target Participants
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          Who Is StockSplit For?
        </h2>
        <p className="text-slate-400 max-w-xl mx-auto text-sm">
          Tailor your market exposure: discount buyers, yield seekers, and capital splitters.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className={`glass-panel p-6 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${c.color}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${c.badgeColor}`}>
                    {c.role}
                  </span>
                  <Icon className="w-5 h-5 text-slate-400" />
                </div>

                <h3 className="text-xl font-bold text-white tracking-tight">{c.title}</h3>

                <p className="text-sm text-slate-300 leading-relaxed">{c.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-[#1e1e3a] text-xs font-medium text-slate-400">
                {c.highlight}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
