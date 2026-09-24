import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  RPC_URL,
  USDC_MINT,
  MOCK_SPYX_MINT,
  MOCK_PT_MINT,
  MOCK_YT_MINT,
} from "@/lib/constants";

interface BalanceCacheEntry {
  data: any;
  timestamp: number;
}

const balanceCache = new Map<string, BalanceCacheEntry>();
const inFlightRequests = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 20000; // 20 second cache

function parseSplAmount(dataBuffer: Buffer | null | undefined): { raw: string; amount: number } {
  if (!dataBuffer || dataBuffer.length < 72) {
    return { raw: "0", amount: 0 };
  }
  try {
    const rawBig = dataBuffer.readBigUInt64LE(64);
    return { raw: rawBig.toString(), amount: Number(rawBig) / 1e6 };
  } catch {
    return { raw: "0", amount: 0 };
  }
}

export async function GET(req: NextRequest) {
  try {
    const walletParam = req.nextUrl.searchParams.get("wallet");
    const fresh = req.nextUrl.searchParams.get("fresh") === "true";
    if (!walletParam) {
      return NextResponse.json({ error: "wallet is required" }, { status: 400 });
    }

    let user: PublicKey;
    try {
      user = new PublicKey(walletParam);
    } catch {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const cacheKey = user.toBase58();
    const cached = balanceCache.get(cacheKey);
    const now = Date.now();

    if (!fresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    // Deduplicate concurrent requests for the same wallet
    if (inFlightRequests.has(cacheKey)) {
      try {
        const inFlightData = await inFlightRequests.get(cacheKey);
        return NextResponse.json(inFlightData);
      } catch {}
    }

    const fetchPromise = (async () => {
      const connection = new Connection(RPC_URL, "confirmed");

      // Derive specific ATAs directly (0ms)
      const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, user, false, TOKEN_PROGRAM_ID);
      const spyxAta = getAssociatedTokenAddressSync(MOCK_SPYX_MINT, user, false, TOKEN_2022_PROGRAM_ID);
      const ptAta = getAssociatedTokenAddressSync(MOCK_PT_MINT, user, false, TOKEN_PROGRAM_ID);
      const ytAta = getAssociatedTokenAddressSync(MOCK_YT_MINT, user, false, TOKEN_PROGRAM_ID);

      // Single batched query for all 4 token accounts + SOL balance
      const [solLamports, accountInfos] = await Promise.all([
        connection.getBalance(user).catch(() => cached?.data?.sol ? cached.data.sol * 1e9 : 0),
        connection.getMultipleAccountsInfo([usdcAta, spyxAta, ptAta, ytAta]).catch(() => [null, null, null, null]),
      ]);

      const usdcParsed = parseSplAmount(accountInfos[0]?.data as Buffer);
      const spyxParsed = parseSplAmount(accountInfos[1]?.data as Buffer);
      const ptParsed = parseSplAmount(accountInfos[2]?.data as Buffer);
      const ytParsed = parseSplAmount(accountInfos[3]?.data as Buffer);

      const tokenMap: Record<string, { balance: number; raw: string; decimals: number }> = {
        [USDC_MINT.toBase58()]: { balance: usdcParsed.amount, raw: usdcParsed.raw, decimals: 6 },
        [MOCK_SPYX_MINT.toBase58()]: { balance: spyxParsed.amount, raw: spyxParsed.raw, decimals: 6 },
        [MOCK_PT_MINT.toBase58()]: { balance: ptParsed.amount, raw: ptParsed.raw, decimals: 6 },
        [MOCK_YT_MINT.toBase58()]: { balance: ytParsed.amount, raw: ytParsed.raw, decimals: 6 },
      };

      const result = {
        sol: Number(solLamports) / 1e9,
        usdc: usdcParsed.amount,
        usdcRaw: usdcParsed.raw,
        spyx: spyxParsed.amount,
        spyxRaw: spyxParsed.raw,
        pt: ptParsed.amount,
        ptRaw: ptParsed.raw,
        yt: ytParsed.amount,
        ytRaw: ytParsed.raw,
        tokens: tokenMap,
      };

      balanceCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    })();

    inFlightRequests.set(cacheKey, fetchPromise);
    try {
      const result = await fetchPromise;
      return NextResponse.json(result);
    } catch (err: any) {
      if (cached) {
        return NextResponse.json(cached.data);
      }
      throw err;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch balances" }, { status: 500 });
  }
}

