import Image from "next/image"
import { Check } from "lucide-react"

const included = [
  "Plateau TV 4K + équipe technique",
  "Préparation de votre interview",
  "Interview longue + capsules",
  "Montage pro & habillage",
  "Shorts prêts à publier",
  "Calendrier éditorial 90 jours",
  "Diffusion Neptune Business | Media",
]

export function ValueStack() {
  return (
    <section id="inclus" className="relative scroll-mt-24 py-12 md:py-16">
      <div className="container-neptune">
        <div className="mx-auto max-w-2xl text-center"><h2 className="font-heading text-3xl font-black tracking-tight text-white md:text-4xl">Tout inclus</h2></div>
        <div className="glow-border mx-auto mt-10 max-w-3xl rounded-3xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-6 md:p-8"><ul className="space-y-3">{included.map((item) => <li key={item} className="flex items-start gap-3 text-sm text-[#d5dff0] md:text-base"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-neptune/15 text-neptune"><Check className="size-3.5" strokeWidth={3} /></span><span>{item}</span></li>)}</ul></div>
        <div className="glow-border mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-b from-[#11274ce0] via-[#101436e6] to-[#2f1346c7]">
          <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr] md:items-stretch">
            <div className="relative min-h-[240px] md:min-h-[360px]"><Image src="/assets/posters/connexio-concept.webp" alt="Concept Connexio : jeu de cartes Neptune dans le salon plateau" fill className="object-cover object-center" sizes="(max-width: 768px) 100vw, 55vw" priority={false} /></div>
            <div className="flex flex-col justify-center p-6 md:p-8"><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-neptune-soft">Concept bonus · 2 prochaines réservations</p><h3 className="mt-3 font-heading text-2xl font-black text-white md:text-3xl">Connexio</h3><p className="mt-3 text-sm leading-relaxed text-[#d5dff0] md:text-base">Moment détente après Hors Norme. Cartes Pro & Perso, échanges spontanés, contenus potentiellement viraux pour prolonger la visibilité.</p></div>
          </div>
        </div>
      </div>
    </section>
  )
}
