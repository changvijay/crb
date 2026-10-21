import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Footer } from "@/components/site/Footer";
import { AuthProvider } from "@/components/site/AuthProvider";
import { LoginGate } from "@/components/site/LoginGate";
import { MarketTape } from "@/components/shell/MarketTape";
import { Rail } from "@/components/shell/Rail";
import "./globals.css";

const sans = Inter({ variable: "--f-sans", subsets: ["latin"], display: "swap" });
const display = Space_Grotesk({ variable: "--f-display", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--f-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://crb.changtechs.com"),
  title: {
    default: "Chang Research Base (CRB): Daily Nifty Market Report",
    template: "%s | CRB",
  },
  applicationName: "Chang Research Base",
  authors: [{ name: "Chang Research Base (CRB)" }],
  icons: { icon: "/logo.png" },
  robots: { index: true, follow: true, googleBot: { "max-image-preview": "large", "max-snippet": -1 } },
  verification: { google: "VuhAaH8s-RERqzy78sOymhNLAD7Ul9sIg5RF_sD4h-U" },
  openGraph: { type: "website", siteName: "Chang Research Base (CRB)", locale: "en_IN", images: ["/seo_og_banner.png"] },
  twitter: { card: "summary_large_image", images: ["/seo_og_banner.png"] },
};

// Dark by default; honours a saved choice. Runs before first paint (no flash).
const themeInit = `try{var t=localStorage.getItem('crb-theme');if(t!=='dark'&&t!=='light'){t='dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-[var(--surface)] focus:px-4 focus:py-2">Skip to content</a>
        <AuthProvider>
          <Rail />
          <div className="lg:pl-[var(--rail)]">
            <div className="sticky top-14 z-30 lg:top-0"><MarketTape /></div>
            <main id="main">{children}</main>
            <Footer />
          </div>
          <LoginGate />
        </AuthProvider>
      </body>
    </html>
  );
}
