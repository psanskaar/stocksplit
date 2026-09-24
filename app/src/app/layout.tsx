import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SolanaProvider } from "@/providers/solana-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "StockSplit — Split Any Stock Into Price & Dividends",
  description:
    "Buy the S&P 500 at a discount or buy pure dividend yield. First on-chain yield-stripping protocol for tokenized equities on Solana.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} min-h-screen flex flex-col bg-[#0a0a1a] text-slate-200 antialiased`}>
        <SolanaProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </SolanaProvider>
      </body>
    </html>
  );
}
