"use client";

import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";

export interface TokenBalanceData {
  balance: number;
  rawBalance: string;
  ataAddress: string;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTokenBalance(
  mintAddress: PublicKey | string | null,
  isToken2022 = false,
  decimals = 6
): TokenBalanceData {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [data, setData] = useState<TokenBalanceData>({
    balance: 0,
    rawBalance: "0",
    ataAddress: "",
    loading: true,
    error: null,
    refetch: async () => {},
  });

  const fetchBalance = useCallback(
    async (forceFresh = false) => {
      if (!publicKey || !mintAddress) {
        setData((prev) => ({
          ...prev,
          balance: 0,
          rawBalance: "0",
          loading: false,
        }));
        return;
      }

      const mintStr = typeof mintAddress === "string" ? mintAddress : mintAddress.toBase58();

      // 1. Fast path: check server balances route first
      try {
        const url = forceFresh
          ? `/api/balances?wallet=${publicKey.toBase58()}&fresh=true`
          : `/api/balances?wallet=${publicKey.toBase58()}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json.tokens && json.tokens[mintStr] !== undefined) {
            const item = json.tokens[mintStr];
            setData({
              balance: item.balance,
              rawBalance: item.raw,
              ataAddress: "",
              loading: false,
              error: null,
              refetch: () => fetchBalance(true),
            });
            return;
          } else if (json.tokens) {
            // Token is not held in wallet -> explicitly 0
            setData({
              balance: 0,
              rawBalance: "0",
              ataAddress: "",
              loading: false,
              error: null,
              refetch: () => fetchBalance(true),
            });
            return;
          }
        }
      } catch {}

      // 2. Fallback: on-chain getAccount
      try {
        const mint = new PublicKey(mintStr);
        const primaryProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        const secondaryProgramId = isToken2022 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;

        const primaryAta = getAssociatedTokenAddressSync(mint, publicKey, false, primaryProgramId);

        try {
          const account = await getAccount(connection, primaryAta, "confirmed", primaryProgramId);
          const raw = account.amount.toString();
          const num = Number(raw) / Math.pow(10, decimals);

          setData({
            balance: num,
            rawBalance: raw,
            ataAddress: primaryAta.toBase58(),
            loading: false,
            error: null,
            refetch: () => fetchBalance(true),
          });
        } catch (e1: any) {
          try {
            const secondaryAta = getAssociatedTokenAddressSync(mint, publicKey, false, secondaryProgramId);
            const altAccount = await getAccount(connection, secondaryAta, "confirmed", secondaryProgramId);
            const raw = altAccount.amount.toString();
            const num = Number(raw) / Math.pow(10, decimals);

            setData({
              balance: num,
              rawBalance: raw,
              ataAddress: secondaryAta.toBase58(),
              loading: false,
              error: null,
              refetch: () => fetchBalance(true),
            });
          } catch (e2: any) {
            // Only set to 0 if the account specifically does not exist on-chain
            if (
              e2?.name === "TokenAccountNotFoundError" ||
              e2?.message?.includes("could not find account")
            ) {
              setData({
                balance: 0,
                rawBalance: "0",
                ataAddress: primaryAta.toBase58(),
                loading: false,
                error: null,
                refetch: () => fetchBalance(true),
              });
            } else {
              // Transient network or rate-limit error: preserve previous balance!
              setData((prev) => ({ ...prev, loading: false }));
            }
          }
        }
      } catch (err: any) {
        setData((prev) => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      }
    },
    [connection, publicKey, mintAddress, isToken2022, decimals]
  );

  useEffect(() => {
    fetchBalance(false);
    const interval = setInterval(() => fetchBalance(false), 25000);

    const onBalanceUpdate = () => {
      fetchBalance(true);
    };
    window.addEventListener("stocksplit_balance_updated", onBalanceUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("stocksplit_balance_updated", onBalanceUpdate);
    };
  }, [fetchBalance]);

  return data;
}
