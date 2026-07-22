import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { WagmiProvider } from "@/components/WagmiProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const baseAppId = "6a5f3aa7078f6baf9ef30020";
const talentProjectVerification =
  "51093979700d7bbe1757ad94a37a940e2dee828f07c2e14fbee4250d37ed83b69f8e1818f0eb094f713042ceec2da3afd5d8e5b2f32a426efe1cc1ab183a7a07";

export const metadata: Metadata = {
  title: "BaseSplit Club",
  description: "Split bills. Settle on Base. Keep the memory."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="base:app_id" content={baseAppId} />
        <meta name="talentapp:project_verification" content={talentProjectVerification} />
      </head>
      <body className={inter.className}>
        <WagmiProvider>{children}</WagmiProvider>
      </body>
    </html>
  );
}
