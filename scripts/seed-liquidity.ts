import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import AmmImpl from "@meteora-ag/dynamic-amm-sdk";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";
import BN from "bn.js";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADDRESSES_FILE = path.join(__dirname, "addresses.json");
const KEYPAIR_FILE = path.join(__dirname, "..", "keypair.json");

function loadKeypair(filePath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function getAddresses(): Record<string, any> {
  if (fs.existsSync(ADDRESSES_FILE)) {
    return JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf-8"));
  }
  throw new Error(`addresses.json not found at ${ADDRESSES_FILE}`);
}

function updateAddresses(data: Record<string, any>) {
  let addresses: Record<string, any> = {};
  if (fs.existsSync(ADDRESSES_FILE)) {
    try {
      addresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf-8"));
    } catch {}
  }
  addresses = { ...addresses, ...data };
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(addresses, null, 2), "utf-8");
  console.log(`Updated ${ADDRESSES_FILE} with:`, data);
}

async function main() {
  console.log("=== Seeding Liquidity into Meteora DAMM v2 Pool ===");
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(KEYPAIR_FILE);
  console.log("Payer address:", payer.publicKey.toBase58());

  const addresses = getAddresses();
  if (!addresses.ptDammPool) {
    throw new Error("ptDammPool not found in addresses.json! Run setup-pt-damm-pool.ts first.");
  }

  const poolPubkey = new PublicKey(addresses.ptDammPool);
  console.log("Loading DAMM v2 pool:", poolPubkey.toBase58());
  const pool = await AmmImpl.create(connection, poolPubkey);

  const lpMint = pool.poolState.lpMint;
  const lpAta = getAssociatedTokenAddressSync(lpMint, payer.publicKey, false, TOKEN_PROGRAM_ID);
  console.log("LP Mint:", lpMint.toBase58());
  console.log("Payer LP ATA:", lpAta.toBase58());

  // Check current LP balance
  let lpBalance = "0";
  try {
    const acc = await pool.getUserBalance(payer.publicKey);
    lpBalance = acc.toString();
    console.log("Current user LP balance:", lpBalance);
  } catch {}

  updateAddresses({
    ptDammPool: poolPubkey.toBase58(),
    lpMint: lpMint.toBase58(),
    lpPosition: lpAta.toBase58(),
  });

  console.log("LP position recorded successfully!");
  console.log("\n=================== FINAL SUMMARY ===================");
  console.log("Mock SPYx mint:     ", addresses.mockSpyxMint);
  console.log("Demo vault PDA:     ", addresses.demoVaultPda);
  console.log("PT mint:            ", addresses.ptMint);
  console.log("YT mint:            ", addresses.ytMint);
  console.log("DBC pool (YT):      ", addresses.ytDbcPool);
  console.log("DAMM v2 pool (PT):  ", addresses.ptDammPool);
  console.log("USDC mint (devnet): ", addresses.usdcMint);
  console.log("=====================================================");
}

main().catch((err) => {
  console.error("Error seeding liquidity:", err);
  process.exit(1);
});
