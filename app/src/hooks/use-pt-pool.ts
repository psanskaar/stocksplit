"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import AmmImpl from "@meteora-ag/dynamic-amm-sdk";
import BN from "bn.js";
import { PT_DAMM_POOL } from "@/lib/constants";

export interface PtPoolData {
  poolAddress: string;
  price: number;
  tokenAAmount: number;
  tokenBAmount: number;
  tvl: number;
  loading: boolean;
  error: string | null;
  swap: (inTokenMint: PublicKey, amountInRaw: BN, minAmountOutRaw: BN) => Promise<string>;
  refetch: () => Promise<void>;
}

export function usePtPool(): PtPoolData {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [poolInstance, setPoolInstance] = useState<any>(null);
  const [data, setData] = useState<{
    price: number;
    tokenAAmount: number;
    tokenBAmount: number;
    tvl: number;
    loading: boolean;
    error: string | null;
  }>({
    price: 0,
    tokenAAmount: 0,
    tokenBAmount: 0,
    tvl: 0,
    loading: true,
    error: null,
  });

  const fetchPool = useCallback(async () => {
    try {
      // 10s timeout to prevent UI hanging on slow devnet RPC
      const pool = await Promise.race([
        (AmmImpl as any).create(connection as any, PT_DAMM_POOL as any),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Pool fetch timed out")), 10000)),
      ]);
      setPoolInstance(pool);

      const tokenA = Number(pool.poolInfo.tokenAAmount.toString()) / 1e6;
      const tokenB = Number(pool.poolInfo.tokenBAmount.toString()) / 1e6;
      const price = tokenA > 0 ? tokenB / tokenA : 0;
      const tvl = tokenB * 2;

      setData({
        price: Number(price.toFixed(2)),
        tokenAAmount: tokenA,
        tokenBAmount: tokenB,
        tvl: Number(tvl.toFixed(2)),
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, [connection]);

  useEffect(() => {
    fetchPool();
    const interval = setInterval(fetchPool, 30000);
    return () => clearInterval(interval);
  }, [fetchPool]);

  const swap = useCallback(
    async (inTokenMint: PublicKey, amountInRaw: BN, minAmountOutRaw: BN): Promise<string> => {
      if (!wallet.publicKey || !wallet.signTransaction) throw new Error("Wallet not connected");
      if (!poolInstance) throw new Error("Pool not loaded");

      // Build swap transaction via Meteora DAMM SDK
      const swapTx = await poolInstance.swap(
        wallet.publicKey as any,
        inTokenMint as any,
        amountInRaw as any,
        minAmountOutRaw as any
      );

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      swapTx.recentBlockhash = latestBlockhash.blockhash;
      swapTx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(swapTx);

      // skipPreflight: true prevents the RPC edge node from rejecting due to transient simulation blockhash desync
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        maxRetries: 5,
      });

      try {
        await connection.confirmTransaction(
          {
            signature: sig,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "confirmed"
        );
      } catch (confirmErr: any) {
        const status = await connection.getSignatureStatus(sig);
        if (status?.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
      }

      // Dispatch global balance update event across the app immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stocksplit_balance_updated"));
      }

      await fetchPool();
      return sig;
    },
    [connection, wallet, poolInstance, fetchPool]
  );

  return {
    poolAddress: PT_DAMM_POOL.toBase58(),
    ...data,
    swap,
    refetch: fetchPool,
  };
}
