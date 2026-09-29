import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alex & Joanna",
  description: "Alex & Joanna, 28 August 2027",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
