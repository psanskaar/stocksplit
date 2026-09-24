import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADDRESSES_FILE = path.join(__dirname, "addresses.json");
const KEYPAIR_FILE = path.join(__dirname, "..", "keypair.json");
const IDL_FILE = path.join(__dirname, "..", "target", "idl", "stocksplit.json");

function loadKeypair(filePath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
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
  console.log(`Updated ${ADDRESSES_FILE}`);
}

function getAddresses(): Record<string, any> {
  if (fs.existsSync(ADDRESSES_FILE)) {
    return JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf-8"));
  }
  throw new Error(`addresses.json not found at ${ADDRESSES_FILE}`);
}

function f64ToBN(value: number): BN {
  const buf = Buffer.alloc(8);
  const view = new DataView(buf.buffer);
  view.setFloat64(0, value, true);
  const bits = view.getBigUint64(0, true);
  return new BN(bits.toString());
}

function getVaultPda(programId: PublicKey, xstockMint: PublicKey, maturityTimestamp: number): [PublicKey, number] {
  const maturityBuf = Buffer.alloc(8);
  maturityBuf.writeBigInt64LE(BigInt(maturityTimestamp));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), xstockMint.toBuffer(), maturityBuf],
    programId
  );
}

function getPtMintPda(programId: PublicKey, vaultPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("pt_mint"), vaultPda.toBuffer()], programId);
}

function getYtMintPda(programId: PublicKey, vaultPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("yt_mint"), vaultPda.toBuffer()], programId);
}

