"use client"

import { useEffect, useRef } from "react"

type ShowcaseItem = { src: string; poster: string; label: string; size: "large" | "small" }

const MEDIA = {
  light: { src: "/assets/media/neptune-media-mis-en-lumiere.mp4", poster: "/assets/posters/poster-neptune-media.webp" },
  accident: { src: "/assets/media/accident-moto-entreprise.mp4", poster: "/assets/posters/poster-accident.webp" },
  video: { src: "/assets/media/solution-video-pro.mp4", poster: "/assets/posters/poster-video-pro.webp" },
  story: { src: "/assets/media/storytelling-efficace.mp4", poster: "/assets/posters/poster-storytelling.webp" },
  human: { src: "/assets/media/humain-avant-business.mp4", poster: "/assets/posters/poster-humain.webp" },
} as const

const TOP_ITEMS: ShowcaseItem[] = [
  { ...MEDIA.light, label: "Votre entrepreneuriat mis en lumière", size: "large" },
  { ...MEDIA.human, label: "Hors Norme · Émission complète", size: "large" },
  { ...MEDIA.accident, label: "Accident et renaissance", size: "large" },
  { ...MEDIA.video, label: "La solution vidéo professionnelle", size: "large" },
  { ...MEDIA.story, label: "Le secret d’un storytelling efficace", size: "large" },
  { ...MEDIA.light, label: "Jeu Connexio · Émission complète", size: "large" },
  { ...MEDIA.human, label: "L’humain avant le business", size: "large" },
  { ...MEDIA.accident, label: "Une histoire hors norme", size: "large" },
]

const BOTTOM_ITEMS: ShowcaseItem[] = [
  { ...MEDIA.accident, label: "Raconter une épreuve", size: "small" },
  { ...MEDIA.light, label: "Créer de l’interaction", size: "small" },
  { ...MEDIA.video, label: "Le premier direct", size: "small" },
  { ...MEDIA.human, label: "Première expérience TV", size: "small" },
  { ...MEDIA.story, label: "Élever la qualité", size: "small" },
  { ...MEDIA.human, label: "Une histoire hors norme", size: "small" },
  { ...MEDIA.light, label: "Votre entrepreneuriat mis en lumière", size: "small" },
  { ...MEDIA.story, label: "Rebondir après une association", size: "small" },
]

function forcePlay(video: HTMLVideoElement) {
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.setAttribute("muted", "")
  video.setAttribute("playsinline", "")
  video.setAttribute("webkit-playsinline", "")
  return video.play().catch(() => undefined)
}

function AutoPlayVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const kick = () => { void forcePlay(video) }
    kick()
    video.addEventListener("loadeddata", kick)
    video.addEventListener("canplay", kick)
    video.addEventListener("suspend", kick)
    const timers = [200, 800, 2000].map((ms) => window.setTimeout(kick, ms))
    const interval = window.setInterval(() => { if (video.paused) kick() }, 2500)
    return () => {
      video.removeEventListener("loadeddata", kick)
      video.removeEventListener("canplay", kick)
      video.removeEventListener("suspend", kick)
      for (const id of timers) window.clearTimeout(id)
      window.clearInterval(interval)
    }
  }, [src])
  return <video ref={ref} muted loop autoPlay playsInline preload="metadata" poster={poster} src={src} aria-label={label} />
}

function ShortCard({ item }: { item: ShowcaseItem }) {
  return <article className={`visibility-short visibility-short--${item.size}`}><img src={item.poster} alt="" loading="lazy" decoding="async" draggable={false} /><AutoPlayVideo src={item.src} poster={item.poster} label={item.label} /><span className="visibility-short__shade" aria-hidden="true" /><span className="visibility-short__label">{item.label}</span></article>
}

function MarqueeRow({ items, direction }: { items: ShowcaseItem[]; direction: "top" | "bottom" }) {
  return <div className={`visibility-marquee visibility-marquee--${direction}`}><div className="visibility-marquee__track">{[0, 1].map((copy) => <div key={copy} className="visibility-marquee__group" aria-hidden={copy > 0 || undefined}>{items.map((item, index) => <ShortCard key={`${copy}-${item.label}-${index}`} item={item} />)}</div>)}</div></div>
}

export function VisibilityShowcase() {
  return <div className="visibility-showcase__stage" aria-label="Exemples de contenus courts produits par Neptune Media"><div className="visibility-showcase__promise"><span className="eyebrow">Une production. Des semaines de visibilité.</span><p><strong>30 contenus minimum</strong><span>pour gagner en visibilité.</span></p></div><MarqueeRow items={TOP_ITEMS} direction="top" /><MarqueeRow items={BOTTOM_ITEMS} direction="bottom" /></div>
}
