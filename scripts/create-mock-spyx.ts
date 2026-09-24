import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
} from "@solana/spl-token";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const ADDRESSES_FILE = path.join(__dirname, "addresses.json");
const KEYPAIR_FILE = path.join(__dirname, "..", "keypair.json");

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
  console.log(`Updated ${ADDRESSES_FILE}:`, data);
}

async function main() {
  console.log("=== Creating Mock SPYx Token-2022 Mint ===");
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(KEYPAIR_FILE);
  console.log("Payer address:", payer.publicKey.toBase58());

  const mintKeypair = Keypair.generate();
  const initialMultiplier = 1.0;

  const extensions = [ExtensionType.ScaledUiAmountConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  console.log("Creating mint account with ScaledUiAmountConfig extension...");
  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeScaledUiAmountConfigInstruction(
      mintKeypair.publicKey,
      payer.publicKey, // keypair is authority for multiplier updates
      initialMultiplier,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      6,
      payer.publicKey, // keypair is mint authority
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  const sig1 = await sendAndConfirmTransaction(connection, createMintTx, [payer, mintKeypair]);
  console.log("Mint created:", mintKeypair.publicKey.toBase58(), "tx:", sig1);

  // Derive ATA for keypair
  const ata = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  console.log("Creating ATA and minting 1,000 SPYx (1,000,000,000 raw units)...");
  const mintToTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      ata,
      payer.publicKey,
      1_000_000_000, // 1000 * 10^6
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  const sig2 = await sendAndConfirmTransaction(connection, mintToTx, [payer]);
  console.log("Minted 1000 SPYx to", ata.toBase58(), "tx:", sig2);

  updateAddresses({
    mockSpyxMint: mintKeypair.publicKey.toBase58(),
    mockSpyxMintAuthority: payer.publicKey.toBase58(),
    mockSpyxDecimals: 6,
  });

  console.log("✅ Mock SPYx created successfully!");
}

main().catch((err) => {
  console.error("Error creating mock SPYx:", err);
  process.exit(1);
});
