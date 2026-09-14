"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Edition = { label?: string; eventAt?: string; location?: string } | null;
type StatusPayload = {
  registrationOpen?: boolean;
  registrationReason?: string;
  counts?: { total?: number; confirmed?: number };
  edition?: Edition;
};
type SuccessPayload = StatusPayload & { sharePath?: string };

function formatDate(value?: string) {
  if (!value) return "Date à confirmer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date à confirmer";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

function closedMessage(reason?: string, edition?: Edition) {
  const messages: Record<string, string> = {
    edition_not_ready: "La prochaine édition est en préparation. Les pré-réservations ouvriront dès que sa date sera confirmée.",
    edition_date_passed: "Cette édition est terminée. La prochaine date sera affichée dès son ouverture.",
    edition_unavailable: "Cette édition n’est plus disponible. Une prochaine date sera proposée.",
    registrations_closed: "Les pré-réservations sont closes pour cette édition.",
    edition_full: "Cette édition a atteint ses 6 pré-réservations.",
  };
  if (!edition) return messages.edition_not_ready;
  return messages[reason || ""] || "Les pré-réservations ne sont pas ouvertes pour cette édition.";
}

function friendlyError(code?: string) {
  const messages: Record<string, string> = {
    edition_full: "Cette édition a déjà atteint ses 6 pré-réservations.",
    edition_cancelled: "Cette édition est annulée. Une nouvelle date sera proposée prochainement.",
    edition_unavailable: "Cette édition n’est plus disponible.",
    edition_not_ready: "La prochaine édition n’est pas encore ouverte aux pré-réservations.",
    edition_date_passed: "La date de cette édition est dépassée.",
    registrations_closed: "Les pré-réservations sont closes pour cette édition.",
    already_registered: "Cette adresse e-mail est déjà rattachée à cette édition. Contactez Neptune pour modifier votre dossier.",
    required_fields_missing: "Complétez au minimum votre identité, votre entreprise, votre e-mail et votre sujet.",
    consent_required: "Les conditions et l’autorisation de captation doivent être acceptées.",
    request_rejected: "La demande n’a pas pu être validée. Rechargez la page puis réessayez.",
    origin_forbidden: "Rechargez la page avant de réessayer.",
  };
  return messages[code || ""] || "Impossible d’enregistrer la pré-réservation pour le moment.";
}

export default function ReservationPage() {
  const startedAt = useRef(Date.now());
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [referral, setReferral] = useState("");

  useEffect(() => {
    setReferral(new URLSearchParams(window.location.search).get("ref")?.slice(0, 80) || "");
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    setStatusError(false);
    try {
      const response = await fetch("/api/neptune-jt/status", { credentials: "same-origin", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "status_unavailable");
      setStatus(body);
    } catch {
      setStatusError(true);
      setStatus({ registrationOpen: false, counts: { total: 0, confirmed: 0 }, edition: null });
    }
  }

  const total = Number(status?.counts?.total || 0);
  const confirmed = Number(status?.counts?.confirmed || 0);
  const registrationOpen = status?.registrationOpen === true && total < 6 && !statusError;
  const statusText = useMemo(() => {
    if (statusError) return "Impossible de vérifier l’édition en cours. Rechargez la page avant toute pré-réservation.";
    if (!registrationOpen) return closedMessage(status?.registrationReason, status?.edition);
    if (total >= 4) return `Minimum atteint · ${confirmed}/${total} pré-réservation(s) déjà confirmée(s) par paiement.`;
    return `${total}/4 pré-réservation(s) · encore ${4 - total} pour déclencher les règlements.`;
  }, [status, statusError, registrationOpen, total, confirmed]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!registrationOpen) {
      setError("Les pré-réservations ne sont pas ouvertes pour le moment. Rechargez la page pour vérifier la prochaine édition.");
      return;
    }
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const payload: Record<string, unknown> = Object.fromEntries(fd.entries());
    payload.acceptTerms = fd.get("acceptTerms") === "on";
    payload.acceptMediaRights = fd.get("acceptMediaRights") === "on";
    payload.referredBy = referral;
    payload._formStartedAt = startedAt.current;
    setSubmitting(true);
    try {
      const response = await fetch("/api/neptune-jt/pre-register", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(friendlyError(body?.error));
      setSuccess(body);
      await refreshStatus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Impossible d’enregistrer la pré-réservation.");
    } finally {
      setSubmitting(false);
    }
  }

  const shareUrl = success?.sharePath && typeof window !== "undefined" ? new URL(success.sharePath, window.location.origin).toString() : "";
  const shareMessage = shareUrl ? `Une place au prochain Neptune JT peut t'intéresser : on vient décrypter une actualité liée à son entreprise sur un plateau, avec son passage + 10 shorts minimum. Pré-réservation ici : ${shareUrl}` : "";

  async function copyShare() {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); } catch {
      const area = document.createElement("textarea"); area.value = shareUrl; document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
    }
    setCopied(true);
  }

  return (
    <div className="app-shell">
      <header className="topbar"><a className="brand" href="/neptune-jt/"><img src="/assets/logo-neptune.svg" alt="" /><span>Neptune Media</span></a><div className="secure">Neptune JT · Pré-réservation</div></header>
      <main>
        <aside className="summary">
          <div className="live-kicker"><i /> PROCHAINE ÉDITION</div>
          <h1>Réservez votre sujet.<br /><span>Le paiement vient après.</span></h1>
          <p>Vous pré-réservez gratuitement. Dès que 4 participants sont inscrits, vous recevez le lien de paiement de <strong>200 € TTC</strong> pour confirmer votre place.</p>
          <div className="status-card" aria-live="polite">
            <div className="status-head"><span>Minimum de maintien</span><b>{Math.min(total, 4)} / 4</b></div>
            <div className="segments" aria-hidden="true">{Array.from({ length: 6 }).map((_, index) => <i key={index} className={`${index < total ? "filled" : ""} ${index < confirmed ? "paid" : ""}`.trim()} />)}</div>
            <p>{statusText}</p>
            <div id="editionMeta" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(172,193,228,.16)", display: "grid", gap: 5, color: "#c6d1e3", fontSize: ".82rem", lineHeight: 1.45 }}>
              <strong style={{ color: "#fff" }}>{status?.edition?.eventAt ? formatDate(status.edition.eventAt) : "Prochaine date en préparation"}</strong>
              <span>{status?.edition?.location || "Les inscriptions ouvriront dès que la date et le lieu seront validés."}</span>
            </div>
          </div>
          <div className="facts"><div><strong>15–20 min</strong><span>sur le plateau</span></div><div><strong>10+</strong><span>shorts livrés</span></div><div><strong>6 max.</strong><span>par édition</span></div><div><strong>J-7</strong><span>date limite de maintien</span></div></div>
          <div className="rule-box"><b>Pourquoi partager votre lien ?</b><p>Si 4 places ne sont pas confirmées et réglées à J-7, l’édition est annulée. Inviter un entrepreneur pertinent aide donc directement à sécuriser le tournage.</p></div>
        </aside>

        {!success ? (
          <section className="form-card">
            <div className="step-label">ÉTAPE UNIQUE · 4 MINUTES</div><h2>Parlez-nous de votre actualité.</h2><p className="intro">Pas besoin d&apos;avoir déjà l&apos;angle parfait. Donnez-nous le sujet qui touche votre entreprise ou votre marché ; Neptune affinera l&apos;interview avec vous.</p>
            <form onSubmit={onSubmit}>
              <input name="_companyWebsite" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
              <div className="grid two"><label>Prénom<input name="firstName" autoComplete="given-name" required /></label><label>Nom<input name="lastName" autoComplete="family-name" required /></label></div>
              <div className="grid two"><label>Entreprise<input name="company" autoComplete="organization" required /></label><label>Fonction<input name="role" autoComplete="organization-title" placeholder="Dirigeant, photographe, expert…" /></label></div>
              <div className="grid two"><label>E-mail<input type="email" name="email" autoComplete="email" required /></label><label>Téléphone<input type="tel" name="phone" autoComplete="tel" /></label></div>
              <label>Site ou profil principal<input type="url" name="website" placeholder="https://" /></label>
              <fieldset><legend>Êtes-vous déjà membre Neptune Business ?</legend><div className="choice-row"><label className="choice"><input type="radio" name="memberStatus" value="member" required /><span><b>Oui</b><small>Mon adhésion est déjà active</small></span></label><label className="choice"><input type="radio" name="memberStatus" value="non_member" required /><span><b>Non</b><small>1 mois d&apos;adhésion est inclus dans le tarif</small></span></label></div></fieldset>
              <label className="featured">Quelle actualité souhaitez-vous décrypter ?<textarea name="topic" rows={4} required placeholder="Ex. L'IA générative bouleverse-t-elle réellement le métier de photographe ?" /><small>Un sujet actuel lié directement à votre entreprise, votre métier ou votre marché.</small></label>
              <label>Pourquoi ce sujet vous concerne-t-il maintenant ?<textarea name="topicContext" rows={3} placeholder="Ce que vous observez sur le terrain, ce qui change pour vos clients, votre secteur…" /></label>
              <label>Lien vers une actualité ou une source utile <span className="optional">(facultatif)</span><input type="url" name="sourceLink" placeholder="Article, étude, annonce officielle…" /></label>
              <label>Votre CTA à la fin du passage <span className="optional">(facultatif)</span><textarea name="commercialCta" rows={2} placeholder="Où voulez-vous renvoyer les personnes qui souhaitent vous contacter ?" /></label>
              <div className="consents"><label><input type="checkbox" name="acceptTerms" required /><span>J&apos;accepte les <a href="https://media.neptunebusiness.com/cgv-neptune-media.html" target="_blank" rel="noreferrer">CGV Neptune Media</a> et les <a href="https://media.neptunebusiness.com/cgv-neptune-jt.html" target="_blank" rel="noreferrer">conditions spécifiques Neptune JT</a>.</span></label><label><input type="checkbox" name="acceptMediaRights" required /><span>J&apos;autorise la captation et la diffusion de mon image, de ma voix et de mon intervention dans le cadre de Neptune JT et de sa promotion.</span></label></div>
              <div className="notice"><b>Aucun paiement aujourd&apos;hui.</b> Votre pré-réservation déclenche le règlement uniquement lorsque le seuil minimum de 4 participants est atteint. Votre place devient définitive après paiement.</div>
              <button className="submit" type="submit" disabled={submitting || !registrationOpen}>{submitting ? "Pré-réservation en cours…" : total >= 6 ? "Édition complète" : registrationOpen ? "Pré-réserver ma place" : "Pré-réservations indisponibles"}</button>
              <div className="form-error" role="alert">{error}</div>
            </form>
          </section>
        ) : (
          <section className="success-card">
            <div className="success-icon">✓</div><div className="step-label">PRÉ-RÉSERVATION ENREGISTRÉE</div><h2>{Number(success.counts?.total || 0) >= 4 ? "Le minimum est atteint." : "Votre sujet est dans la sélection."}</h2>
            <p>{Number(success.counts?.total || 0) >= 4 ? "Le lien de paiement de 200 € TTC vous est envoyé par e-mail pour confirmer définitivement votre place. Vérifiez aussi vos courriers indésirables." : `Nous sommes maintenant ${Number(success.counts?.total || 0)}/4. Aucun paiement n'est demandé pour l'instant. Dès que le quatrième participant pré-réserve, chacun reçoit le lien de règlement.`}</p>
            <div className="share-card"><span>Aidez l&apos;édition à atteindre son minimum</span><strong>Invitez une personne dont l&apos;actualité mérite le plateau.</strong><div className="share-url"><input value={shareUrl} readOnly /><button type="button" onClick={copyShare}>{copied ? "Copié ✓" : "Copier"}</button></div><div className="share-actions"><a href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`} target="_blank" rel="noreferrer">WhatsApp</a><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">LinkedIn</a></div></div>
            <a className="back-link" href="/neptune-jt/">← Revenir à Neptune JT</a>
          </section>
        )}
      </main>
    </div>
  );
}
