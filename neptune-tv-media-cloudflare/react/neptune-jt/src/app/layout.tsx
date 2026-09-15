import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Neptune JT · Votre expertise face à l'actualité",
  description: "Neptune JT : décryptez l'actualité de votre marché sur un plateau pro et repartez avec votre passage et 10 shorts minimum.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/assets/logo-neptune.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/neptune-jt/neptune-jt.css?v=20260915-2" />
      </head>
      <body>{children}</body>
    </html>
  );
}
