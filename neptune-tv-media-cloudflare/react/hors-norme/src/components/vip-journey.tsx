const steps = [
  { number: "01", title: "Vous préparez", detail: "Appel visio quelques jours avant l’interview." },
  { number: "02", title: "Vous tournez", detail: "Plateau 4K. Vous parlez. On capture." },
  { number: "03", title: "On diffuse", detail: "Montage, shorts, calendrier 90 jours." },
]

export function VipJourney() {
  return (
    <section id="parcours" className="relative scroll-mt-24 py-12 md:py-16">
      <div className="container-neptune">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-black tracking-tight text-white md:text-4xl">Vous êtes accompagné du début à la fin</h2>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">Vous n’avez rien à penser, laissez-vous guider.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step) => <article key={step.number} className="glow-border rounded-2xl bg-white/[0.03] p-6"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-neptune-soft">{step.number}</p><h3 className="mt-3 font-heading text-xl font-bold text-white">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p></article>)}
        </div>
      </div>
    </section>
  )
}
