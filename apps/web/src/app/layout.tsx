import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { serverEnv } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShearSimplicity",
  description: "Salon scheduling and POS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const body = (
    <html lang="en">
      <body>{children}</body>
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
