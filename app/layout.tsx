import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Property Dossier",
  description: "Permits, zoning, tax, flood, violations and schools for any NYC address, pulled live from official sources.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
