import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
  title: "FP Fantasy League",
  description: "Fantasy football scored from post-game NFL charting data.",
  icons: { icon: "/brand/Submark-Red.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${kanit.variable} ${mulish.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
