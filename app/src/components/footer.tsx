import React from "react";
import Link from "next/link";
import { ExternalLink, Github } from "lucide-react";
import { PROGRAM_ID, YT_DBC_POOL, PT_DAMM_POOL } from "@/lib/constants";
import { getExplorerUrl } from "@/lib/utils";

export function Footer() {
  return (
    <footer className="w-full border-t border-[#1e1e3a] bg-[#070714] py-12 text-sm text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <span className="text-base font-bold text-white tracking-tight">StockSplit</span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Decentralized dividend and price stripping protocol for tokenized equities on Solana.
            </p>
            <div className="text-xs text-slate-500">
              Built for{" "}
              <a
                href="https://hackathons.solana.com/hackathons/stocklana"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-white transition-colors"
              >
                Stocklana_
              </a>
              {" "}· $126K · Sep 26 2026
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">Protocol</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href={getExplorerUrl("address", PROGRAM_ID.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  Program on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href={getExplorerUrl("address", PT_DAMM_POOL.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  PT DAMM v2 Pool <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href={getExplorerUrl("address", YT_DBC_POOL.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  YT DBC Pool <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">Integrations</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://meteora.ag"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  Meteora DBC & DAMM v2 <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://pyth.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  Pyth Hermes Feeds <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://solana.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  Token-2022 Extensions <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-200 mb-3 text-xs uppercase tracking-wider">Community</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Github className="w-3.5 h-3.5" /> GitHub Repository
                </a>
              </li>
              <li>
                <Link href="/docs" className="hover:text-white transition-colors">
                  Protocol Documentation
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-[#1e1e3a] flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>© {new Date().getFullYear()} StockSplit Protocol. Solana Devnet.</div>
          <div>Token-2022 ScaledUiAmount · Meteora DBC · Meteora DAMM v2 · Pyth</div>
        </div>
      </div>
    </footer>
  );
}
