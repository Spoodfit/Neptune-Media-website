import { InstagramLogo, LinkedInLogo, TikTokLogo, YouTubeLogo } from "@/components/platform-logos"

const platforms = [
  { name: "YouTube", Logo: YouTubeLogo },
  { name: "LinkedIn", Logo: LinkedInLogo },
  { name: "Instagram", Logo: InstagramLogo },
  { name: "TikTok", Logo: TikTokLogo },
] as const

export function SeenOnStrip() {
  return (
    <section className="border-y border-white/8 bg-white/[0.02] py-10 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Diffusé sur notre WebTV</p>
          <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-[#20a9ff]/35 bg-[linear-gradient(135deg,rgba(32,169,255,0.18),rgba(32,169,255,0.04))] px-5 py-3.5 shadow-[0_0_40px_-18px_rgba(32,169,255,0.8)] sm:gap-4 sm:px-6 sm:py-4">
            <img src="/assets/logo-neptune.svg" alt="" className="h-11 w-auto object-contain sm:h-12" width={56} height={44} />
            <div className="text-left"><p className="font-display text-lg font-semibold tracking-tight text-white sm:text-xl">Neptune WebTV</p><p className="text-sm text-zinc-300">Votre émission en antenne</p></div>
          </div>
        </div>
        <div className="relative my-8 h-px w-full bg-white/10 sm:my-10"><span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#020611] px-3 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">et aussi sur</span></div>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-5 sm:gap-x-10">
          {platforms.map(({ name, Logo }) => <li key={name}><div className="flex flex-col items-center gap-2 text-zinc-300 transition-colors hover:text-white sm:flex-row sm:gap-2.5"><Logo className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" /><span className="text-xs font-medium tracking-wide sm:text-sm">{name}</span></div></li>)}
        </ul>
      </div>
    </section>
  )
}
