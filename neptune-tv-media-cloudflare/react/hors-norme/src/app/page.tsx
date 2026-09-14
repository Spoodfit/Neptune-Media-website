import { ContactForm } from "@/components/contact-form"
import { HeroSection } from "@/components/hero-section"
import { LaunchBanner } from "@/components/launch-banner"
import { PriceValueSection } from "@/components/price-value-section"
import { ProofSection } from "@/components/proof-section"
import { SeenOnStrip } from "@/components/seen-on-strip"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { StickyMobileCta } from "@/components/sticky-mobile-cta"
import { ValueStack } from "@/components/value-stack"
import { VipJourney } from "@/components/vip-journey"

export default function HomePage() {
  return (
    <>
      <div className="sticky top-0 z-50">
        <SiteHeader />
        <LaunchBanner />
      </div>
      <main className="flex-1 pb-[5.5rem] md:pb-0">
        <HeroSection />
        <ProofSection />
        <SeenOnStrip />
        <VipJourney />
        <ValueStack />
        <PriceValueSection />
        <ContactForm />
      </main>
      <SiteFooter />
      <StickyMobileCta />
    </>
  )
}
