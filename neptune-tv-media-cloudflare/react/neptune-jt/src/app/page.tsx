"use client";

import { useEffect, useMemo, useState } from "react";

type StatusPayload = {
  registrationOpen?: boolean;
  registrationReason?: string;
  counts?: { total?: number; confirmed?: number };
  edition?: { label?: string; eventAt?: string; location?: string } | null;
};

function formatDate(value?: string) {
  if (!value) return "Date en préparation";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date en préparation";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

export default function NeptuneJtLanding() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/neptune-jt/status", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "status_unavailable");
        return body as StatusPayload;
      })
      .then((body) => {
        if (!alive) return;
        setStatusFailed(false);
        setStatus(body);
      })
      .catch(() => {
        if (!alive) return;
        setStatusFailed(true);
        setStatus(null);
      });
    return () => { alive = false; };
  }, []);

  const hasLiveCount = Number.isFinite(status?.counts?.total);
  const total = hasLiveCount ? Math.max(0, Math.min(6, Number(status?.counts?.total))) : null;
  const confirmed = Number.isFinite(status?.counts?.confirmed)
    ? Math.max(0, Math.min(6, Number(status?.counts?.confirmed)))
    : null;
  const nextEdition = useMemo(
    () => status?.edition
      ? `${formatDate(status.edition.eventAt)} · ${status.edition.location || "Lieu à confirmer"}`
      : "Prochaine date en préparation",
    [status],
  );
  const statusLine = statusFailed
    ? "Statut indisponible : aucune disponibilité n’est affichée sans vérification serveur."
    : total === null
      ? "Vérification des places en cours…"
      : status?.registrationOpen
        ? total >= 4
          ? `${total}/6 pré-réservations · le seuil de déclenchement est atteint.`
          : `${total}/4 pré-réservations · encore ${4 - total} pour déclencher les règlements.`
        : "Pré-réservations actuellement indisponibles.";

  return (
    <>
      <header className="nav">
        <a className="brand" href="/" aria-label="Neptune Media">
          <img src="/assets/logo-neptune.svg" alt="" />
          <span>Neptune Media</span>
        </a>
        <a className="nav-cta" href="/reserver/neptune-jt/">Pré-réserver</a>
      </header>

      <main>
        <section className="hero section">
          <div className="hero-copy">
            <div className="live-kicker"><i /> NEPTUNE JT · <span className="nowrap">4–6</span> ENTREPRENEURS</div>
            <h1>Votre expertise,<br /><span>face à l’actualité.</span></h1>
            <p className="lead">Décryptez une actualité de votre marché sur un plateau pro. Repartez avec votre passage et <strong>10 shorts minimum.</strong></p>
            <div className="hero-actions">
              <a className="btn primary" href="/reserver/neptune-jt/">Pré-réserver à 0 €</a>
              <a className="btn secondary" href="#livrables">Voir ce que je récupère</a>
            </div>
            <p className="micro">200 € TTC seulement quand 4 participants sont réunis · 6 places maximum</p>
          </div>

          <div className="hero-visual" aria-label="Aperçu du plateau Neptune JT">
            <div className="studio-frame">
              <img src="/neptune-jt/neptune-jt-studio.svg" alt="Plateau Neptune JT" />
              <span className="on-air"><i /> EN PLATEAU</span>
            </div>
            <div className="studio-caption">
              <span>NEPTUNE JT</span>
              <b><span className="nowrap">15–20 min</span> pour rendre votre expertise visible</b>
            </div>
          </div>
        </section>

        <section className="stats" aria-label="Le format en chiffres">
          <div><strong className="nowrap">4–6</strong><span>invités</span></div>
          <div><strong className="nowrap">15–20 min</strong><span>sur le plateau</span></div>
          <div><strong>10+</strong><span>shorts livrés</span></div>
          <div><strong className="nowrap">200 € TTC</strong><span>le passage complet</span></div>
        </section>

        <section className="section value-section" id="livrables">
          <div className="section-heading compact-heading">
            <div className="eyebrow">CE QUE VOUS RÉCUPÉREZ</div>
            <h2>Un tournage.<br />Du contenu pour durer.</h2>
            <p>Vous venez avec votre expertise. Neptune transforme le passage en actifs prêts à diffuser.</p>
          </div>
          <div className="value-grid">
            <article><span>01</span><h3>Votre passage</h3><p><span className="nowrap">15–20 min</span> montées et publiables.</p></article>
            <article><span>02</span><h3>10+ shorts</h3><p>Des extraits verticaux prêts pour vos réseaux.</p></article>
            <article><span>03</span><h3>Diffusion Neptune</h3><p>Votre expertise intégrée à l’édition complète.</p></article>
            <article><span>04</span><h3>Bonus non-membre</h3><p>1 mois Neptune offert après paiement confirmé.</p></article>
          </div>
          <div className="price-strip">
            <div><span>PASSAGE COMPLET</span><strong>200 € TTC</strong></div>
            <p>Préparation · plateau · montage · diffusion · passage individuel · 10 shorts minimum</p>
            <a className="btn primary" href="/reserver/neptune-jt/">Pré-réserver sans payer</a>
          </div>
        </section>

        <section className="section process-section" id="format">
          <div className="section-heading">
            <div className="eyebrow">LE DÉROULÉ</div>
            <h2>Simple avant.<br />Efficace après.</h2>
          </div>
          <div className="steps">
            <article><span>01</span><h3>Votre sujet</h3><p>Vous proposez l’actualité qui touche votre marché.</p></article>
            <article><span>02</span><h3>Préparation</h3><p>30–45 min pour fixer l’angle, les questions et votre CTA.</p></article>
            <article><span>03</span><h3>Plateau</h3><p><span className="nowrap">15–20 min</span> d’interview en conditions quasi-live.</p></article>
            <article><span>04</span><h3>Livraison</h3><p>Votre passage + 10 shorts minimum + diffusion Neptune.</p></article>
          </div>
        </section>

        <section className="section compare-section">
          <div className="section-heading">
            <div className="eyebrow">CHOISISSEZ LE BON FORMAT</div>
            <h2>Le sujet ou le parcours.<br />Pas le même objectif.</h2>
          </div>
          <div className="contrast-grid">
            <article className="format-card jt-card">
              <div className="format-tag">NEPTUNE JT</div>
              <h3>Vous éclairez une actualité.</h3>
              <p>Votre expertise aide à comprendre ce qui change maintenant.</p>
              <span className="arrow">Le sujet est au centre →</span>
            </article>
            <article className="format-card hn-card">
              <div className="format-tag">HORS NORMES</div>
              <h3>Vous racontez votre parcours.</h3>
              <p>Votre histoire, vos déclics et votre vision portent l’épisode.</p>
              <span className="arrow">La personne est au centre →</span>
            </article>
          </div>
        </section>

        <section className="section threshold">
          <div className="threshold-copy">
            <div className="eyebrow"><span className="nowrap">4 POUR PARTIR</span> · <span className="nowrap">6 MAXIMUM</span></div>
            <h2>Vous ne payez pas<br />pour une édition incertaine.</h2>
            <p>Pré-réservez gratuitement. Dès 4 inscrits, le règlement de 200 € TTC est envoyé. À J-7, l’édition est maintenue uniquement avec 4 paiements confirmés.</p>
          </div>
          <div className="gauge-card" aria-live="polite">
            <div className="gauge-top"><span>Seuil de déclenchement</span><b>{total === null ? "— / 4" : `${Math.min(total, 4)} / 4`}</b></div>
            <div className="gauge" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => {
                const classes = [total === null || index >= total ? "ghost" : "", confirmed !== null && index < confirmed ? "paid" : ""].filter(Boolean).join(" ");
                return <i key={index} className={classes} />;
              })}
            </div>
            <small>{nextEdition}<br />{statusLine}</small>
          </div>
        </section>

        <section className="section cta-panel">
          <div>
            <div className="eyebrow">PROCHAINE ÉDITION</div>
            <h2>Votre marché bouge ?<br />Prenez la parole.</h2>
          </div>
          <a className="btn primary" href="/reserver/neptune-jt/">Pré-réserver à 0 €</a>
        </section>
      </main>

      <footer>
        <div><img src="/assets/logo-neptune.svg" alt="" /><span>Neptune Media</span></div>
        <nav><a href="https://media.neptunebusiness.com/cgv-neptune-media.html">CGV Neptune Media</a><a href="https://media.neptunebusiness.com/cgv-neptune-jt.html">Conditions Neptune JT</a></nav>
      </footer>

      <a className="mobile-conversion" href="/reserver/neptune-jt/"><span>Pré-réservation gratuite</span><b>Réserver →</b></a>
    </>
  );
}
