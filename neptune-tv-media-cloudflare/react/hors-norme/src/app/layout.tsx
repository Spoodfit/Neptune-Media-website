import type { Metadata } from "next";
import { Montserrat, Manrope } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tv.neptunebusiness.com"),
  alternates: { canonical: "/hors-norme/" },
  title: "Hors Norme | 1 demi-journée pour 3 mois de com | Neptune Media",
  description: "Une demi-journée sur le plateau Neptune TV. Montage, shorts et diffusion inclus pour 3 mois de contenus.",
  icons: { icon: "/assets/logo-neptune.svg" },
  openGraph: {
    title: "Hors Norme | 1 demi-journée pour 3 mois de communications",
    description: "Interview plateau, montage, shorts et diffusion Neptune. Places limitées chaque mois.",
    images: ["/assets/posters/hors-norme-wide.webp"],
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${montserrat.variable} ${manrope.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
