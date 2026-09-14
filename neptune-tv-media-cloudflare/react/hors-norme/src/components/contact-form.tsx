"use client"

import { FormEvent, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BOOKING_CTA, BOOKING_URL, CONTACT_EMAIL, FORM_CTA, FORM_CTA_LOADING, LAUNCH_DEADLINE_LABEL, OFFER_PRICE_LABEL } from "@/lib/constants"

type Status = "idle" | "loading" | "success" | "error"
type ContactPayload = { name: string; phone: string; linkedinOrSite: string }

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [contact, setContact] = useState<ContactPayload | null>(null)

  const bookingHref = useMemo(() => {
    const url = new URL(BOOKING_URL)
    url.searchParams.set("source", "hors-norme")
    if (contact?.name) url.searchParams.set("contact_name", contact.name)
    if (contact?.phone) url.searchParams.set("phone", contact.phone)
    if (contact?.linkedinOrSite) url.searchParams.set("linkedin_or_site", contact.linkedinOrSite)
    return url.toString()
  }, [contact])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("loading")
    setErrorMessage("")

    const form = event.currentTarget
    const data = new FormData(form)
    const payload: ContactPayload = {
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      linkedinOrSite: String(data.get("linkedinOrSite") || "").trim(),
    }

    if (!payload.name || !payload.phone) {
      setStatus("error")
      setErrorMessage("Indiquez votre nom et votre téléphone.")
      return
    }

    try {
      sessionStorage.setItem("neptune_hors_norme_contact", JSON.stringify({ ...payload, source: "hors-norme" }))
      setContact(payload)
      setStatus("success")
      form.reset()
    } catch {
      setStatus("error")
      setErrorMessage("Réessayez ou écrivez-nous.")
    }
  }

  return (
    <section id="contact" className="relative scroll-mt-24 py-12 md:py-16">
      <div className="container-neptune max-w-xl">
        <div className="text-center">
          <h2 className="font-heading text-3xl font-black tracking-tight text-white md:text-4xl">Libérez-vous de la com.</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Laissez vos coordonnées. On vous rappelle pour verrouiller votre créneau.
            <span className="mt-1 block text-sm text-zinc-500">{OFFER_PRICE_LABEL} · {LAUNCH_DEADLINE_LABEL}</span>
          </p>
        </div>

        <div className="glow-border mt-8 rounded-3xl bg-white/[0.04] p-6 md:p-8">
          {status === "success" ? (
            <div className="space-y-5 text-center">
              <h3 className="font-heading text-2xl font-bold text-white">C’est noté.</h3>
              <a href={bookingHref} className="btn-neptune inline-flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold">{BOOKING_CTA}</a>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="space-y-2"><Label htmlFor="name">Nom</Label><Input id="name" name="name" autoComplete="name" required placeholder="Votre nom" /></div>
              <div className="space-y-2"><Label htmlFor="phone">Téléphone</Label><Input id="phone" name="phone" type="tel" autoComplete="tel" required placeholder="06 12 34 56 78" /></div>
              <div className="space-y-2"><Label htmlFor="linkedinOrSite">LinkedIn ou site</Label><Input id="linkedinOrSite" name="linkedinOrSite" type="url" placeholder="https://..." /></div>

              {status === "error" ? (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{errorMessage} <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
              ) : null}

              <Button type="submit" size="lg" disabled={status === "loading"} className="btn-neptune h-12 w-full rounded-xl text-base font-semibold disabled:opacity-70">{status === "loading" ? FORM_CTA_LOADING : FORM_CTA}</Button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
