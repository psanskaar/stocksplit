import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Stocksplit } from "../target/types/stocksplit";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert, expect } from "chai";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pack an f64 into a BN (u64 bits) for passing to the program */
function f64ToBN(value: number): BN {
  const buf = Buffer.allocUnsafe(8);
  buf.writeDoubleBE(value, 0); // Write BE
  // But we want LE bits (little-endian f64)
  const leBuf = Buffer.allocUnsafe(8);
  buf.copy(leBuf);
  // Reinterpret as LE
  const view = new DataView(leBuf.buffer);
  view.setFloat64(0, value, true); // true = littleEndian
  // Read as BigUint64
  const bits = view.getBigUint64(0, true);
  return new BN(bits.toString());
}

/** Read f64 from a BN (u64 bits, little-endian) */
function bnToF64(bn: BN): number {
  const buf = Buffer.alloc(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(bn.toString()), true);
  return view.getFloat64(0, true);
}

async function createMockSpyx(
  connection: anchor.web3.Connection,
  payer: Keypair,
  initialMultiplier: number = 1.0
): Promise<{ mint: PublicKey; multiplierAuthority: Keypair }> {
  const multiplierAuthority = Keypair.generate();
  const mintKeypair = Keypair.generate();

  const extensions = [ExtensionType.ScaledUiAmountConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeScaledUiAmountConfigInstruction(
      mintKeypair.publicKey,
      multiplierAuthority.publicKey,
      initialMultiplier,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      6,
      payer.publicKey,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);
  return { mint: mintKeypair.publicKey, multiplierAuthority };
}

async function createUsdcMint(
  connection: anchor.web3.Connection,
  payer: Keypair
): Promise<PublicKey> {
  return createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
}

function getVaultPda(
  programId: PublicKey,
  xstockMint: PublicKey,
  maturityTimestamp: number
): [PublicKey, number] {
  const maturityBuf = Buffer.alloc(8);
  maturityBuf.writeBigInt64LE(BigInt(maturityTimestamp));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), xstockMint.toBuffer(), maturityBuf],
    programId
  );
}

function getPtMintPda(programId: PublicKey, vaultPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pt_mint"), vaultPda.toBuffer()],
    programId
  );
}

function getYtMintPda(programId: PublicKey, vaultPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("yt_mint"), vaultPda.toBuffer()],
    programId
  );
}

// ─── Constants from worked example ───────────────────────────────────────────
// Deposit: 18,500,000 raw units (= 18.5 SPYx at 6 decimals, ~$10K at SPY=$540)
// Multiplier at deposit: 1.000000
// Multiplier at maturity: 1.013000 (1.3% dividend accrual)
// Expected excess: total_deposited - pt_claim = 18,500,000 - floor(18,500,000 × 1/1.013)
// Expected pt_claim_raw = floor(18,500,000 × 0.987166) = 18,262,572
// Expected excess_raw   = 18,500,000 - 18,262,572 = 237,428
// YT payout: 130 USDC (simulated Jupiter swap) → usdc_per_yt = 130/18,500,000

