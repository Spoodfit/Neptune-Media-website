import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Neptune JT · Studio Neptune Media",
  robots: { index: false, follow: false, nocache: true },
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <><link rel="stylesheet" href="/studio/studio-shell-v105.css?v=4" /><link rel="stylesheet" href="/studio/neptune-jt/assets/styles.css?v=20260914-1" />{children}</>;
}
