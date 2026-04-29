import type { Metadata } from "next";
import { Cormorant_Garamond, Great_Vibes, Quicksand } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { serverEnv } from "@/lib/env";
import "./globals.css";
import "../styles/styles.css";
import "../styles/styles-extra.css";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-great-vibes",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shear Simplicity",
  description: "Salon scheduling and POS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const body = (
    <html
      lang="en"
      className={`${quicksand.variable} ${cormorant.variable} ${greatVibes.variable}`}
    >
      <body className="theme-light">{children}</body>
    </html>
  );
  // ClerkProvider is a no-op in dev mode but pulls in Clerk's runtime —
  // keep it conditional so the dev bundle stays free of Clerk weight.
  return serverEnv.authProvider === "clerk" ? (
    <ClerkProvider>{body}</ClerkProvider>
  ) : (
    body
  );
}
