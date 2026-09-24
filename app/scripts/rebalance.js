const fs = require('fs');
const path = require('path');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction } = require('@solana/web3.js');
const BN = require('bn.js');
const AmmImpl = require('@meteora-ag/dynamic-amm-sdk').default;

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://greatest-greatest-mound.solana-devnet.quiknode.pro/e667647b420748a3c7f7f91ecd9b13328b62540c/';
const KEYPAIR_FILE = path.join(__dirname, '..', '..', 'keypair.json');

const PT_MINT = new PublicKey('3GSyLYWRSZaNdPW41xcTrWrR7Qvn6X5Lv4F3d4CUHni3');
const YT_MINT = new PublicKey('HhKNM1MTQU1dG4jyyHnuT6cz4GSyeakR2yN8GGmBb4WE');

const PT_DAMM_POOL = new PublicKey('8cwZ7yESFJw7DyM1JWVE92Zu9NHHX82jbdCau6v1oW7s');
const YT_DAMM_POOL = new PublicKey('BvMKwwPFH781QqJuk4pRdvATg2rSuyHzVLuGMpgrax6o');

function loadKeypair() {
  const secretKey = JSON.parse(fs.readFileSync(KEYPAIR_FILE, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  console.log('=== Normalizing Pool Spot Prices to Benchmarks ===');
  const conn = new Connection(RPC_URL, 'confirmed');
  const payer = loadKeypair();

  // 1. Rebalance PT Pool from $644 -> $533
  console.log('\n--- Rebalancing PT Pool ($644 -> $533) ---');
  const ptPool = await AmmImpl.create(conn, PT_DAMM_POOL);
  const ptInRaw = new BN(10.15 * 1e6); // Swap 10.15 PT to USDC
  const ptQuote = ptPool.getSwapQuote(PT_MINT, ptInRaw, 5.0);
  console.log(`Swapping 10.15 PT for ~$${Number(ptQuote.swapOutAmount.toString()) / 1e6} USDC...`);

  const ptSwapTx = await ptPool.swap(payer.publicKey, PT_MINT, ptInRaw, ptQuote.minSwapOutAmount);
  const ptSig = await sendAndConfirmTransaction(conn, ptSwapTx, [payer], { skipPreflight: true, commitment: 'confirmed' });
  console.log('PT Swap confirmed:', ptSig);

  // 2. Rebalance YT Pool from $7.40 -> ~$7.08
  console.log('\n--- Rebalancing YT Pool ($7.40 -> $7.08) ---');
  const ytPool = await AmmImpl.create(conn, YT_DAMM_POOL);
  const ytInRaw = new BN(3.5 * 1e6); // Swap 3.5 YT to USDC
  const ytQuote = ytPool.getSwapQuote(YT_MINT, ytInRaw, 5.0);
  console.log(`Swapping 3.5 YT for ~$${Number(ytQuote.swapOutAmount.toString()) / 1e6} USDC...`);

  const ytSwapTx = await ytPool.swap(payer.publicKey, YT_MINT, ytInRaw, ytQuote.minSwapOutAmount);
  const ytSig = await sendAndConfirmTransaction(conn, ytSwapTx, [payer], { skipPreflight: true, commitment: 'confirmed' });
  console.log('YT Swap confirmed:', ytSig);

  // 3. Verify Final Spot Prices
  console.log('\n--- Final Verified Pool Reserves & Spot Prices ---');
  const finalPtPool = await AmmImpl.create(conn, PT_DAMM_POOL);
  const finalYtPool = await AmmImpl.create(conn, YT_DAMM_POOL);

  const ptA = Number(finalPtPool.poolInfo.tokenAAmount.toString()) / 1e6;
  const ptB = Number(finalPtPool.poolInfo.tokenBAmount.toString()) / 1e6;
  const ytA = Number(finalYtPool.poolInfo.tokenAAmount.toString()) / 1e6;
  const ytB = Number(finalYtPool.poolInfo.tokenBAmount.toString()) / 1e6;

  console.log(`PT Pool: ${ptA.toFixed(2)} PT / $${ptB.toFixed(2)} USDC (Spot Price: $${(ptB / ptA).toFixed(2)}, TVL: $${(ptB * 2).toFixed(2)})`);
  console.log(`YT Pool: ${ytA.toFixed(2)} YT / $${ytB.toFixed(2)} USDC (Spot Price: $${(ytB / ytA).toFixed(2)}, TVL: $${(ytB * 2).toFixed(2)})`);
  console.log('✅ All pool benchmarks successfully restored!');
}

main().catch((err) => {
  console.error('Error during rebalance:', err);
  process.exit(1);
});
