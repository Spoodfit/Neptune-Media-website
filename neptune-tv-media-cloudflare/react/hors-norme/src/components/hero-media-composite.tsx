import { VisibilityShowcase } from "@/components/visibility-showcase"
import { WEBTV_EMBED_URL } from "@/lib/constants"

export function HeroMediaComposite() {
  return (
    <div className="relative mx-auto w-full max-w-full space-y-6 md:space-y-8">
      <div className="relative">
        <div className="pointer-events-none absolute inset-[-8%] rounded-full bg-[conic-gradient(from_160deg,#20a9ff42,#755cff47,#ff4fb838,#ff9e4624,#20a9ff42)] opacity-60 blur-3xl" />
        <div className="relative z-0 overflow-hidden rounded-[18px] border border-white/20 bg-black shadow-[0_30px_90px_#00000061] sm:rounded-[22px]">
          <div className="relative aspect-video w-full bg-[#050b16]">
            <iframe
              id="webtv-player"
              src={WEBTV_EMBED_URL}
              title="WebTV Neptune Business en direct"
              className="absolute inset-0 h-full w-full border-0 bg-black"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              loading="eager"
            />
          </div>
        </div>
      </div>
      <VisibilityShowcase />
    </div>
  )
}
