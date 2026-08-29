import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/brand";

/* Numerals, scores, invite codes — per the Game Day handoff. */
const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbmono",
  display: "swap",
});

/* Brand typefaces (BrandStyleGuide v6): Kanit ExtraBold Italic for display,
   Mulish for everything else. Loaded locally from the approved files. */
const kanit = localFont({
  src: "../fonts/Kanit-ExtraBoldItalic.ttf",
  weight: "800",
  style: "italic",
  variable: "--font-kanit",
  display: "swap",
});

const mulish = localFont({
  src: "../fonts/Mulish-VariableFont_wght.ttf",
  variable: "--font-mulish",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: "website",
    url: "/",
  },
  icons: { icon: "/brand/Submark-Red.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${kanit.variable} ${mulish.variable} ${jbMono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
