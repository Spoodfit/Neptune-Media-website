import { LAUNCH_BANNER_TEXT } from "@/lib/constants"

export function LaunchBanner() {
  return (
    <div role="status" aria-label={LAUNCH_BANNER_TEXT} className="launch-banner border-b border-red-950/50 bg-[#c62828] text-white">
      <div className="launch-banner__track">
        {[0, 1].map((copy) => (
          <p key={copy} className="launch-banner__group" aria-hidden={copy > 0 || undefined}>
            <span>{LAUNCH_BANNER_TEXT}</span><span className="launch-banner__sep" aria-hidden="true">•</span><span>{LAUNCH_BANNER_TEXT}</span><span className="launch-banner__sep" aria-hidden="true">•</span>
          </p>
        ))}
      </div>
    </div>
  )
}
