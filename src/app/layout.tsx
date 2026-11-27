import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";

const head = Barlow_Condensed({ variable: "--font-head", weight: ["700", "800"], subsets: ["latin"] });
const body = Inter({ variable: "--font-body", weight: ["400", "600"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bandyspel",
  description: "Rita och spela upp bandyspel",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#F5F8FA",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={`${head.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
