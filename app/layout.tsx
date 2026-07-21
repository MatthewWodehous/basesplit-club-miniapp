import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { WagmiProvider } from "@/components/WagmiProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const baseAppId = process.env.NEXT_PUBLIC_BASE_APP_ID || "[base.dev Verify token]";

export const metadata: Metadata = {
  title: "BaseSplit Club",
  description: "Split bills. Settle on Base. Keep the memory."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="base:app_id" content={baseAppId} />
      </head>
      <body className={inter.className}>
        <WagmiProvider>{children}</WagmiProvider>
      </body>
    </html>
  );
}