async function main() {
  console.log("=== Creating and Settling Pre-settled Demo Vault ===");
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(KEYPAIR_FILE);
  console.log("Payer address:", payer.publicKey.toBase58());

  const addresses = getAddresses();
  if (!addresses.mockSpyxMint) {
    throw new Error("mockSpyxMint not found in addresses.json! Run create-mock-spyx.ts first.");
  }
  const xstockMint = new PublicKey(addresses.mockSpyxMint);
  console.log("Using Mock SPYx:", xstockMint.toBase58());

  // Setup Anchor Provider & Program
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const idl = JSON.parse(fs.readFileSync(IDL_FILE, "utf-8"));
  const programId = new PublicKey(idl.metadata?.address || idl.address || "9WRT68i9TJ1wi3fDv4offsxbNmkkstQAHY9XNN4YQnZG");
  const program = new Program(idl, programId, provider);
  console.log("Program ID:", programId.toBase58());

  // 1. Create or load devnet USDC mint
  let usdcMint: PublicKey;
  if (addresses.usdcMint) {
    usdcMint = new PublicKey(addresses.usdcMint);
    console.log("Using existing devnet USDC mint:", usdcMint.toBase58());
  } else {
    console.log("Creating devnet mock USDC mint...");
    usdcMint = await createMint(connection, payer, payer.publicKey, null, 6, undefined, undefined, TOKEN_PROGRAM_ID);
    console.log("Created USDC mint:", usdcMint.toBase58());
    updateAddresses({ usdcMint: usdcMint.toBase58() });
  }

  // 2. Derive Vault PDAs (maturity = now + 25 seconds)
  const now = Math.floor(Date.now() / 1000);
  const maturityTimestamp = now + 25;
  const [vaultPda, vaultBump] = getVaultPda(programId, xstockMint, maturityTimestamp);
  const [ptMintPda] = getPtMintPda(programId, vaultPda);
  const [ytMintPda] = getYtMintPda(programId, vaultPda);

  const vaultXstockAccount = getAssociatedTokenAddressSync(xstockMint, vaultPda, true, TOKEN_2022_PROGRAM_ID);
  const vaultUsdcAccount = getAssociatedTokenAddressSync(usdcMint, vaultPda, true, TOKEN_PROGRAM_ID);

  console.log("Vault PDA:", vaultPda.toBase58());
  console.log("PT Mint PDA:", ptMintPda.toBase58());
  console.log("YT Mint PDA:", ytMintPda.toBase58());
  console.log("Maturity Timestamp:", maturityTimestamp, `(in 25s: ${new Date(maturityTimestamp * 1000).toISOString()})`);

  // 3. Initialize Vault
  console.log("\nStep 1: Calling initializeVault...");
  const initTx = await program.methods
    .initializeVault(new BN(maturityTimestamp), f64ToBN(1.0))
    .accounts({
      authority: payer.publicKey,
      xstockMint,
      usdcMint,
      vault: vaultPda,
      ptMint: ptMintPda,
      ytMint: ytMintPda,
      vaultXstockAccount,
      vaultUsdcAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("initializeVault tx:", initTx);

  // 4. Deposit 200,000,000 raw SPYx (200 SPYx)
  console.log("\nStep 2: Depositing 200,000,000 raw SPYx (200 SPYx)...");
  const depositorXstockAccount = getAssociatedTokenAddressSync(xstockMint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const depositorPtAccount = getAssociatedTokenAddressSync(ptMintPda, payer.publicKey, false, TOKEN_PROGRAM_ID);
  const depositorYtAccount = getAssociatedTokenAddressSync(ytMintPda, payer.publicKey, false, TOKEN_PROGRAM_ID);

  const depositTx = await program.methods
    .deposit(new BN(200_000_000))
    .accounts({
      depositor: payer.publicKey,
      vault: vaultPda,
      xstockMint,
      depositorXstockAccount,
      vaultXstockAccount,
      ptMint: ptMintPda,
      ytMint: ytMintPda,
      depositorPtAccount,
      depositorYtAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log("deposit tx:", depositTx);

  // 5. Wait for maturity
  const remainingSeconds = Math.max(0, maturityTimestamp - Math.floor(Date.now() / 1000) + 2);
  console.log(`\nStep 3: Waiting ${remainingSeconds}s for vault maturity...`);
  await new Promise((resolve) => setTimeout(resolve, remainingSeconds * 1000));
  console.log("Maturity reached!");

  // 6. Update multiplier to 1.013 (simulating 1.3% dividend yield)
  console.log("\nStep 4: Calling updateMultiplier(1.013)...");
  const updateMultTx = await program.methods
    .updateMultiplier(f64ToBN(1.013))
    .accounts({
      authority: payer.publicKey,
      vault: vaultPda,
    })
    .rpc();
  console.log("updateMultiplier tx:", updateMultTx);

  // 7. Mint 1,405.4 USDC to vault USDC account (1,405,405,405 raw = $7.027/YT = $130 per 18.5 YT)
  console.log("\nStep 5: Funding vault USDC account with 1,405.4 USDC (1,405,405,405 raw)...");
  await mintTo(
    connection,
    payer,
    usdcMint,
    vaultUsdcAccount,
    payer,
    1_405_405_405,
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("1,405.4 USDC minted to vault USDC account:", vaultUsdcAccount.toBase58());

  // 8. Settle Vault
  console.log("\nStep 6: Calling settle()...");
  const settleTx = await program.methods
    .settle(Buffer.from([]))
    .accounts({
      caller: payer.publicKey,
      vault: vaultPda,
      xstockMint,
      vaultXstockAccount,
      callerXstockAccount: depositorXstockAccount,
      vaultUsdcAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();
  console.log("settle tx:", settleTx);

  // Fetch final vault state
  const vaultState: any = await program.account.vault.fetch(vaultPda);
  console.log("\nVault settled successfully!");
  console.log("Settled status:", vaultState.settled);
  console.log("USDC per YT (raw):", vaultState.usdcPerYt.toString());

  updateAddresses({
    demoVaultPda: vaultPda.toBase58(),
    demoVaultMaturity: maturityTimestamp,
    demoVaultBump: vaultBump,
    ptMint: ptMintPda.toBase58(),
    ytMint: ytMintPda.toBase58(),
    vaultXstockAccount: vaultXstockAccount.toBase58(),
    vaultUsdcAccount: vaultUsdcAccount.toBase58(),
    usdcMint: usdcMint.toBase58(),
  });

  console.log("✅ Demo vault created and settled!");
}

main().catch((err) => {
  console.error("Error creating demo vault:", err);
  process.exit(1);
});
