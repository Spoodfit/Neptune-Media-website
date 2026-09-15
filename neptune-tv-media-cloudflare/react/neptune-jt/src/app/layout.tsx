import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Neptune JT · L'actu vue par ceux qui la vivent",
  description: "Neptune JT : décryptage d'actualité, passage plateau et contenus courts pour les entrepreneurs.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/assets/logo-neptune.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/neptune-jt/neptune-jt.css?v=20260914-1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
