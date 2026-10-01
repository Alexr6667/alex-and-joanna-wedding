import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from this site, so
// guests' browsers never contact Google. The CSS variables feed the
// --font-serif and --font-sans tokens in globals.css.
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// The site is private by default, so the shared metadata carries no wedding
// details, not even names (link previews show it to anyone with the URL), and
// nothing is indexed. The home page names the couple once the site is visible.
export const metadata: Metadata = {
  title: "Wedding",
  description: "A private wedding website.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`h-full antialiased ${display.variable} ${body.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
