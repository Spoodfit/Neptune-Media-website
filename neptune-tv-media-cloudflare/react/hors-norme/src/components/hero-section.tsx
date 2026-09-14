"use client"

import { FORM_CTA } from "@/lib/constants"

export function HeroSection() {
  return (
    <section id="top" className="relative overflow-hidden pb-8 pt-8 md:pb-10 md:pt-14">
      <div className="container-neptune">
        <div className="mx-auto max-w-4xl text-center">
          <p className="eyebrow animate-fade-up justify-center">Neptune Business | Media</p>
          <h1 className="animate-fade-up-delay-1 mt-4 font-heading text-[clamp(2rem,7.5vw,4.5rem)] font-black leading-[1.05] tracking-[-0.05em] text-white">
            Une demi-journée.<br /><span className="text-gradient-neptune">3 mois de contenus.</span>
          </h1>
          <p className="animate-fade-up-delay-2 mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">Plateau TV · montage · shorts · diffusion.</p>
          <div className="animate-fade-up-delay-3 mt-8 flex justify-center">
            <a href="#contact" className="btn-neptune inline-flex h-12 items-center justify-center rounded-xl px-8 text-base font-semibold">{FORM_CTA}</a>
          </div>
        </div>
      </div>
    </section>
  )
}
