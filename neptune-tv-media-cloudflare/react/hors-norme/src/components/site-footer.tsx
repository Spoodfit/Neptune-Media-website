import Image from "next/image"
import Link from "next/link"
import { BOOKING_URL, CONTACT_EMAIL } from "@/lib/constants"

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-[#01040b94] py-10">
      <div className="container-neptune flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex w-fit shrink-0 self-start items-center"><Image src="/assets/logo-neptune.svg" alt="Neptune Media" width={856} height={653} className="h-10 w-auto sm:h-11" sizes="48px" /></div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">{CONTACT_EMAIL}</a><Link href={BOOKING_URL} className="hover:text-white" target="_blank" rel="noreferrer">Réserver</Link><span>4 dirigeants / mois</span></div>
      </div>
      <div className="container-neptune mt-8 border-t border-border pt-4 text-xs text-[#7f8da5]">© {new Date().getFullYear()} Neptune Business | Media</div>
    </footer>
  )
}
