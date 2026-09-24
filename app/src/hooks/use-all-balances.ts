"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import {
  MOCK_SPYX_MINT,
  USDC_MINT,
  MOCK_PT_MINT,
  MOCK_YT_MINT,
} from "@/lib/constants";
import { useSpyxPrice } from "./use-spyx-price";

export interface TokenBalanceItem {
  id: string;
  symbol: string;
  name: string;
  mint: string;
  balance: number;
  rawBalance: string;
  decimals: number;
  isToken2022: boolean;
  category: "sol" | "stable" | "stock" | "pt" | "yt" | "other";
  badgeColor: string;
  description: string;
  estimatedUsd?: number;
}

export function useAllBalances() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { spyxPrice } = useSpyxPrice();

  const [balances, setBalances] = useState<TokenBalanceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAllBalances = useCallback(
    async (forceFresh = false) => {
      if (!publicKey) {
        setBalances([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // 1. Fast path: server balances API route
        try {
          const url = forceFresh
            ? `/api/balances?wallet=${publicKey.toBase58()}&fresh=true`
            : `/api/balances?wallet=${publicKey.toBase58()}`;
          const res = await fetch(url);
          if (res.ok) {
          const json = await res.json();
          const items: TokenBalanceItem[] = [
            {
              id: "sol",
              symbol: "SOL",
              name: "Solana Devnet",
              mint: "11111111111111111111111111111111",
              balance: json.sol || 0,
              rawBalance: String(Math.round((json.sol || 0) * LAMPORTS_PER_SOL)),
              decimals: 9,
              isToken2022: false,
              category: "sol",
              badgeColor: "from-purple-500 to-indigo-500",
              description: "Gas token for Solana Devnet transactions and rent",
            },
            {
              id: USDC_MINT.toBase58(),
              symbol: "USDC",
              name: "USD Coin",
              mint: USDC_MINT.toBase58(),
              balance: json.usdc || 0,
              rawBalance: json.usdcRaw || "0",
              decimals: 6,
              isToken2022: false,
              category: "stable",
              badgeColor: "from-blue-500 to-cyan-500",
              description: "Protocol settlement & quote currency",
              estimatedUsd: (json.usdc || 0) * 1.0,
            },
            {
              id: MOCK_SPYX_MINT.toBase58(),
              symbol: "SPYx",
              name: "Synthetic S&P 500",
              mint: MOCK_SPYX_MINT.toBase58(),
              balance: json.spyx || 0,
              rawBalance: json.spyxRaw || "0",
              decimals: 6,
              isToken2022: true,
              category: "stock",
              badgeColor: "from-indigo-500 to-purple-600",
              description: "Tokenized equity underlying with dividend yield",
              estimatedUsd: (json.spyx || 0) * (spyxPrice || 500),
            },
            {
              id: MOCK_PT_MINT.toBase58(),
              symbol: "PT-SPYx",
              name: "Principal Token",
              mint: MOCK_PT_MINT.toBase58(),
              balance: json.pt || 0,
              rawBalance: json.ptRaw || "0",
              decimals: 6,
              isToken2022: false,
              category: "pt",
              badgeColor: "from-blue-600 to-indigo-600",
              description: "Redeemable 1:1 for SPYx equity at vault maturity",
              estimatedUsd: (json.pt || 0) * (spyxPrice || 500),
            },
            {
              id: MOCK_YT_MINT.toBase58(),
              symbol: "YT-SPYx",
              name: "Yield Token",
              mint: MOCK_YT_MINT.toBase58(),
              balance: json.yt || 0,
              rawBalance: json.ytRaw || "0",
              decimals: 6,
              isToken2022: false,
              category: "yt",
              badgeColor: "from-emerald-500 to-teal-600",
              description: "Accrues dividend payouts, redeemable for USDC post-settlement",
            },
          ];

          setBalances(items);
          setLastUpdated(new Date());
          setLoading(false);
          return;
        }
      } catch (apiErr) {
        console.warn("Balances API fallback:", apiErr);
        // Do not wipe out or hammer direct RPC if balances are already populated
        if (balances.length > 0) {
          setLoading(false);
          return;
        }
      }

      // 2. Fallback to direct RPC
      const items: TokenBalanceItem[] = [];

      try {
        const lamports = await connection.getBalance(publicKey, "confirmed");
        const solBal = lamports / LAMPORTS_PER_SOL;
        items.push({
          id: "sol",
          symbol: "SOL",
          name: "Solana Devnet",
          mint: "11111111111111111111111111111111",
          balance: solBal,
          rawBalance: lamports.toString(),
          decimals: 9,
          isToken2022: false,
          category: "sol",
          badgeColor: "from-purple-500 to-indigo-500",
          description: "Gas token for Solana Devnet transactions and rent",
        });
      } catch (e) {
        console.warn("Error fetching SOL balance:", e);
      }

      const fetchToken = async (
        mint: PublicKey,
        isToken2022: boolean,
        symbol: string,
        name: string,
        category: TokenBalanceItem["category"],
        badgeColor: string,
        description: string,
        decimals = 6,
        priceMultiplier?: number
      ): Promise<TokenBalanceItem> => {
        const programId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        let bal = 0;
        let raw = "0";

        try {
          const ata = getAssociatedTokenAddressSync(mint, publicKey, false, programId);
          const acc = await getAccount(connection, ata, "confirmed", programId);
          raw = acc.amount.toString();
          bal = Number(raw) / Math.pow(10, decimals);
        } catch {
          bal = 0;
          raw = "0";
        }

        return {
          id: mint.toBase58(),
          symbol,
          name,
          mint: mint.toBase58(),
          balance: bal,
          rawBalance: raw,
          decimals,
          isToken2022,
          category,
          badgeColor,
          description,
          estimatedUsd: priceMultiplier ? bal * priceMultiplier : undefined,
        };
      };

      const [usdcItem, spyxItem, ptItem, ytItem] = await Promise.all([
        fetchToken(USDC_MINT, false, "USDC", "USD Coin", "stable", "from-blue-500 to-cyan-500", "Protocol settlement & quote currency", 6, 1.0),
        fetchToken(MOCK_SPYX_MINT, true, "SPYx", "Synthetic S&P 500", "stock", "from-indigo-500 to-purple-600", "Tokenized equity underlying with dividend yield", 6, spyxPrice || 500),
        fetchToken(MOCK_PT_MINT, false, "PT-SPYx", "Principal Token", "pt", "from-blue-600 to-indigo-600", "Redeemable 1:1 for SPYx equity at vault maturity", 6, spyxPrice || 500),
        fetchToken(MOCK_YT_MINT, false, "YT-SPYx", "Yield Token", "yt", "from-emerald-500 to-teal-600", "Accrues dividend payouts, redeemable for USDC post-settlement", 6),
      ]);

      items.push(usdcItem, spyxItem, ptItem, ytItem);
      setBalances(items);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching all balances:", err);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, spyxPrice]);

  useEffect(() => {
    fetchAllBalances(false);
    const interval = setInterval(() => fetchAllBalances(false), 25000);

    const onBalanceUpdate = () => {
      fetchAllBalances(true);
    };
    window.addEventListener("stocksplit_balance_updated", onBalanceUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("stocksplit_balance_updated", onBalanceUpdate);
    };
  }, [fetchAllBalances]);

  const totalUsd = balances.reduce((sum, item) => sum + (item.estimatedUsd || 0), 0);

  return {
    balances,
    loading,
    lastUpdated,
    totalUsd,
    refetch: () => fetchAllBalances(true),
  };
}
