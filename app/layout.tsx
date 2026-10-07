import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FabHexaGrogne V3",
  description:
    "Jeu de stratégie hexagonal : encerclez des territoires, récoltez des cristaux et faites évoluer votre IA.",
  applicationName: "FabHexaGrogne V3",
  manifest: "/manifest.webmanifest?icon=f-v3-t351-league-fix",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FabHexaGrogne V3",
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://fabhexagrognev3.gnrationsia.chatgpt.site/",
    siteName: "FabHexaGrogne V3",
    title: "FabHexaGrogne V3",
    description: "Conquérir. Encercler. Évoluer.",
    images: [
      {
        url: "https://fabhexagrognev3.gnrationsia.chatgpt.site/og.png",
        width: 1200,
        height: 630,
        alt: "Le plateau hexagonal de FabHexaGrogne V3",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FabHexaGrogne V3",
    description: "Conquérir. Encercler. Évoluer.",
    images: ["https://fabhexagrognev3.gnrationsia.chatgpt.site/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon" },
      { url: "/icons/fabhexagrogne-f-v3.svg", type: "image/svg+xml" },
      { url: "/icons/fabhexagrogne-f-v3-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/fabhexagrogne-f-v3-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/fabhexagrogne-f-v3-apple-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1020",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
