"use client"

import { FORM_CTA } from "@/lib/constants"

export function StickyMobileCta() {
  return <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#070b14]/95 p-3 backdrop-blur md:hidden"><a href="#contact" className="btn-neptune inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-white">{FORM_CTA}</a></div>
}
