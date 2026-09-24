/**
 * create-fee-accounts.ts
 *
 * Creates the two protocol fee collector token accounts on devnet and writes
 * their addresses to:
 *   - <workspace>/addresses.json
 *   - <workspace>/app/src/lib/constants.ts  (appended)
 *
 * Usage:
 *   npx ts-node --require ts-node/register/transpile-only scripts/create-fee-accounts.ts
 */

import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAccount,
  getAccount,
} from "@solana/spl-token";

const RPC_URL = "https://api.devnet.solana.com";

// ─── Mints (from constants.ts / devnet state) ─────────────────────────────────
const SPYX_MINT  = new PublicKey("EMqGxJdEaCEPxN5NhKY4sAoze877TRhfhVrXYLbg5GC8");
const USDC_MINT  = new PublicKey("AXQKoNyChJ9vihK3qThe9UdT6xteoh1Lc4roqP98i2zW");

// ─── Authority keypair (the vault.authority / fee collector) ──────────────────
const walletPath = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".config", "solana", "id.json"
);
const walletRaw = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
const authority = Keypair.fromSecretKey(Uint8Array.from(walletRaw));

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║        StockSplit Protocol Fee Account Creator           ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log("Authority:  ", authority.publicKey.toBase58());
  console.log("SPYx mint:  ", SPYX_MINT.toBase58());
  console.log("USDC mint:  ", USDC_MINT.toBase58());
  console.log();

  // ── 1. Create SPYx fee account (Token-2022) ──────────────────────────────
  console.log("Creating SPYx protocol fee account (Token-2022)...");
  const spyxFeeKeypair = Keypair.generate();
  const spyxFeeAddress = await createAccount(
    connection,
    authority,
    SPYX_MINT,
    authority.publicKey,   // token authority = fee collector = vault.authority
    spyxFeeKeypair,
    { skipPreflight: true, commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  console.log("  ✓ SPYx fee account:", spyxFeeAddress.toBase58());

  // Verify
  const spyxAcct = await getAccount(connection, spyxFeeAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("  ✓ Verified — mint:", spyxAcct.mint.toBase58());
  console.log("  ✓ Verified — owner:", spyxAcct.owner.toBase58());
  console.log();

  // ── 2. Create USDC fee account (standard SPL) ─────────────────────────────
  console.log("Creating USDC protocol fee account (standard SPL)...");
  const usdcFeeKeypair = Keypair.generate();
  const usdcFeeAddress = await createAccount(
    connection,
    authority,
    USDC_MINT,
    authority.publicKey,   // token authority = fee collector = vault.authority
    usdcFeeKeypair,
    { skipPreflight: true, commitment: "confirmed" },
    TOKEN_PROGRAM_ID
  );
  console.log("  ✓ USDC fee account:", usdcFeeAddress.toBase58());

  // Verify
  const usdcAcct = await getAccount(connection, usdcFeeAddress, "confirmed", TOKEN_PROGRAM_ID);
  console.log("  ✓ Verified — mint:", usdcAcct.mint.toBase58());
  console.log("  ✓ Verified — owner:", usdcAcct.owner.toBase58());
  console.log();

  // ── 3. Write addresses.json ───────────────────────────────────────────────
  const addressesPath = path.join(__dirname, "..", "addresses.json");

  // Merge with any existing content
  let existing: Record<string, string> = {};
  if (fs.existsSync(addressesPath)) {
    existing = JSON.parse(fs.readFileSync(addressesPath, "utf-8"));
  }

  const updated = {
    ...existing,
    programId:                  "9WRT68i9TJ1wi3fDv4offsxbNmkkstQAHY9XNN4YQnZG",
    authority:                  authority.publicKey.toBase58(),
    spyxMint:                   SPYX_MINT.toBase58(),
    usdcMint:                   USDC_MINT.toBase58(),
    protocolSpyxFeeAccount:     spyxFeeAddress.toBase58(),
    protocolUsdcFeeAccount:     usdcFeeAddress.toBase58(),
  };

  fs.writeFileSync(addressesPath, JSON.stringify(updated, null, 2));
  console.log("✓ Written to addresses.json");

  // ── 4. Update app/src/lib/constants.ts ────────────────────────────────────
  const constantsPath = path.join(__dirname, "..", "app", "src", "lib", "constants.ts");
  let constantsContent = fs.readFileSync(constantsPath, "utf-8");

  const feeSection = `
// ─── Protocol Fee Collector Accounts ─────────────────────────────────────────
// Created on devnet by authority: ${authority.publicKey.toBase58()}
// These accounts receive protocol fees on every deposit (SPYx) and settle (USDC).

/** SPYx (Token-2022) account that receives the 10 bps deposit split fee */
export const PROTOCOL_SPYX_FEE_ACCOUNT = new PublicKey(
  process.env.NEXT_PUBLIC_PROTOCOL_SPYX_FEE_ACCOUNT ||
  "${spyxFeeAddress.toBase58()}"
);

/** USDC (standard SPL) account that receives the 100 bps clearinghouse settle fee */
export const PROTOCOL_USDC_FEE_ACCOUNT = new PublicKey(
  process.env.NEXT_PUBLIC_PROTOCOL_USDC_FEE_ACCOUNT ||
  "${usdcFeeAddress.toBase58()}"
);
`;

  // Avoid duplicating if already present
  if (constantsContent.includes("PROTOCOL_SPYX_FEE_ACCOUNT")) {
    // Replace existing block between the marker comments
    constantsContent = constantsContent.replace(
      /\/\/ ─── Protocol Fee Collector Accounts[\s\S]*?;\n/,
      feeSection.trimStart()
    );
  } else {
    constantsContent += feeSection;
  }

  fs.writeFileSync(constantsPath, constantsContent);
  console.log("✓ Updated app/src/lib/constants.ts\n");

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                        DONE                              ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║ PROTOCOL_SPYX_FEE_ACCOUNT                                ║");
  console.log(`║   ${spyxFeeAddress.toBase58().padEnd(52)} ║`);
  console.log("║ PROTOCOL_USDC_FEE_ACCOUNT                                ║");
  console.log(`║   ${usdcFeeAddress.toBase58().padEnd(52)} ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log("Pass these to deposit/settle calls:");
  console.log("  protocolFeeAccount:     PROTOCOL_SPYX_FEE_ACCOUNT");
  console.log("  protocolUsdcFeeAccount: PROTOCOL_USDC_FEE_ACCOUNT\n");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
