import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "9WRT68i9TJ1wi3fDv4offsxbNmkkstQAHY9XNN4YQnZG"
);

export const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://api.devnet.solana.com";

// Pre-settled demo vault & mints
export const DEMO_VAULT_PDA = new PublicKey(
  process.env.NEXT_PUBLIC_DEMO_VAULT_PDA || "96ThTiiMHJLtQE9BfukzYUiHCNByptfkF6s1oiBbHYsR"
);

export const MOCK_SPYX_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_MOCK_SPYX_MINT || "EMqGxJdEaCEPxN5NhKY4sAoze877TRhfhVrXYLbg5GC8"
);

export const MOCK_PT_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_MOCK_PT_MINT || "3GSyLYWRSZaNdPW41xcTrWrR7Qvn6X5Lv4F3d4CUHni3"
);

export const MOCK_YT_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_MOCK_YT_MINT || "HhKNM1MTQU1dG4jyyHnuT6cz4GSyeakR2yN8GGmBb4WE"
);

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || "AXQKoNyChJ9vihK3qThe9UdT6xteoh1Lc4roqP98i2zW"
);

// Meteora Pools on Devnet
export const YT_DAMM_POOL = new PublicKey(
  process.env.NEXT_PUBLIC_YT_DAMM_POOL || "BvMKwwPFH781QqJuk4pRdvATg2rSuyHzVLuGMpgrax6o"
);

export const PT_DAMM_POOL = new PublicKey(
  process.env.NEXT_PUBLIC_PT_DAMM_POOL || "8cwZ7yESFJw7DyM1JWVE92Zu9NHHX82jbdCau6v1oW7s"
);

// Reference DBC Pool (designed for Mainnet Initial Price Discovery)
export const YT_DBC_POOL = new PublicKey(
  process.env.NEXT_PUBLIC_YT_DBC_POOL || "FmPChn3VTSainyKArE7zFLn3FMxKnRwTxdLrgmyfVHg5"
);

// Pyth Hermes Price Feeds
// Crypto.SPYX/USD (proxy/feed)
export const SPYX_PRICE_FEED_ID =
  process.env.NEXT_PUBLIC_SPYX_PYTH_FEED ||
  "0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68aca80f0612684";

// Equity.US.VOO/USD (Vanguard S&P 500 ETF, same index as SPY)
export const VOO_PRICE_FEED_ID =
  process.env.NEXT_PUBLIC_VOO_PYTH_FEED ||
  "0x236b30dd09a9c00dfeec156c7b1efd646c0f01825a1758e3e4a0679e3bdff179";

// Design System Constants
export const PT_COLOR = "#3b82f6"; // blue-500
export const YT_COLOR = "#22c55e"; // green-500
export const PRIMARY_COLOR = "#6366f1"; // indigo-500

// ─── Protocol Fee Collector Accounts ─────────────────────────────────────────
// Created on devnet by authority: 8ieVC6ufupkxqCgAEoUEReYWkWZwLZQHK3u9RYZy8Ps6
// These accounts receive protocol fees on every deposit (SPYx) and settle (USDC).

/** SPYx (Token-2022) account that receives the 10 bps deposit split fee */
export const PROTOCOL_SPYX_FEE_ACCOUNT = new PublicKey(
  process.env.NEXT_PUBLIC_PROTOCOL_SPYX_FEE_ACCOUNT ||
  "6qPBcP5wrj5VRntR8TswdbV3x5FHMrCmWFNwqZnq1Tgn"
);

/** USDC (standard SPL) account that receives the 100 bps clearinghouse settle fee */
export const PROTOCOL_USDC_FEE_ACCOUNT = new PublicKey(
  process.env.NEXT_PUBLIC_PROTOCOL_USDC_FEE_ACCOUNT ||
  "4PDpCWzeo2ruaT3WYAaL2A22PUFYiFSEskCJ12yyefTi"
);
