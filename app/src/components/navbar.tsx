"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";
import { BalancesButton } from "./balances-button";
import { Layers } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { name: "Split", href: "/split" },
    { name: "Trade", href: "/trade" },
    { name: "Redeem", href: "/redeem" },
    { name: "Docs", href: "/docs" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-[#0a0a1a]/85 border-b border-[#1e1e3a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 relative flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-primary-glow group-hover:scale-105 transition-transform">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-white tracking-tight">StockSplit</span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              DEVNET
            </span>
          </div>
        </Link>

        {/* Centered Desktop Nav */}
        <div className="hidden md:flex items-center gap-1 bg-[#12122a] px-3 py-1.5 rounded-xl border border-[#1e1e3a] absolute left-1/2 -translate-x-1/2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary text-white shadow-primary-glow"
                    : "text-slate-300 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>

        {/* Right - Balances & Wallet Button */}
        <div className="flex items-center gap-2.5">
          <BalancesButton />
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
