"use client"

import { useEffect, useRef } from "react"

type ShowcaseItem = { src: string; poster: string; label: string; size: "large" | "small" }

const TOP_ITEMS: ShowcaseItem[] = [
  { src: "/assets/media/showcase/short-01.mp4", poster: "/assets/posters/showcase/short-01.webp", label: "Votre entrepreneuriat mis en lumière", size: "large" },
  { src: "/assets/media/showcase/short-02.mp4", poster: "/assets/posters/showcase/short-02.webp", label: "Hors Norme · Émission complète", size: "large" },
  { src: "/assets/media/showcase/short-03.mp4", poster: "/assets/posters/showcase/short-03.webp", label: "Accident et renaissance", size: "large" },
  { src: "/assets/media/showcase/short-04.mp4", poster: "/assets/posters/showcase/short-04.webp", label: "La solution vidéo professionnelle", size: "large" },
  { src: "/assets/media/showcase/short-05.mp4", poster: "/assets/posters/showcase/short-05.webp", label: "Le secret d’un storytelling efficace", size: "large" },
  { src: "/assets/media/showcase/short-06.mp4", poster: "/assets/posters/showcase/short-06.webp", label: "Jeu Connexio · Émission complète", size: "large" },
  { src: "/assets/media/showcase/short-07.mp4", poster: "/assets/posters/showcase/short-07.webp", label: "L’humain avant le business", size: "large" },
  { src: "/assets/media/showcase/short-08.mp4", poster: "/assets/posters/showcase/short-08.webp", label: "Une histoire hors norme", size: "large" },
]

const BOTTOM_ITEMS: ShowcaseItem[] = [
  { src: "/assets/media/showcase/short-09.mp4", poster: "/assets/posters/showcase/short-09.webp", label: "Raconter une épreuve", size: "small" },
  { src: "/assets/media/showcase/short-10.mp4", poster: "/assets/posters/showcase/short-10.webp", label: "Créer de l’interaction", size: "small" },
  { src: "/assets/media/showcase/short-11.mp4", poster: "/assets/posters/showcase/short-11.webp", label: "Le premier direct", size: "small" },
  { src: "/assets/media/showcase/short-12.mp4", poster: "/assets/posters/showcase/short-12.webp", label: "Première expérience TV", size: "small" },
  { src: "/assets/media/showcase/short-13.mp4", poster: "/assets/posters/showcase/short-13.webp", label: "Élever la qualité", size: "small" },
  { src: "/assets/media/showcase/short-14.mp4", poster: "/assets/posters/showcase/short-14.webp", label: "Une histoire hors norme", size: "small" },
  { src: "/assets/media/showcase/short-15.mp4", poster: "/assets/posters/showcase/short-15.webp", label: "Votre entrepreneuriat mis en lumière", size: "small" },
  { src: "/assets/media/showcase/short-16.mp4", poster: "/assets/posters/showcase/short-16.webp", label: "Rebondir après une association", size: "small" },
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
  return <video ref={ref} muted loop autoPlay playsInline preload="auto" poster={poster} src={src} aria-label={label} />
}

function ShortCard({ item }: { item: ShowcaseItem }) {
  return <article className={`visibility-short visibility-short--${item.size}`}><img src={item.poster} alt="" loading="lazy" decoding="async" draggable={false} /><AutoPlayVideo src={item.src} poster={item.poster} label={item.label} /><span className="visibility-short__shade" aria-hidden="true" /><span className="visibility-short__label">{item.label}</span></article>
}

function MarqueeRow({ items, direction }: { items: ShowcaseItem[]; direction: "top" | "bottom" }) {
  return <div className={`visibility-marquee visibility-marquee--${direction}`}><div className="visibility-marquee__track">{[0, 1].map((copy) => <div key={copy} className="visibility-marquee__group" aria-hidden={copy > 0 || undefined}>{items.map((item, index) => <ShortCard key={`${copy}-${item.src}-${index}`} item={item} />)}</div>)}</div></div>
}

export function VisibilityShowcase() {
  return <div className="visibility-showcase__stage" aria-label="Exemples de contenus courts produits par Neptune Media"><div className="visibility-showcase__promise"><span className="eyebrow">Une production. Des semaines de visibilité.</span><p><strong>30 contenus minimum</strong><span>pour gagner en visibilité.</span></p></div><MarqueeRow items={TOP_ITEMS} direction="top" /><MarqueeRow items={BOTTOM_ITEMS} direction="bottom" /></div>
}
