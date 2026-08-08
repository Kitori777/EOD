import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Eyes of Odin — Scenario Studio",
    description: "Interaktywne laboratorium danych, decyzji i scenariuszy what-if.",
    openGraph: {
      title: "Eyes of Odin — Scenario Studio",
      description: "Modeluj dane. Wybieraj ścieżki. Zobacz, co zmieni wynik.",
      images: [{ url: imageUrl, width: 1733, height: 907, alt: "Eyes of Odin Scenario Studio" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Eyes of Odin — Scenario Studio",
      description: "Interaktywne laboratorium danych i scenariuszy what-if.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
