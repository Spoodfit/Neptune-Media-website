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
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

export default function NeptuneJtLanding() {
  const [status, setStatus] = useState<StatusPayload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/neptune-jt/status", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "status_unavailable");
        return body as StatusPayload;
      })
      .then((body) => { if (alive) setStatus(body); })
      .catch(() => { if (alive) setStatus({ registrationOpen: false }); });
    return () => { alive = false; };
  }, []);

  const total = Number(status?.counts?.total || 0);
  const confirmed = Number(status?.counts?.confirmed || 0);
  const nextEdition = useMemo(() => status?.edition ? `${formatDate(status.edition.eventAt)} · ${status.edition.location || "Lieu à confirmer"}` : "Prochaine date en préparation", [status]);

  return (
    <>
      <header className="nav">
        <a className="brand" href="/" aria-label="Neptune Media"><img src="/assets/logo-neptune.svg" alt="" /><span>Neptune Media</span></a>
        <a className="nav-cta" href="/reserver/neptune-jt/">Pré-réserver</a>
      </header>

      <main>
        <section className="hero section">
          <div className="hero-copy">
            <div className="live-kicker"><i /> NEPTUNE JT · ÉDITION TRIMESTRIELLE</div>
            <h1>L&apos;actu vue par<br /><span>ceux qui la vivent.</span></h1>
            <p className="lead">Votre entreprise ne vient pas réciter sa présentation. Elle vient décrypter <strong>une actualité qui touche réellement son marché</strong>, sur un plateau, en conditions quasi-live.</p>
            <div className="hero-actions">
              <a className="btn primary" href="/reserver/neptune-jt/">Pré-réserver ma place</a>
              <a className="btn secondary" href="#format">Voir le format</a>
            </div>
            <p className="micro">Pré-réservation sans paiement · Paiement déclenché uniquement dès 4 participants</p>
          </div>
          <div className="broadcast-card" aria-label="Aperçu du format Neptune JT">
            <div className="screen-head"><span className="on-air"><i /> EN PLATEAU</span><span>NEPTUNE JT</span></div>
            <div className="screen-stage"><div className="presenter-orb">JT</div><div className="topic-card"><small>LE SUJET</small><strong>Qu&apos;est-ce qui change vraiment dans votre secteur ?</strong></div></div>
            <div className="lower-third"><span>15–20 MIN</span><b>Votre expertise face à l&apos;actualité</b></div>
          </div>
        </section>

        <section className="stats" aria-label="Le format en chiffres">
          <div><strong>4–6</strong><span>invités par édition</span></div><div><strong>15–20 min</strong><span>de passage individuel</span></div><div><strong>10+</strong><span>shorts livrés</span></div><div><strong>200 € TTC</strong><span>le passage complet</span></div>
        </section>

        <section className="section split" id="format">
          <div><div className="eyebrow">UNE ÉMISSION, PAS UNE PUB DÉGUISÉE</div><h2>Vous avez une actualité.<br />On lui donne un plateau.</h2></div>
          <div className="body-copy"><p>Réforme, intelligence artificielle, immobilier, emploi, consommation, réglementation, évolution des usages… Neptune croise <strong>l&apos;actualité sociétale et votre expertise terrain</strong> pour construire un angle utile, clair et partageable.</p><p>Vous pouvez proposer votre sujet. Neptune réalise aussi une veille et peut vous suggérer plusieurs angles avant l&apos;appel de préparation.</p></div>
        </section>

        <section className="section contrast-grid">
          <article className="format-card jt-card"><div className="format-tag">NEPTUNE JT</div><h3>Qu&apos;est-ce qui se passe maintenant ?</h3><p>Actualité, expertise, décryptage, conséquences concrètes et projection.</p><span className="arrow">→ Le sujet est au centre.</span></article>
          <article className="format-card hn-card"><div className="format-tag">HORS NORMES</div><h3>Qui êtes-vous et qu&apos;est-ce qui vous a construit ?</h3><p>Parcours, histoire, personnalité, déclics et vision entrepreneuriale.</p><span className="arrow">→ La personne est au centre.</span></article>
        </section>

        <section className="section">
          <div className="eyebrow">LE DÉROULÉ</div><h2>Une demi-journée de tournage.<br />Des semaines de contenu.</h2>
          <div className="steps">
            <article><span>01</span><h3>Angle</h3><p>Vous proposez votre actualité ou Neptune vous suggère des angles issus de sa veille.</p></article>
            <article><span>02</span><h3>Préparation</h3><p>Formulaire puis appel de 30 à 45 minutes pour finaliser le sujet, les questions et votre CTA.</p></article>
            <article><span>03</span><h3>Plateau</h3><p>15 à 20 minutes, quasi-live, avec introduction journalistique et questions courtes pensées aussi pour les formats verticaux.</p></article>
            <article><span>04</span><h3>Diffusion</h3><p>L&apos;édition complète est publiée par Neptune. Vous recevez votre passage individuel et au moins 10 shorts.</p></article>
          </div>
        </section>

        <section className="section value-wrap">
          <div className="value-copy"><div className="eyebrow">CE QUE VOUS RÉCUPÉREZ</div><h2>Un passage. Une vraie réserve de contenu.</h2><ul><li><b>Votre passage individuel</b> de 15 à 20 minutes environ</li><li><b>10 shorts minimum</b> prêts à exploiter sur vos réseaux</li><li>Votre présence dans <b>l&apos;édition complète Neptune JT</b></li><li><b>Diffusion Neptune Business</b> + contenus courts de promotion</li><li>Pour les non-membres : <b>1 mois Neptune offert via un code envoyé après confirmation du paiement</b></li></ul></div>
          <div className="price-card"><span>VOTRE PASSAGE</span><strong>200 € <small>TTC</small></strong><p>Préparation + plateau + montage quasi-live + diffusion + passage individuel + 10 shorts minimum.</p><a className="btn primary full" href="/reserver/neptune-jt/">Pré-réserver sans payer</a></div>
        </section>

        <section className="section threshold">
          <div className="threshold-copy"><div className="eyebrow">4 POUR PARTIR · 6 MAXIMUM</div><h2>Le paiement ne part que lorsque l&apos;édition peut réellement se faire.</h2><p>Vous commencez par une pré-réservation gratuite. Dès que <strong>4 participants</strong> sont inscrits, chacun reçoit son lien de règlement pour confirmer sa place.</p><p>À <strong>J-7</strong>, si moins de 4 places sont confirmées et réglées, l&apos;édition est automatiquement annulée. D&apos;où l&apos;intérêt de partager votre lien : plus vite le groupe est complet, plus vite l&apos;édition est sécurisée.</p></div>
          <div className="gauge-card"><div className="gauge-top"><span>Minimum de maintien</span><b>{Math.min(total, 4)} / 4</b></div><div className="gauge">{Array.from({ length: 6 }).map((_, index) => <i key={index} className={index >= total ? "ghost" : index < confirmed ? "paid" : ""} />)}</div><small>{nextEdition}<br />{status?.registrationOpen ? `${Math.max(0, 4 - total)} place(s) avant déclenchement des règlements.` : "Pré-réservations actuellement indisponibles."}</small></div>
        </section>

        <section className="section cta-panel"><div><div className="eyebrow">PROCHAINE ÉDITION</div><h2>Votre secteur fait l&apos;actualité ?<br />Venez l&apos;expliquer.</h2></div><a className="btn primary" href="/reserver/neptune-jt/">Pré-réserver ma place</a></section>
      </main>

      <footer><div><img src="/assets/logo-neptune.svg" alt="" /><span>Neptune Media</span></div><nav><a href="https://media.neptunebusiness.com/cgv-neptune-media.html">CGV Neptune Media</a><a href="https://media.neptunebusiness.com/cgv-neptune-jt.html">Conditions Neptune JT</a></nav></footer>
    </>
  );
}