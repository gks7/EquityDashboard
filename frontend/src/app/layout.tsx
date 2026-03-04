import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AlphaDash — Family Office",
  description: "Equity research and portfolio analytics for family offices.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} antialiased font-[family-name:var(--font-geist-sans)]`}
        style={{ background: '#0a0e1a', color: '#e2e8f0' }}
      >
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 md:ml-64 overflow-y-auto">
            <div className="p-8 max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
