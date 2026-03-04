import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased font-[family-name:var(--font-geist-sans)] bg-slate-50 dark:bg-[#0a0e1a] text-slate-900 dark:text-slate-100 transition-colors duration-300`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 md:ml-64 overflow-y-auto">
              <div className="p-8 max-w-7xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
