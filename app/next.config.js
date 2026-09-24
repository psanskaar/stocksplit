/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || process.env.RPC_URL,
    RPC_URL: process.env.SOLANA_RPC_URL || process.env.RPC_URL,
  },
  transpilePackages: [
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-wallets",
    "@meteora-ag/dynamic-bonding-curve-sdk",
    "@meteora-ag/dynamic-amm-sdk",
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        os: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
