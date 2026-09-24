import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PROGRAM_ID } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Pack an f64 into a BN (u64 little-endian bits) for passing to Anchor instructions */
export function f64ToBN(value: number): BN {
  const buf = Buffer.alloc(8);
  const view = new DataView(buf.buffer);
  view.setFloat64(0, value, true);
  const bits = view.getBigUint64(0, true);
  return new BN(bits.toString());
}

/** Read f64 from an on-chain BN (u64 little-endian bits) */
export function bnToF64(bn: BN | any): number {
  if (!bn) return 0;
  const buf = Buffer.alloc(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(bn.toString()), true);
  return view.getFloat64(0, true);
}

/** Derive Vault PDA */
export function getVaultPda(
  xstockMint: PublicKey,
  maturityTimestamp: number,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const maturityBuf = Buffer.alloc(8);
  maturityBuf.writeBigInt64LE(BigInt(maturityTimestamp));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), xstockMint.toBuffer(), maturityBuf],
    programId
  );
}

/** Derive PT Mint PDA */
export function getPtMintPda(vaultPda: PublicKey, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("pt_mint"), vaultPda.toBuffer()], programId);
}

/** Derive YT Mint PDA */
export function getYtMintPda(vaultPda: PublicKey, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("yt_mint"), vaultPda.toBuffer()], programId);
}

/** Shorten base58 address for UI (e.g. 8ieV...Ps6) */
export function shortenAddress(address: string | PublicKey, chars = 4): string {
  const str = typeof address === "string" ? address : address.toBase58();
  if (str.length <= chars * 2) return str;
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

/** Format raw token amount to human readable string */
export function formatAmount(rawAmount: BN | number | string, decimals = 6, maxDecimals = 4): string {
  if (!rawAmount) return "0.00";
  const num = typeof rawAmount === "number" ? rawAmount : Number(rawAmount.toString()) / Math.pow(10, decimals);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

/** Format currency value */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Get Solana Explorer link on devnet */
export function getExplorerUrl(
  type: "tx" | "address",
  value: string,
  cluster: "devnet" | "mainnet-beta" = "devnet"
): string {
  return `https://explorer.solana.com/${type}/${value}?cluster=${cluster}`;
}