const DEPOSIT_AMOUNT = 18_500_000; // raw
const MULTIPLIER_AT_DEPOSIT = 1.0;
const MULTIPLIER_AT_MATURITY = 1.013;
const EXPECTED_PT_CLAIM_RAW = Math.floor(DEPOSIT_AMOUNT * (MULTIPLIER_AT_DEPOSIT / MULTIPLIER_AT_MATURITY));
const EXPECTED_EXCESS_RAW = DEPOSIT_AMOUNT - EXPECTED_PT_CLAIM_RAW;
const SIMULATED_USDC_FROM_SWAP = 130_000_000; // 130 USDC at 6 decimals

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("stocksplit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Stocksplit as Program<Stocksplit>;
  const connection = provider.connection;
  const wallet = (provider.wallet as anchor.Wallet).payer;

  let xstockMint: PublicKey;
  let multiplierAuthority: Keypair;
  let usdcMint: PublicKey;
  let maturityTimestamp: number;
  let vaultPda: PublicKey;
  let vaultBump: number;
  let ptMintPda: PublicKey;
  let ytMintPda: PublicKey;
  let vaultXstockAccount: PublicKey;
  let vaultUsdcAccount: PublicKey;
  let depositorXstockAccount: PublicKey;
  let depositorPtAccount: PublicKey;
  let depositorYtAccount: PublicKey;
  let protocolFeeAccount: PublicKey;   // SPYx fee account for main test vault


  before(async () => {
    const result = await createMockSpyx(connection, wallet, MULTIPLIER_AT_DEPOSIT);
    xstockMint = result.mint;
    multiplierAuthority = result.multiplierAuthority;

    usdcMint = await createUsdcMint(connection, wallet);

    // 30 seconds from now — short enough for tests to wait
    maturityTimestamp = Math.floor(Date.now() / 1000) + 30;

    [vaultPda, vaultBump] = getVaultPda(program.programId, xstockMint, maturityTimestamp);
    [ptMintPda] = getPtMintPda(program.programId, vaultPda);
    [ytMintPda] = getYtMintPda(program.programId, vaultPda);

    vaultXstockAccount = getAssociatedTokenAddressSync(
      xstockMint, vaultPda, true, TOKEN_2022_PROGRAM_ID
    );
    vaultUsdcAccount = getAssociatedTokenAddressSync(
      usdcMint, vaultPda, true, TOKEN_PROGRAM_ID
    );

    depositorXstockAccount = await createAssociatedTokenAccount(
      connection, wallet, xstockMint, wallet.publicKey, undefined, TOKEN_2022_PROGRAM_ID
    );
    await mintTo(
      connection, wallet, xstockMint, depositorXstockAccount, wallet,
      50_000_000, [], undefined, TOKEN_2022_PROGRAM_ID
    );

    // Create protocol fee account for SPYx (Token-2022), owned by wallet = vault.authority
    // Use a non-ATA account (fresh keypair) to avoid address collision with depositorXstockAccount
    // (both would be the ATA for wallet.publicKey + xstockMint, which is the same address)
    const protocolFeeKeypair = Keypair.generate();
    protocolFeeAccount = await createAccount(
      connection, wallet, xstockMint, wallet.publicKey, protocolFeeKeypair, undefined, TOKEN_2022_PROGRAM_ID
    );
  });

  // ─── 1. initialize_vault ──────────────────────────────────────────────────


  describe("1. initialize_vault", () => {
    it("creates vault with correct initial state", async () => {
      await program.methods
        .initializeVault(
          new BN(maturityTimestamp),
          f64ToBN(MULTIPLIER_AT_DEPOSIT)  // initial_multiplier_bits
        )
        .accounts({
          authority: wallet.publicKey,
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

      const vault = await program.account.vault.fetch(vaultPda);

      assert.equal(vault.xstockMint.toBase58(), xstockMint.toBase58());
      assert.equal(vault.ptMint.toBase58(), ptMintPda.toBase58());
      assert.equal(vault.ytMint.toBase58(), ytMintPda.toBase58());
      assert.equal(vault.usdcMint.toBase58(), usdcMint.toBase58());
      assert.equal(vault.maturityTimestamp.toNumber(), maturityTimestamp);
      assert.equal(vault.settled, false);
      assert.equal(vault.totalDepositedRaw.toNumber(), 0);
      assert.equal(vault.totalPtOutstanding.toNumber(), 0);
      assert.equal(vault.totalYtOutstanding.toNumber(), 0);
      assert.equal(vault.authority.toBase58(), wallet.publicKey.toBase58());

      const multiplier = bnToF64(vault.multiplierAtDepositBits);
      assert.approximately(multiplier, MULTIPLIER_AT_DEPOSIT, 0.001,
        "Initial multiplier should be 1.0");

      const currentMult = bnToF64(vault.currentMultiplierBits);
      assert.approximately(currentMult, MULTIPLIER_AT_DEPOSIT, 0.001,
        "Current multiplier should match initial");

      console.log(`  ✓ Vault: ${vaultPda.toBase58()}`);
      console.log(`  ✓ PT mint: ${ptMintPda.toBase58()}`);
      console.log(`  ✓ YT mint: ${ytMintPda.toBase58()}`);
    });

    it("rejects maturity in the past", async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 100;
      const [badVault] = getVaultPda(program.programId, xstockMint, pastTimestamp);
      const [badPtMint] = getPtMintPda(program.programId, badVault);
      const [badYtMint] = getYtMintPda(program.programId, badVault);
      const badVaultXstock = getAssociatedTokenAddressSync(
        xstockMint, badVault, true, TOKEN_2022_PROGRAM_ID
      );
      const badVaultUsdc = getAssociatedTokenAddressSync(
        usdcMint, badVault, true, TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .initializeVault(new BN(pastTimestamp), f64ToBN(1.0))
          .accounts({
            authority: wallet.publicKey,
            xstockMint,
            usdcMint,
            vault: badVault,
            ptMint: badPtMint,
            ytMint: badYtMint,
            vaultXstockAccount: badVaultXstock,
            vaultUsdcAccount: badVaultUsdc,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown InvalidMaturity");
      } catch (e: any) {
        assert.include(e.message, "InvalidMaturity");
      }
    });
  });

  // ─── 2. update_multiplier ─────────────────────────────────────────────────

  describe("2. update_multiplier", () => {
    it("allows authority to update multiplier", async () => {
      const newMult = 1.005;
      await program.methods
        .updateMultiplier(f64ToBN(newMult))
        .accounts({ authority: wallet.publicKey, vault: vaultPda })
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      const currentMult = bnToF64(vault.currentMultiplierBits);
      assert.approximately(currentMult, newMult, 0.0001);

      // Reset back to 1.0 for subsequent tests
      await program.methods
        .updateMultiplier(f64ToBN(MULTIPLIER_AT_DEPOSIT))
        .accounts({ authority: wallet.publicKey, vault: vaultPda })
        .rpc();
    });

    it("rejects non-authority caller", async () => {
      const impostor = Keypair.generate();
      try {
        await program.methods
          .updateMultiplier(f64ToBN(2.0))
          .accounts({ authority: impostor.publicKey, vault: vaultPda })
          .signers([impostor])
          .rpc();
        assert.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized");
      }
    });
  });

  // ─── 3. deposit ───────────────────────────────────────────────────────────

  describe("3. deposit", () => {
    it("mints equal PT and YT on deposit", async () => {
      depositorPtAccount = getAssociatedTokenAddressSync(
        ptMintPda, wallet.publicKey, false, TOKEN_PROGRAM_ID
      );
      depositorYtAccount = getAssociatedTokenAddressSync(
        ytMintPda, wallet.publicKey, false, TOKEN_PROGRAM_ID
      );

      await program.methods
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          depositor: wallet.publicKey,
          vault: vaultPda,
          xstockMint,
          depositorXstockAccount,
          vaultXstockAccount,
          protocolFeeAccount,
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

      // With 10bps fee: fee = 18_500_000 * 10 / 10_000 = 18_500
      // effective = 18_500_000 - 18_500 = 18_481_500
      const EXPECTED_FEE = Math.floor(DEPOSIT_AMOUNT * 10 / 10_000);
      const EXPECTED_EFFECTIVE = DEPOSIT_AMOUNT - EXPECTED_FEE;

      const ptAcct = await getAccount(connection, depositorPtAccount, undefined, TOKEN_PROGRAM_ID);
      const ytAcct = await getAccount(connection, depositorYtAccount, undefined, TOKEN_PROGRAM_ID);
      const vault = await program.account.vault.fetch(vaultPda);

      assert.equal(Number(ptAcct.amount), EXPECTED_EFFECTIVE, "PT balance mismatch (after 10bps fee)");
      assert.equal(Number(ytAcct.amount), EXPECTED_EFFECTIVE, "YT balance mismatch (after 10bps fee)");
      assert.equal(vault.totalDepositedRaw.toNumber(), EXPECTED_EFFECTIVE);
      assert.equal(vault.totalPtOutstanding.toNumber(), EXPECTED_EFFECTIVE);
      assert.equal(vault.totalYtOutstanding.toNumber(), EXPECTED_EFFECTIVE);

      console.log(`  ✓ Deposited ${DEPOSIT_AMOUNT} raw → fee=${EXPECTED_FEE}, effective=${EXPECTED_EFFECTIVE}`);
      console.log(`  ✓ PT=${Number(ptAcct.amount)}, YT=${Number(ytAcct.amount)}`);
    });

    it("rejects zero-amount deposit", async () => {
      try {
        await program.methods
          .deposit(new BN(0))
          .accounts({
            depositor: wallet.publicKey,
            vault: vaultPda,
            xstockMint,
            depositorXstockAccount,
            vaultXstockAccount,
            protocolFeeAccount,
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
        assert.fail("Should have thrown ZeroAmount");
      } catch (e: any) {
        assert.include(e.message, "ZeroAmount");
      }
    });
  });


  // ─── 4. settle ────────────────────────────────────────────────────────────

  describe("4. settle", () => {
    let protocolUsdcFeeAccount: PublicKey;

    before(async () => {
      // Create USDC fee account (non-ATA) owned by wallet (= vault.authority)
      // Using fresh keypair to avoid address collision with depositorUsdcAccount
      const protocolUsdcFeeKeypair = Keypair.generate();
      protocolUsdcFeeAccount = await createAccount(
        connection, wallet, usdcMint, wallet.publicKey, protocolUsdcFeeKeypair,
        { skipPreflight: true, commitment: "confirmed" }, TOKEN_PROGRAM_ID
      );
    });

    it("waits for maturity, updates multiplier, then settles", async () => {
      // Simulate dividend accrual: update vault multiplier to maturity value
      await program.methods
        .updateMultiplier(f64ToBN(MULTIPLIER_AT_MATURITY))
        .accounts({ authority: wallet.publicKey, vault: vaultPda })
        .rpc();

      // Wait for maturity (30 seconds + buffer)
      console.log("  ⏳ Waiting 32s for maturity...");
      await new Promise((resolve) => setTimeout(resolve, 32_000));

      // Pre-fund vault USDC account with simulated swap proceeds
      await mintTo(
        connection, wallet, usdcMint, vaultUsdcAccount, wallet,
        SIMULATED_USDC_FROM_SWAP, [], undefined, TOKEN_PROGRAM_ID
      );

      await program.methods
        .settle(Buffer.from([]))  // empty jupiter_route_data for test
        .accounts({
          caller: wallet.publicKey,
          vault: vaultPda,
          xstockMint,
          vaultXstockAccount,
          vaultUsdcAccount,
          protocolUsdcFeeAccount,
          callerXstockAccount: depositorXstockAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      assert.equal(vault.settled, true, "Vault should be settled");

      const usdcPerYt = bnToF64(vault.usdcPerYtBits);
      assert.isAbove(usdcPerYt, 0, "usdc_per_yt should be positive");

      // With 1% clearinghouse fee: distributable = 130 USDC * 99% = 128.7 USDC
      // total_yt = DEPOSIT_AMOUNT - fee = 18_481_500 (from deposit with 10bps fee)
      const DEPOSIT_FEE = Math.floor(DEPOSIT_AMOUNT * 10 / 10_000);
      const EFFECTIVE_DEPOSIT = DEPOSIT_AMOUNT - DEPOSIT_FEE;
      const SETTLE_FEE = Math.floor(SIMULATED_USDC_FROM_SWAP * 100 / 10_000);
      const DISTRIBUTABLE_USDC = SIMULATED_USDC_FROM_SWAP - SETTLE_FEE;
      const expectedUsdcPerYt = DISTRIBUTABLE_USDC / EFFECTIVE_DEPOSIT;
      assert.approximately(usdcPerYt, expectedUsdcPerYt, expectedUsdcPerYt * 0.01,
        "usdc_per_yt should be based on 99% of USDC");

      console.log(`  ✓ Settled. usdc_per_yt = ${usdcPerYt.toFixed(8)}`);
      console.log(`  ✓ Distributable USDC=${DISTRIBUTABLE_USDC}, total_yt=${EFFECTIVE_DEPOSIT}`);
    });

    it("rejects double settle", async () => {
      try {
        await program.methods
          .settle(Buffer.from([]))
          .accounts({
            caller: wallet.publicKey,
            vault: vaultPda,
            xstockMint,
            vaultXstockAccount,
            vaultUsdcAccount,
            protocolUsdcFeeAccount,
            callerXstockAccount: depositorXstockAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown AlreadySettled");
      } catch (e: any) {
        assert.include(e.message, "AlreadySettled");
      }
    });
  });


  // ─── 5. redeem_pt ─────────────────────────────────────────────────────────

  describe("5. redeem_pt", () => {
    it("burns PT and returns xStock at the correct ratio", async () => {
      const ptBefore = await getAccount(connection, depositorPtAccount, undefined, TOKEN_PROGRAM_ID);
      const xstockBefore = await getAccount(connection, depositorXstockAccount, undefined, TOKEN_2022_PROGRAM_ID);

      // Use actual PT balance (effective_amount after 10bps deposit fee)
      const redeemAmount = new BN(ptBefore.amount.toString());
      const EFFECTIVE_DEPOSIT = Number(ptBefore.amount);

      // Expected xStock = effective_deposit * (m0 / m1)
      const EXPECTED_XSTOCK = Math.floor(EFFECTIVE_DEPOSIT * (MULTIPLIER_AT_DEPOSIT / MULTIPLIER_AT_MATURITY));

      await program.methods
        .redeemPt(redeemAmount)
        .accounts({
          redeemer: wallet.publicKey,
          vault: vaultPda,
          xstockMint,
          ptMint: ptMintPda,
          redeemerPtAccount: depositorPtAccount,
          vaultXstockAccount,
          redeemerXstockAccount: depositorXstockAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const ptAfter = await getAccount(connection, depositorPtAccount, undefined, TOKEN_PROGRAM_ID);
      const xstockAfter = await getAccount(connection, depositorXstockAccount, undefined, TOKEN_2022_PROGRAM_ID);

      const ptBurned = Number(ptBefore.amount) - Number(ptAfter.amount);
      const xstockReceived = Number(xstockAfter.amount) - Number(xstockBefore.amount);

      assert.equal(ptBurned, EFFECTIVE_DEPOSIT, "All PT should be burned");
      assert.approximately(
        xstockReceived, EXPECTED_XSTOCK,
        EXPECTED_XSTOCK * 0.001,
        "xStock returned should match PT claim amount"
      );

      console.log(`  ✓ Burned ${ptBurned} PT → received ${xstockReceived} raw xStock`);
      console.log(`  ✓ Expected ~${EXPECTED_XSTOCK}, got ${xstockReceived}`);
    });
  });


  // ─── 6. claim_yt ─────────────────────────────────────────────────────────

  describe("6. claim_yt", () => {
    it("burns YT and distributes USDC pro-rata", async () => {
      // Create depositor USDC account
      const depositorUsdcAccount = await createAssociatedTokenAccount(
        connection, wallet, usdcMint, wallet.publicKey, undefined, TOKEN_PROGRAM_ID
      );

      const ytBefore = await getAccount(connection, depositorYtAccount, undefined, TOKEN_PROGRAM_ID);
      const usdcBefore = await getAccount(connection, depositorUsdcAccount, undefined, TOKEN_PROGRAM_ID);

      // Use actual YT balance (effective after 10bps deposit fee)
      const EFFECTIVE_YT = Number(ytBefore.amount);

      await program.methods
        .claimYt(new BN(EFFECTIVE_YT))
        .accounts({
          claimer: wallet.publicKey,
          vault: vaultPda,
          ytMint: ytMintPda,
          claimerYtAccount: depositorYtAccount,
          vaultUsdcAccount,
          claimerUsdcAccount: depositorUsdcAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const ytAfter = await getAccount(connection, depositorYtAccount, undefined, TOKEN_PROGRAM_ID);
      const usdcAfter = await getAccount(connection, depositorUsdcAccount, undefined, TOKEN_PROGRAM_ID);

      const ytBurned = Number(ytBefore.amount) - Number(ytAfter.amount);
      const usdcReceived = Number(usdcAfter.amount) - Number(usdcBefore.amount);

      assert.equal(ytBurned, EFFECTIVE_YT, "All YT should be burned");
      // Distributable USDC = 130 USDC * 99% = 128,700,000 raw (1% clearinghouse fee taken at settle)
      const SETTLE_FEE = Math.floor(SIMULATED_USDC_FROM_SWAP * 100 / 10_000);
      const DISTRIBUTABLE_USDC = SIMULATED_USDC_FROM_SWAP - SETTLE_FEE;
      assert.approximately(
        usdcReceived, DISTRIBUTABLE_USDC,
        DISTRIBUTABLE_USDC * 0.01,
        "USDC received should be ~128.7 USDC (99% of 130 after 1% settle fee)"
      );

      console.log(`  ✓ Burned ${ytBurned} YT → received ${(usdcReceived / 1e6).toFixed(6)} USDC`);
      console.log(`  ✓ Expected ~${(DISTRIBUTABLE_USDC / 1e6).toFixed(6)} USDC (99% of ${(SIMULATED_USDC_FROM_SWAP / 1e6).toFixed(2)})`);
    });
  });


  // ─── 7. Off-chain math verification ──────────────────────────────────────

  describe("7. Off-chain math sanity checks", () => {
    it("verifies settlement math: multiplier_ratio", () => {
      const m0 = MULTIPLIER_AT_DEPOSIT;
      const m1 = MULTIPLIER_AT_MATURITY;
      const ratio = m0 / m1;
      const ptClaim = Math.floor(DEPOSIT_AMOUNT * ratio);
      const excess = DEPOSIT_AMOUNT - ptClaim;

      assert.approximately(ratio, 0.98717, 0.0001);
      assert.approximately(ptClaim, EXPECTED_PT_CLAIM_RAW, 100);
      assert.approximately(excess, EXPECTED_EXCESS_RAW, 100);
      assert.isAbove(excess, 0, "excess must be positive when multiplier grew");

      console.log(`  ✓ m0=${m0}, m1=${m1}, ratio=${ratio.toFixed(6)}`);
      console.log(`  ✓ pt_claim_raw=${ptClaim}, excess_raw=${excess}`);
    });

    it("verifies usdc_per_yt math", () => {
      const usdcTotal = SIMULATED_USDC_FROM_SWAP;
      const totalYt = DEPOSIT_AMOUNT;
      const usdcPerYt = usdcTotal / totalYt;

      // $130 USDC / 18.5M raw YT = ~$0.00000703 per raw unit
      assert.approximately(usdcPerYt, 130_000_000 / 18_500_000, 0.00001);
      assert.isAbove(usdcPerYt, 0);

      console.log(`  ✓ usdc_per_yt = ${usdcPerYt.toFixed(8)} (${(usdcPerYt * 1e6).toFixed(2)} micro-USDC)`);
    });

    it("verifies full round-trip: deposit=18.5 SPYx, yield=$130 USDC", () => {
      const rawDeposit = DEPOSIT_AMOUNT;        // 18,500,000
      const m0 = MULTIPLIER_AT_DEPOSIT;         // 1.000000
      const m1 = MULTIPLIER_AT_MATURITY;        // 1.013000
      const totalUsdc = SIMULATED_USDC_FROM_SWAP; // 130_000_000 (130 USDC)

      // What PT holder gets back in raw xStock
      const ptClaimRaw = Math.floor(rawDeposit * (m0 / m1));
      // What YT holder gets in USDC
      const ytUsdcClaim = Math.floor(rawDeposit * (totalUsdc / rawDeposit));
      // Total raw xStock in vault at maturity
      const totalRaw = rawDeposit;

      // Conservation check: PT raw claim + excess = total deposited
      const excess = totalRaw - ptClaimRaw;
      assert.equal(ptClaimRaw + excess, rawDeposit, "Conservation: PT + excess = deposited");

      // The full position value is preserved across the split
      // PT holder: same xStock UI amount (18.5 SPYx × m0/m1 raw = same UI value)
      const ptUiValue = ptClaimRaw * m1; // raw × current_multiplier = ui_amount
      const depositUiValue = rawDeposit * m0;
      // These should be approximately equal
      assert.approximately(ptUiValue / depositUiValue, 1.0, 0.001);

      console.log(`  ✓ Round trip verified:`);
      console.log(`    Deposited:    ${rawDeposit} raw (= ${(rawDeposit * m0 / 1e6).toFixed(2)} SPYx)`);
      console.log(`    PT reclaim:   ${ptClaimRaw} raw (= ${(ptClaimRaw * m1 / 1e6).toFixed(2)} SPYx)`);
      console.log(`    YT payout:    ${(ytUsdcClaim / 1e6).toFixed(2)} USDC`);
      console.log(`    Excess raw:   ${excess}`);
    });
  });

  // ─── 8. withdraw ─────────────────────────────────────────────────────────

  describe("8. withdraw", () => {
    let withdrawVaultPda: PublicKey;
    let withdrawPtMint: PublicKey;
    let withdrawYtMint: PublicKey;
    let withdrawVaultXstockAccount: PublicKey;
    let withdrawerPtAccount: PublicKey;
    let withdrawerYtAccount: PublicKey;
    let withdrawMaturity: number;

    before(async () => {
      // Fresh vault with 1-year maturity so it won't expire during these tests
      withdrawMaturity = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
      [withdrawVaultPda] = getVaultPda(program.programId, xstockMint, withdrawMaturity);
      [withdrawPtMint] = getPtMintPda(program.programId, withdrawVaultPda);
      [withdrawYtMint] = getYtMintPda(program.programId, withdrawVaultPda);

      withdrawVaultXstockAccount = getAssociatedTokenAddressSync(
        xstockMint, withdrawVaultPda, true, TOKEN_2022_PROGRAM_ID
      );
      const withdrawVaultUsdcAccount = getAssociatedTokenAddressSync(
        usdcMint, withdrawVaultPda, true, TOKEN_PROGRAM_ID
      );

      // Initialize fresh vault
      await program.methods
        .initializeVault(
          new BN(withdrawMaturity),
          f64ToBN(MULTIPLIER_AT_DEPOSIT)
        )
        .accounts({
          authority: wallet.publicKey,
          xstockMint,
          usdcMint,
          vault: withdrawVaultPda,
          ptMint: withdrawPtMint,
          ytMint: withdrawYtMint,
          vaultXstockAccount: withdrawVaultXstockAccount,
          vaultUsdcAccount: withdrawVaultUsdcAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Derive ATA addresses for withdrawer's PT/YT in this vault
      withdrawerPtAccount = getAssociatedTokenAddressSync(withdrawPtMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);
      withdrawerYtAccount = getAssociatedTokenAddressSync(withdrawYtMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);

      // Deposit 18.5 SPYx — this creates PT/YT ATAs via init_if_needed in the instruction
      // Note: 10bps fee applies, effective = DEPOSIT_AMOUNT - fee
      await program.methods
        .deposit(new BN(DEPOSIT_AMOUNT))
        .accounts({
          depositor: wallet.publicKey,
          vault: withdrawVaultPda,
          xstockMint,
          depositorXstockAccount,
          vaultXstockAccount: withdrawVaultXstockAccount,
          protocolFeeAccount,
          ptMint: withdrawPtMint,
          ytMint: withdrawYtMint,
          depositorPtAccount: withdrawerPtAccount,
          depositorYtAccount: withdrawerYtAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    });

    it("withdraws SPYx before maturity and updates accounting", async () => {
      // Effective deposit after 10bps fee = 18_481_500
      const DEPOSIT_FEE = Math.floor(DEPOSIT_AMOUNT * 10 / 10_000);
      const EFFECTIVE_DEPOSIT = DEPOSIT_AMOUNT - DEPOSIT_FEE; // 18_481_500

      const withdrawAmount = 10_000_000; // 10 SPYx raw
      const remaining = EFFECTIVE_DEPOSIT - withdrawAmount; // 8_481_500

      const xstockBefore = await getAccount(connection, depositorXstockAccount, undefined, TOKEN_2022_PROGRAM_ID);
      const xstockBalanceBefore = Number(xstockBefore.amount);

      await program.methods
        .withdraw(new BN(withdrawAmount))
        .accounts({
          withdrawer: wallet.publicKey,
          vault: withdrawVaultPda,
          xstockMint,
          ptMint: withdrawPtMint,
          ytMint: withdrawYtMint,
          withdrawerPtAccount,
          withdrawerYtAccount,
          withdrawerXstockAccount: depositorXstockAccount,
          vaultXstockAccount: withdrawVaultXstockAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Vault accounting
      const vault = await program.account.vault.fetch(withdrawVaultPda);
      assert.equal(vault.totalDepositedRaw.toNumber(), remaining, "totalDepositedRaw updated");
      assert.equal(vault.totalPtOutstanding.toNumber(), remaining, "totalPtOutstanding updated");
      assert.equal(vault.totalYtOutstanding.toNumber(), remaining, "totalYtOutstanding updated");
      console.log(`  ✓ Effective deposit: ${EFFECTIVE_DEPOSIT}, withdrew: ${withdrawAmount}, remaining: ${remaining}`);

      // PT/YT balances burned correctly
      const ptAcc = await getAccount(connection, withdrawerPtAccount, undefined, TOKEN_PROGRAM_ID);
      assert.equal(Number(ptAcc.amount), remaining, "PT balance after withdraw");

      const ytAcc = await getAccount(connection, withdrawerYtAccount, undefined, TOKEN_PROGRAM_ID);
      assert.equal(Number(ytAcc.amount), remaining, "YT balance after withdraw");
      console.log(`  ✓ Burned ${withdrawAmount} PT + ${withdrawAmount} YT`);

      // SPYx returned to withdrawer
      const xstockAfter = await getAccount(connection, depositorXstockAccount, undefined, TOKEN_2022_PROGRAM_ID);
      const xstockReceived = Number(xstockAfter.amount) - xstockBalanceBefore;
      assert.equal(xstockReceived, withdrawAmount, "Withdrawer received correct SPYx amount");
      console.log(`  ✓ Withdrawer received ${xstockReceived} raw SPYx back`);
    });

    it("rejects withdraw after settlement", async () => {
      // vaultPda (from outer scope) is the vault settled in test 4
      // The constraint !vault.settled fires before any balance check
      try {
        await program.methods
          .withdraw(new BN(1))
          .accounts({
            withdrawer: wallet.publicKey,
            vault: vaultPda,
            xstockMint,
            ptMint: ptMintPda,
            ytMint: ytMintPda,
            withdrawerPtAccount: depositorPtAccount,
            withdrawerYtAccount: depositorYtAccount,
            withdrawerXstockAccount: depositorXstockAccount,
            vaultXstockAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown WithdrawAfterSettlement");
      } catch (err: any) {
        const msg = err.message || err.toString();
        assert.ok(
          msg.includes("WithdrawAfterSettlement") || msg.includes("Cannot withdraw after vault"),
          `Expected WithdrawAfterSettlement, got: ${msg.slice(0, 200)}`
        );
        console.log("  ✓ Correctly rejected withdraw on settled vault");
      }
    });
  });

  // ─── 9. protocol fees ────────────────────────────────────────────────────

  describe("9. protocol fees", () => {
    // Fresh vault with long maturity, shared across all three fee tests
    let feeVaultPda: PublicKey;
    let feePtMint: PublicKey;
    let feeYtMint: PublicKey;
    let feeVaultXstockAccount: PublicKey;
    let feeVaultUsdcAccount: PublicKey;
    let feeDepositorPtAccount: PublicKey;
    let feeDepositorYtAccount: PublicKey;
    let feeProtocolSPYxAccount: PublicKey;   // SPYx fee account owned by authority
    let feeProtocolUsdcAccount: PublicKey;   // USDC fee account owned by authority
    let feeMaturity: number;

    before(async () => {
      // Allow devnet to recover after the 32-40s settle wait in section 4
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Compute PDA addresses (deterministic)
      feeMaturity = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
      [feeVaultPda] = getVaultPda(program.programId, xstockMint, feeMaturity);
      [feePtMint] = getPtMintPda(program.programId, feeVaultPda);
      [feeYtMint] = getYtMintPda(program.programId, feeVaultPda);

      feeVaultXstockAccount = getAssociatedTokenAddressSync(
        xstockMint, feeVaultPda, true, TOKEN_2022_PROGRAM_ID
      );
      feeVaultUsdcAccount = getAssociatedTokenAddressSync(
        usdcMint, feeVaultPda, true, TOKEN_PROGRAM_ID
      );

      feeDepositorPtAccount = getAssociatedTokenAddressSync(feePtMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);
      feeDepositorYtAccount = getAssociatedTokenAddressSync(feeYtMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);

      // Retry loop — devnet can be congested after the long settle wait,
      // causing TransactionExpiredBlockheightExceededError. A fresh keypair + fresh
      // blockhash is fetched on each attempt.
      let lastError: any;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          // Generate fresh keypairs on every attempt (old ones may have partially submitted txs)
          const spyxKp = Keypair.generate();
          feeProtocolSPYxAccount = await createAccount(
            connection, wallet, xstockMint, wallet.publicKey, spyxKp,
            { skipPreflight: true, commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
          );
          const usdcKp = Keypair.generate();
          feeProtocolUsdcAccount = await createAccount(
            connection, wallet, usdcMint, wallet.publicKey, usdcKp,
            { skipPreflight: true, commitment: "confirmed" }, TOKEN_PROGRAM_ID
          );
          await program.methods
            .initializeVault(new BN(feeMaturity), f64ToBN(MULTIPLIER_AT_DEPOSIT))
            .accounts({
              authority: wallet.publicKey,
              xstockMint,
              usdcMint,
              vault: feeVaultPda,
              ptMint: feePtMint,
              ytMint: feeYtMint,
              vaultXstockAccount: feeVaultXstockAccount,
              vaultUsdcAccount: feeVaultUsdcAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
              token2022Program: TOKEN_2022_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .rpc({ skipPreflight: true, commitment: "confirmed" });
          console.log(`  ✓ Section 9 setup succeeded on attempt ${attempt}`);
          lastError = undefined;
          break;
        } catch (e: any) {
          lastError = e;
          console.log(`  ⟳ Section 9 setup attempt ${attempt} failed: ${String(e.message || e).slice(0, 80)}`);
          if (attempt < 4) await new Promise(r => setTimeout(r, 5000));
        }
      }
      if (lastError) throw lastError;
    });


    // ── Test 1: Deposit fee ───────────────────────────────────────────────

    it("Test 1 — deposit 18.5 SPYx: user receives 18,481,500 PT/YT, protocol receives 18,500 SPYx", async () => {
      const AMOUNT = 18_500_000; // 18.5 SPYx at 6 decimals
      const EXPECTED_FEE = Math.floor(AMOUNT * 10 / 10_000); // 18_500
      const EXPECTED_EFFECTIVE = AMOUNT - EXPECTED_FEE;      // 18_481_500

      // Snapshot balances before
      const spyxFeeBefore = await getAccount(connection, feeProtocolSPYxAccount, undefined, TOKEN_2022_PROGRAM_ID);
      const vaultXstockBefore = await getAccount(connection, feeVaultXstockAccount, undefined, TOKEN_2022_PROGRAM_ID);

      await program.methods
        .deposit(new BN(AMOUNT))
        .accounts({
          depositor: wallet.publicKey,
          vault: feeVaultPda,
          xstockMint,
          depositorXstockAccount,
          vaultXstockAccount: feeVaultXstockAccount,
          protocolFeeAccount: feeProtocolSPYxAccount,
          ptMint: feePtMint,
          ytMint: feeYtMint,
          depositorPtAccount: feeDepositorPtAccount,
          depositorYtAccount: feeDepositorYtAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Verify PT and YT balances
      const ptAcct = await getAccount(connection, feeDepositorPtAccount, undefined, TOKEN_PROGRAM_ID);
      const ytAcct = await getAccount(connection, feeDepositorYtAccount, undefined, TOKEN_PROGRAM_ID);
      assert.equal(Number(ptAcct.amount), EXPECTED_EFFECTIVE, `PT should be ${EXPECTED_EFFECTIVE} (18,481,500)`);
      assert.equal(Number(ytAcct.amount), EXPECTED_EFFECTIVE, `YT should be ${EXPECTED_EFFECTIVE} (18,481,500)`);

      // Verify protocol fee account received exact fee
      const spyxFeeAfter = await getAccount(connection, feeProtocolSPYxAccount, undefined, TOKEN_2022_PROGRAM_ID);
      const feeReceived = Number(spyxFeeAfter.amount) - Number(spyxFeeBefore.amount);
      assert.equal(feeReceived, EXPECTED_FEE, `Protocol SPYx fee should be ${EXPECTED_FEE} (18,500)`);

      // Verify vault xstock account received effective_amount
      const vaultXstockAfter = await getAccount(connection, feeVaultXstockAccount, undefined, TOKEN_2022_PROGRAM_ID);
      const vaultReceived = Number(vaultXstockAfter.amount) - Number(vaultXstockBefore.amount);
      assert.equal(vaultReceived, EXPECTED_EFFECTIVE, `Vault xstock should increase by ${EXPECTED_EFFECTIVE}`);

      // Verify vault accounting
      const vault = await program.account.vault.fetch(feeVaultPda);
      assert.equal(vault.totalDepositedRaw.toNumber(), EXPECTED_EFFECTIVE, "totalDepositedRaw should be effective_amount");
      assert.equal(vault.totalPtOutstanding.toNumber(), EXPECTED_EFFECTIVE, "totalPtOutstanding should be effective_amount");
      assert.equal(vault.totalYtOutstanding.toNumber(), EXPECTED_EFFECTIVE, "totalYtOutstanding should be effective_amount");

      console.log(`  ✓ Deposited:           ${AMOUNT.toLocaleString()} raw SPYx`);
      console.log(`  ✓ Fee (10 bps):        ${EXPECTED_FEE.toLocaleString()} raw → protocol account`);
      console.log(`  ✓ Effective (99.9%):   ${EXPECTED_EFFECTIVE.toLocaleString()} raw`);
      console.log(`  ✓ User PT balance:     ${Number(ptAcct.amount).toLocaleString()}`);
      console.log(`  ✓ User YT balance:     ${Number(ytAcct.amount).toLocaleString()}`);
      console.log(`  ✓ Protocol SPYx recv:  ${feeReceived.toLocaleString()}`);
      console.log(`  ✓ Vault xstock recv:   ${vaultReceived.toLocaleString()}`);
    });

    // ── Test 2: Settle clearinghouse fee ─────────────────────────────────

    it("Test 2 — settle: protocol receives 1% USDC fee, usdc_per_yt uses 99%", async () => {
      // Fast-forward: update multiplier then wait won't work in same test run for 365-day vault.
      // Instead we use a trick: we need to make this vault mature.
      // We'll create a short-maturity vault specifically for this test.
      const shortMaturity = Math.floor(Date.now() / 1000) + 30;
      const [shortVaultPda] = getVaultPda(program.programId, xstockMint, shortMaturity);
      const [shortPtMint] = getPtMintPda(program.programId, shortVaultPda);
      const [shortYtMint] = getYtMintPda(program.programId, shortVaultPda);
      const shortVaultXstock = getAssociatedTokenAddressSync(xstockMint, shortVaultPda, true, TOKEN_2022_PROGRAM_ID);
      const shortVaultUsdc = getAssociatedTokenAddressSync(usdcMint, shortVaultPda, true, TOKEN_PROGRAM_ID);
      const shortDepositorPt = getAssociatedTokenAddressSync(shortPtMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);
      const shortDepositorYt = getAssociatedTokenAddressSync(shortYtMint, wallet.publicKey, false, TOKEN_PROGRAM_ID);

      // Initialize short vault
      await program.methods
        .initializeVault(new BN(shortMaturity), f64ToBN(MULTIPLIER_AT_DEPOSIT))
        .accounts({
          authority: wallet.publicKey,
          xstockMint,
          usdcMint,
          vault: shortVaultPda,
          ptMint: shortPtMint,
          ytMint: shortYtMint,
          vaultXstockAccount: shortVaultXstock,
          vaultUsdcAccount: shortVaultUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      // Deposit so there are YT tokens outstanding
      await program.methods
        .deposit(new BN(18_500_000))
        .accounts({
          depositor: wallet.publicKey,
          vault: shortVaultPda,
          xstockMint,
          depositorXstockAccount,
          vaultXstockAccount: shortVaultXstock,
          protocolFeeAccount: feeProtocolSPYxAccount,
          ptMint: shortPtMint,
          ytMint: shortYtMint,
          depositorPtAccount: shortDepositorPt,
          depositorYtAccount: shortDepositorYt,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      // Update multiplier to simulate dividend accrual
      await program.methods
        .updateMultiplier(f64ToBN(MULTIPLIER_AT_MATURITY))
        .accounts({ authority: wallet.publicKey, vault: shortVaultPda })
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      // Wait for maturity
      console.log("  ⏳ Waiting 32s for fee-test vault maturity...");
      await new Promise((resolve) => setTimeout(resolve, 32_000));

      // Pre-fund vault USDC — 130 USDC = 130_000_000 raw
      const TOTAL_USDC = 130_000_000;
      await mintTo(connection, wallet, usdcMint, shortVaultUsdc, wallet, TOTAL_USDC, [],
        { skipPreflight: true, commitment: "confirmed" }, TOKEN_PROGRAM_ID);

      // Record protocol USDC balance before
      const usdcFeeBefore = await getAccount(connection, feeProtocolUsdcAccount, undefined, TOKEN_PROGRAM_ID);

      const shortDepositorXstock = getAssociatedTokenAddressSync(xstockMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);

      await program.methods
        .settle(Buffer.from([]))
        .accounts({
          caller: wallet.publicKey,
          vault: shortVaultPda,
          xstockMint,
          vaultXstockAccount: shortVaultXstock,
          vaultUsdcAccount: shortVaultUsdc,
          protocolUsdcFeeAccount: feeProtocolUsdcAccount,
          callerXstockAccount: depositorXstockAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });


      const vault = await program.account.vault.fetch(shortVaultPda);
      assert.equal(vault.settled, true, "Vault should be settled");

      // Fee math: 130_000_000 * 100 / 10_000 = 1_300_000 (1.30 USDC)
      const EXPECTED_FEE_USDC = Math.floor(TOTAL_USDC * 100 / 10_000);   // 1_300_000
      const EXPECTED_DISTRIBUTABLE = TOTAL_USDC - EXPECTED_FEE_USDC;       // 128_700_000

      // Verify protocol USDC received the 1% fee
      const usdcFeeAfter = await getAccount(connection, feeProtocolUsdcAccount, undefined, TOKEN_PROGRAM_ID);
      const usdcFeeReceived = Number(usdcFeeAfter.amount) - Number(usdcFeeBefore.amount);
      assert.equal(usdcFeeReceived, EXPECTED_FEE_USDC, `Protocol should receive ${EXPECTED_FEE_USDC} raw USDC (1.30 USDC)`);

      // Verify usdc_per_yt is calculated on distributable USDC (99%)
      const DEPOSIT_FEE = Math.floor(18_500_000 * 10 / 10_000);
      const EFFECTIVE_YT = 18_500_000 - DEPOSIT_FEE; // 18_481_500
      const usdcPerYt = bnToF64(vault.usdcPerYtBits);
      const expectedUsdcPerYt = EXPECTED_DISTRIBUTABLE / EFFECTIVE_YT;
      assert.approximately(usdcPerYt, expectedUsdcPerYt, expectedUsdcPerYt * 0.001,
        "usdc_per_yt should be based on distributable USDC (99%)");

      console.log(`  ✓ Total USDC:          ${TOTAL_USDC.toLocaleString()} raw (${TOTAL_USDC / 1e6} USDC)`);
      console.log(`  ✓ Fee (100 bps / 1%):  ${EXPECTED_FEE_USDC.toLocaleString()} raw (${EXPECTED_FEE_USDC / 1e6} USDC) → protocol`);
      console.log(`  ✓ Distributable (99%): ${EXPECTED_DISTRIBUTABLE.toLocaleString()} raw (${EXPECTED_DISTRIBUTABLE / 1e6} USDC)`);
      console.log(`  ✓ Effective YT supply: ${EFFECTIVE_YT.toLocaleString()}`);
      console.log(`  ✓ usdc_per_yt:         ${usdcPerYt.toFixed(10)} (expected ${expectedUsdcPerYt.toFixed(10)})`);
      console.log(`  ✓ Protocol USDC recv:  ${usdcFeeReceived.toLocaleString()} raw = ${(usdcFeeReceived / 1e6).toFixed(6)} USDC`);
    });

    // ── Test 3: Invalid fee account rejection ─────────────────────────────

    it("Test 3 — invalid fee account: deposit rejects if protocol_fee_account owner != vault.authority", async () => {
      // Create a random impostor keypair
      const impostor = Keypair.generate();

      // Fund impostor with SOL from wallet (avoids rate-limited devnet airdrop)
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: impostor.publicKey,
            lamports: 10_000_000, // 0.01 SOL — enough for rent
          })
        ),
        [wallet],
        { skipPreflight: true, commitment: "confirmed" }
      );

      // Create SPYx token account owned by impostor (NOT vault.authority)
      const impostorSPYxAccount = await createAccount(
        connection, wallet, xstockMint, impostor.publicKey, undefined,
        { skipPreflight: true, commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );


      try {
        await program.methods
          .deposit(new BN(1_000_000))
          .accounts({
            depositor: wallet.publicKey,
            vault: feeVaultPda,
            xstockMint,
            depositorXstockAccount,
            vaultXstockAccount: feeVaultXstockAccount,
            protocolFeeAccount: impostorSPYxAccount,  // wrong owner!
            ptMint: feePtMint,
            ytMint: feeYtMint,
            depositorPtAccount: feeDepositorPtAccount,
            depositorYtAccount: feeDepositorYtAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        assert.fail("Should have thrown InvalidFeeAccount");
      } catch (e: any) {
        const msg = e.message || e.toString();
        assert.ok(
          msg.includes("InvalidFeeAccount") || msg.includes("invalid owner") || msg.includes("fee account"),
          `Expected InvalidFeeAccount error, got: ${msg.slice(0, 300)}`
        );
        console.log("  ✓ Correctly rejected deposit with wrong-owner fee account");
        console.log(`  ✓ Error: ${msg.slice(0, 100)}`);
      }
    });
  });

});
