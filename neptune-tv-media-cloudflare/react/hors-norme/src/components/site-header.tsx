"use client"

import Image from "next/image"
import Link from "next/link"
import { FORM_CTA } from "@/lib/constants"

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-[#020611d1] backdrop-blur-xl">
      <div className="container-neptune flex min-h-[64px] items-center justify-between gap-3 sm:min-h-[70px] sm:gap-4">
        <Link href="#top" className="inline-flex shrink-0 items-center" aria-label="Neptune Media"><Image src="/assets/logo-neptune.svg" alt="Neptune Media" width={856} height={653} className="h-10 w-auto sm:h-11" sizes="48px" priority /></Link>
        <nav className="hidden items-center gap-1 md:flex">{[{ href: "#preuve", label: "Preuve" },{ href: "#parcours", label: "Parcours" },{ href: "#inclus", label: "Inclus" },{ href: "#investissement", label: "Résultat" }].map((item) => <a key={item.href} href={item.href} className="rounded-full px-3.5 py-2 text-sm font-semibold text-[#b9c6da] transition hover:bg-white/10 hover:text-white">{item.label}</a>)}</nav>
        <a href="#contact" className="inline-flex h-9 items-center rounded-full border border-white/20 bg-white/[0.04] px-3 text-xs font-bold text-[#d5dff0] transition hover:border-white/35 hover:bg-white/[0.08] hover:text-white sm:h-10 sm:px-4 sm:text-sm">{FORM_CTA}</a>
      </div>
    </header>
  )
}
