"use client"

import { useEffect, useRef } from "react"
import { VisibilityShowcase } from "@/components/visibility-showcase"

const LONG_FORM = {
  src: "https://neptune-media-webtv.neptunebusinessclub.workers.dev/media/emissions/hors-norme.mp4",
  poster: "/assets/posters/hors-norme-wide.webp",
}

function forcePlay(video: HTMLVideoElement) {
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.setAttribute("muted", "")
  video.setAttribute("playsinline", "")
  video.setAttribute("webkit-playsinline", "")
  return video.play().catch(() => undefined)
}

export function HeroMediaComposite() {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const kick = () => { void forcePlay(video) }
    kick()
    video.addEventListener("loadeddata", kick)
    video.addEventListener("canplay", kick)
    const timers = [200, 800, 2000].map((ms) => window.setTimeout(kick, ms))
    const interval = window.setInterval(() => { if (video.paused) kick() }, 2500)
    return () => {
      video.removeEventListener("loadeddata", kick)
      video.removeEventListener("canplay", kick)
      for (const id of timers) window.clearTimeout(id)
      window.clearInterval(interval)
    }
  }, [])

  return (
    <div className="relative mx-auto w-full max-w-full space-y-6 md:space-y-8">
      <div className="relative">
        <div className="pointer-events-none absolute inset-[-8%] rounded-full bg-[conic-gradient(from_160deg,#20a9ff42,#755cff47,#ff4fb838,#ff9e4624,#20a9ff42)] opacity-60 blur-3xl" />
        <div className="relative z-0 overflow-hidden rounded-[18px] border border-white/20 bg-black shadow-[0_30px_90px_#00000061] sm:rounded-[22px]">
          <div className="relative aspect-video w-full bg-[#050b16]">
            <img src={LONG_FORM.poster} alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" />
            <video ref={videoRef} id="player" className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover [&::-webkit-media-controls]:hidden [&::-webkit-media-controls-enclosure]:hidden" autoPlay muted loop playsInline preload="metadata" controls={false} disablePictureInPicture controlsList="nodownload nofullscreen noremoteplayback noplaybackrate" tabIndex={-1} poster={LONG_FORM.poster} src={LONG_FORM.src} />
          </div>
        </div>
      </div>
      <VisibilityShowcase />
    </div>
  )
}
