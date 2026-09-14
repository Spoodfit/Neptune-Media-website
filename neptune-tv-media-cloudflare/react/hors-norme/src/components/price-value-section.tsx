import { FORM_CTA, LAUNCH_DEADLINE_LABEL, OFFER_PRICE_LABEL, REGULAR_PRICE_LABEL } from "@/lib/constants"

const inactionCosts = [
  { title: "Rester invisible un trimestre de plus", detail: "Vos futurs clients ne vous croisent pas. Votre expertise reste privée." },
  { title: "Continuer à porter la com. seul", detail: "Sans système, chaque semaine repart de zéro. Énergie, temps, frustration." },
  { title: "Des appels où vous devez encore vous présenter", detail: "Le prospect n’a rien vu de vous avant. Vous repartez de la case départ." },
  { title: "Reporter encore « plus tard »", detail: "Dans trois mois, le problème sera le même. Avec trois mois de retard en plus." },
] as const

export function PriceValueSection() {
  return (
    <section id="investissement" className="relative scroll-mt-24 py-12 md:py-16">
      <div className="container-neptune">
        <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-neptune-soft">Ce que vous achetez vraiment</p><h2 className="mt-3 font-heading text-3xl font-black tracking-tight text-white md:text-4xl">Pas une émission. Votre temps.</h2><p className="mt-4 text-base leading-relaxed text-[#d5dff0] md:text-lg">Une solution clé en main, déjà pensée, déjà testée pour vous. Vous vous libérez de la com&nbsp;: une demi-journée sur le plateau, trois mois de contenus qui tournent sans vous.</p></div>
        <div className="glow-border mx-auto mt-10 max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-b from-white/[0.06] to-white/[0.02]">
          <div className="border-b border-white/8 px-5 pt-5 sm:px-7 sm:pt-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Ce que ça vous coûte de ne pas le faire</p></div>
          <ul className="divide-y divide-white/8 px-5 pb-1 pt-1 sm:px-7">{inactionCosts.map((item) => <li key={item.title} className="py-4"><p className="text-sm font-semibold text-white sm:text-base">{item.title}</p><p className="mt-1 text-sm leading-relaxed text-zinc-400">{item.detail}</p></li>)}</ul>
          <div className="border-t border-white/10 bg-white/[0.03] px-5 py-5 sm:px-7"><div className="flex flex-col gap-3 rounded-2xl border border-neptune/30 bg-neptune/10 p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-neptune-soft">Pour sortir de là · {LAUNCH_DEADLINE_LABEL}</p><div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3"><span className="font-heading text-lg font-bold text-zinc-400 line-through decoration-strike sm:text-xl">{REGULAR_PRICE_LABEL}</span><span className="font-heading text-4xl font-black tracking-tight text-gradient-neptune sm:text-5xl">{OFFER_PRICE_LABEL}</span></div><p className="mt-2 text-sm text-[#d5dff0]">Le prix d’une demi-journée. Le résultat de trois mois de com. sans y revenir.</p></div><a href="#contact" className="btn-neptune inline-flex h-11 shrink-0 items-center justify-center rounded-xl px-6 text-sm font-semibold">{FORM_CTA}</a></div></div>
        </div>
      </div>
    </section>
  )
}
