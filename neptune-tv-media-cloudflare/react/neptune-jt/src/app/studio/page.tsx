"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Edition = {
  id: string; label?: string; eventAt?: string; cutoffAt?: string; location?: string; status?: string;
  paymentLink?: string; notes?: string; registrationsClosedAt?: string | null;
};
type Reservation = {
  id: string; firstName?: string; lastName?: string; email?: string; phone?: string; company?: string; role?: string; website?: string;
  memberStatus?: string; topic?: string; topicContext?: string; sourceLink?: string; commercialCta?: string; status?: string;
  amountPaidCents?: number; stripeSessionId?: string; referredBy?: string; referrerFirstName?: string; referrerLastName?: string; referrerCompany?: string;
};
type Dashboard = {
  canEdit?: boolean; activeEditionId?: string; selectedEdition?: Edition | null; editions?: Edition[]; reservations?: Reservation[];
  counts?: { total?: number; confirmed?: number; paymentRequested?: number; revenueCents?: number; paidEver?: number };
  paymentLinkFallback?: string;
};
type Auth = { user?: { fullName?: string; email?: string; role?: string }; csrfToken?: string };

const API = "/api/admin/neptune-jt-v183";
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function formatDate(value?: string) {
  if (!value) return "Date à confirmer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date à confirmer";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}
function statusLabel(status?: string) {
  return ({ collecting: "Collecte", payment_open: "Paiements ouverts", confirmed: "Maintenue", cancelled: "Annulée", archived: "Archivée", pre_registered: "Pré-réservé", payment_requested: "Paiement demandé", cancelled_event: "Édition annulée", cancelled_participant: "Participation annulée", moved: "Déplacé" } as Record<string, string>)[status || ""] || status || "Inconnu";
}
function localInput(value?: string) {
  if (!value) return "";
  const d = new Date(value); if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset(); return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function StudioPage() {
  const [csrf, setCsrf] = useState("");
  const [auth, setAuth] = useState<Auth | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState("Synchronisation…");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [editionModal, setEditionModal] = useState<Edition | "new" | null>(null);
  const [participant, setParticipant] = useState<Reservation | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void boot(); }, []);

  async function request<T = any>(url: string, init: RequestInit = {}, withCsrf = true): Promise<T> {
    const headers = new Headers(init.headers || {}); headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    const token = csrf || (typeof window !== "undefined" ? sessionStorage.getItem("neptune_csrf") || "" : "");
    if (withCsrf && token) headers.set("X-CSRF-Token", token);
    const response = await fetch(url, { ...init, headers, credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    return data;
  }

  async function boot() {
    setLoading(true); setError("");
    try {
      const current = await request<Auth>("/api/auth/status", {}, false);
      if (!current.user) throw new Error("unauthorized");
      const token = current.csrfToken || ""; setCsrf(token); if (token) sessionStorage.setItem("neptune_csrf", token);
      setAuth(current); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "unauthorized"); }
    finally { setLoading(false); }
  }

  async function load(editionId = "") {
    setSync("Synchronisation…");
    try {
      const suffix = editionId ? `?editionId=${encodeURIComponent(editionId)}` : "";
      const next = await request<Dashboard>(`${API}/dashboard${suffix}`);
      setDashboard(next); setSync("Synchronisé");
    } catch (e) { setSync("Erreur de synchronisation"); throw e; }
  }

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2800); }

  async function editionAction(action: string) {
    const edition = dashboard?.selectedEdition; if (!edition || !dashboard?.canEdit) return;
    if (action === "cancel" && !window.confirm("Annuler cette édition ? Les participants seront notifiés et tout paiement encaissé devra être remboursé ou reporté manuellement.")) return;
    try {
      await request(`${API}/edition-action`, { method: "POST", body: JSON.stringify({ editionId: edition.id, action, confirmPaidRisk: action === "cancel" }) });
      notify("Édition mise à jour."); await load(edition.id);
    } catch (e) { notify(`Erreur : ${e instanceof Error ? e.message : "action_failed"}`); }
  }

  async function saveEdition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dashboard?.canEdit) return;
    const fd = new FormData(event.currentTarget); const id = String(fd.get("id") || "");
    const eventValue = String(fd.get("eventAt") || "");
    const payload = {
      id: id || undefined,
      label: String(fd.get("label") || "").trim(),
      eventAt: eventValue ? new Date(eventValue).toISOString() : "",
      location: String(fd.get("location") || "").trim(),
      paymentLink: String(fd.get("paymentLink") || "").trim(),
      notes: String(fd.get("notes") || "").trim(),
      activate: fd.get("activate") === "on",
    };
    try {
      const result = await request<any>(`${API}/edition`, { method: "POST", body: JSON.stringify(payload) });
      setEditionModal(null); notify(id ? "Édition mise à jour." : "Édition créée."); await load(result.edition?.id || id);
    } catch (e) { notify(`Erreur : ${e instanceof Error ? e.message : "save_failed"}`); }
  }

  async function reservationAction(action: "resend" | "cancel" | "move") {
    if (!participant || !dashboard?.canEdit) return;
    const paid = Number(participant.amountPaidCents || 0) > 0 || participant.status === "confirmed";
    if (action === "cancel" && !window.confirm(paid ? "Ce participant a un paiement confirmé. Annuler créera une alerte de remboursement/report. Continuer ?" : "Annuler cette participation ?")) return;
    if (action === "move" && !moveTarget) return notify("Choisissez une édition cible.");
    try {
      await request(`${API}/reservation-action`, { method: "POST", body: JSON.stringify({ reservationId: participant.id, action, targetEditionId: moveTarget || undefined, confirmPaidRisk: paid && action === "cancel" }) });
      notify(action === "resend" ? "E-mail renvoyé." : action === "move" ? "Participant déplacé." : "Participation annulée.");
      setParticipant(null); setMoveTarget(""); await load(dashboard.selectedEdition?.id || "");
    } catch (e) { notify(`Erreur : ${e instanceof Error ? e.message : "action_failed"}`); }
  }

  async function logout() {
    try { await request("/api/auth/logout", { method: "POST" }, false); } catch {}
    sessionStorage.removeItem("neptune_csrf"); window.location.assign("/studio/");
  }

  function exportCsv() {
    const rows = dashboard?.reservations || [];
    const clean = (value: unknown) => { const text = String(value ?? "").replace(/"/g, '""'); return /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text; };
    const columns = ["Prénom","Nom","Entreprise","Email","Téléphone","Fonction","Statut","Sujet","Contexte","CTA","Montant TTC"];
    const body = rows.map(r => [r.firstName,r.lastName,r.company,r.email,r.phone,r.role,statusLabel(r.status),r.topic,r.topicContext,r.commercialCta,(Number(r.amountPaidCents||0)/100).toFixed(2)].map(v => `"${clean(v)}"`).join(";"));
    const blob = new Blob([`\uFEFF${columns.join(";")}\n${body.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `neptune-jt-${dashboard?.selectedEdition?.id || "edition"}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  const reservations = useMemo(() => (dashboard?.reservations || []).filter(r => {
    if (filter && r.status !== filter) return false;
    const haystack = [r.firstName,r.lastName,r.email,r.company,r.role,r.topic,r.topicContext].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [dashboard, query, filter]);
  const counts = dashboard?.counts || {}; const total = Number(counts.total || 0); const confirmed = Number(counts.confirmed || 0); const remaining = Math.max(0, 6-total);

  if (loading) return <div className="jt-loading"><div className="jt-loader" /><strong>Synchronisation Neptune JT…</strong></div>;
  if (error || !auth?.user) return <main className="jt-auth-gate"><div className="jt-auth-card"><img src="/assets/logo-neptune.svg" alt="" /><p className="jt-eyebrow">NEPTUNE MEDIA STUDIO</p><h1>Session Studio requise</h1><p>Connectez-vous au Studio pour administrer Neptune JT.</p><a className="jt-btn jt-btn--primary" href="/studio/advanced.html">Se connecter au Studio</a></div></main>;

  const edition = dashboard?.selectedEdition;
  const referrals = (dashboard?.reservations || []).filter(r => r.referredBy);

  return (
    <div className="jt-shell">
      <aside className="jt-sidebar">
        <a className="jt-brand" href="/studio/clients"><img src="/assets/logo-neptune.svg" alt="" /><div><b>Neptune</b><small>Media · Studio</small></div></a>
        <div className="jt-sync"><i /><span>Studio synchronisé</span></div>
        <a className="jt-feature-link active" href="/studio/neptune-jt"><span>JT</span><div><b>Neptune JT</b><small>Éditions & participants</small></div></a>
        <nav className="jt-nav"><a href="/studio/clients"><span>◎</span><strong>Parcours clients</strong></a><a href="/studio/webtv.html"><span>▶</span><strong>Diffusion</strong></a><a href="/studio/advanced.html#programs"><span>▦</span><strong>Catalogue Média</strong></a><a href="/studio/advanced.html#finances"><span>€</span><strong>Finance</strong></a><a href="/studio/advanced.html#settings"><span>⚙</span><strong>Réglage</strong></a></nav>
        <button className="jt-account" type="button" onClick={logout}><span className="jt-avatar">NM</span><span><b>{auth.user.fullName || auth.user.email || "Compte Studio"}</b><small>{auth.user.role || "Se déconnecter"}</small></span><i>↪</i></button>
      </aside>
      <main className="jt-main">
        <header className="jt-topbar"><div><p className="jt-eyebrow">NEPTUNE MEDIA STUDIO</p><h1>Neptune JT</h1><p className="jt-subtitle">Pilotez les éditions, les participants et le seuil 4/6 depuis un seul endroit.</p></div><div className="jt-top-actions"><span className="jt-status-dot"><i /><span>{sync}</span></span><button className="jt-btn jt-btn--secondary" onClick={() => void load(edition?.id)}>Actualiser</button>{dashboard?.canEdit && <button className="jt-btn jt-btn--primary" onClick={() => setEditionModal("new")}>Nouvelle édition</button>}</div></header>
        <section className="jt-toolbar"><label className="jt-edition-select"><span>Édition affichée</span><select value={edition?.id || ""} onChange={e => void load(e.target.value)} disabled={!dashboard?.editions?.length}>{(dashboard?.editions || []).map(e => <option key={e.id} value={e.id}>{e.label} · {statusLabel(e.status)}{e.id===dashboard?.activeEditionId ? " · ACTIVE" : ""}</option>)}</select></label><div className="jt-toolbar-actions">{dashboard?.canEdit && edition && <button className="jt-btn jt-btn--ghost" onClick={() => setEditionModal(edition)}>Modifier l’édition</button>}<button className="jt-btn jt-btn--ghost" onClick={exportCsv}>Exporter CSV</button></div></section>

        <section className="jt-edition-banner">{edition ? <><h2>{edition.label}</h2><p>{formatDate(edition.eventAt)} · {edition.location || "Lieu à confirmer"}</p><div className="jt-banner-meta"><span className={edition.id===dashboard?.activeEditionId ? "active" : ""}>{edition.id===dashboard?.activeEditionId ? "● Édition active du tunnel" : "Historique / autre édition"}</span><span>{edition.cutoffAt ? `Seuil vérifié le ${formatDate(edition.cutoffAt)}` : "Date J-7 non définie"}</span><span>{statusLabel(edition.status)}</span>{edition.registrationsClosedAt && <span>Inscriptions fermées</span>}</div></> : <><h2>Aucune édition Neptune JT</h2><p>Créez la première édition depuis le Studio.</p></>}</section>
        <section className="jt-metrics"><Metric value={`${total}/4`} label="Seuil participants" detail={total>=4 ? "Seuil de pré-réservation atteint" : `${Math.max(0,4-total)} personne(s) à trouver`} width={Math.min(100,total/4*100)} /><Metric value={`${confirmed}/4`} label="Paiements confirmés" detail={confirmed>=4 ? "Édition financièrement maintenue" : `${Math.max(0,4-confirmed)} paiement(s) manquant(s)`} width={Math.min(100,confirmed/4*100)} /><Metric value={String(remaining)} label="Places restantes" detail={`${Number(counts.paymentRequested||0)} paiement(s) en attente`} width={Math.min(100,total/6*100)} /><Metric value={euro.format(Number(counts.revenueCents||0)/100)} label="CA encaissé" detail={`${Number(counts.paidEver||0)} règlement(s) Stripe`} width={Math.min(100,confirmed/6*100)} /></section>

        <div className="jt-grid">
          <section className="jt-panel jt-panel--participants"><div className="jt-panel-head"><div><p className="jt-eyebrow">PARTICIPANTS</p><h2>Réservations</h2><p>{(dashboard?.reservations||[]).length} dossier(s) · {confirmed} paiement(s) confirmé(s)</p></div><div className="jt-filters"><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher nom, entreprise, sujet…" /><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Tous les statuts</option><option value="confirmed">Payé</option><option value="payment_requested">Paiement demandé</option><option value="pre_registered">Pré-réservé</option><option value="cancelled_participant">Annulé</option><option value="cancelled_event">Édition annulée</option></select></div></div><div className="jt-table-wrap"><table className="jt-table"><thead><tr><th>Participant</th><th>Sujet</th><th>Statut</th><th>Parrainage</th><th>Montant</th><th /></tr></thead><tbody>{reservations.map(r => <tr key={r.id}><td><div className="jt-person"><strong>{r.firstName} {r.lastName}</strong><small>{r.company || r.email}</small></div></td><td><div className="jt-topic"><strong>{r.topic || "Sujet à préciser"}</strong><small>{r.role || r.topicContext || ""}</small></div></td><td><span className={`jt-pill jt-pill--${r.status || "unknown"}`}>{statusLabel(r.status)}</span></td><td>{r.referredBy ? ([r.referrerFirstName,r.referrerLastName].filter(Boolean).join(" ") || r.referrerCompany || r.referredBy) : "Direct"}</td><td><strong>{Number(r.amountPaidCents||0) ? euro.format(Number(r.amountPaidCents)/100) : "—"}</strong></td><td><button className="jt-row-action" onClick={()=>setParticipant(r)}>Ouvrir</button></td></tr>)}</tbody></table></div>{reservations.length===0 && <div className="jt-empty"><strong>Aucune réservation pour cette édition.</strong><span>Le tunnel alimentera automatiquement cet écran.</span></div>}</section>
          <aside className="jt-panel jt-panel--control"><div className="jt-panel-head"><div><p className="jt-eyebrow">CONTRÔLE</p><h2>Édition</h2><p>Actions sensibles protégées côté serveur.</p></div></div><div className="jt-control-list">{edition && dashboard?.canEdit ? <>{edition.id!==dashboard.activeEditionId && <button className="jt-btn jt-btn--primary" onClick={()=>void editionAction("activate")}>Définir comme édition active</button>}<button className="jt-btn jt-btn--ghost" onClick={()=>void editionAction(edition.registrationsClosedAt ? "reopen" : "close")}>{edition.registrationsClosedAt ? "Réouvrir les inscriptions" : "Fermer les inscriptions"}</button>{!['cancelled','archived'].includes(edition.status||'') && <button className="jt-btn jt-btn--danger" onClick={()=>void editionAction("cancel")}>Annuler l’édition</button>}{edition.status==='cancelled' && <button className="jt-btn jt-btn--ghost" onClick={()=>void editionAction("archive")}>Archiver l’édition</button>}</> : <p className="jt-empty">{dashboard?.canEdit ? "Aucune édition sélectionnée." : "Votre rôle permet la consultation uniquement."}</p>}</div><div className="jt-rule-card"><strong>Règle de maintien</strong><p>À J-7, l’édition est maintenue uniquement à partir de 4 paiements confirmés. Sinon elle est annulée automatiquement.</p></div><div className="jt-rule-card jt-rule-card--stripe"><strong>Stripe reste la source de vérité</strong><p>Le Studio ne permet pas de marquer manuellement un client comme payé.</p></div></aside>
        </div>

        <section className="jt-panel jt-panel--referrals"><div className="jt-panel-head"><div><p className="jt-eyebrow">DISTRIBUTION</p><h2>Parrainages & partage</h2><p>Qui contribue réellement à remplir l’édition.</p></div></div><div className="jt-referrals">{referrals.length ? referrals.map(r => <article className="jt-referral" key={r.id}><strong>{[r.referrerFirstName,r.referrerLastName].filter(Boolean).join(" ") || r.referrerCompany || r.referredBy}</strong><span>{r.company || `${r.firstName} ${r.lastName}`}</span><span>{r.topic || "Sujet à préciser"}</span></article>) : <div className="jt-empty"><strong>Aucun parrainage attribué pour le moment.</strong><span>Les liens personnels du tunnel seront comptabilisés ici.</span></div>}</div></section>
      </main>

      {editionModal && <div className="jt-react-modal" role="dialog" aria-modal="true"><form className="jt-dialog-card" onSubmit={saveEdition}><div className="jt-dialog-head"><div><p className="jt-eyebrow">ÉDITION NEPTUNE JT</p><h2>{editionModal === "new" ? "Nouvelle édition" : "Modifier l’édition"}</h2></div><button className="jt-icon-btn" type="button" onClick={()=>setEditionModal(null)}>×</button></div><input type="hidden" name="id" defaultValue={editionModal === "new" ? "" : editionModal.id} /><label><span>Nom de l’édition</span><input name="label" required defaultValue={editionModal === "new" ? "" : editionModal.label} placeholder="Neptune JT · Octobre 2026" /></label><label><span>Date et heure du tournage</span><input name="eventAt" type="datetime-local" required defaultValue={editionModal === "new" ? "" : localInput(editionModal.eventAt)} /></label><label><span>Lieu</span><input name="location" required defaultValue={editionModal === "new" ? "REC BOX Studio · 11 Allée de Longueterre, 31850 Montrabé" : editionModal.location} /></label><label><span>Lien Stripe 200 € TTC</span><input name="paymentLink" type="url" required defaultValue={editionModal === "new" ? dashboard?.paymentLinkFallback || "https://buy.stripe.com/bJe28rcdngXw0586qi73G0d" : editionModal.paymentLink} /></label><label><span>Notes internes</span><textarea name="notes" rows={4} defaultValue={editionModal === "new" ? "" : editionModal.notes} /></label><label className="jt-check"><input name="activate" type="checkbox" defaultChecked={editionModal === "new" || editionModal.id===dashboard?.activeEditionId} /><span>Définir cette édition comme édition active du tunnel</span></label><div className="jt-dialog-actions"><button className="jt-btn jt-btn--ghost" type="button" onClick={()=>setEditionModal(null)}>Annuler</button><button className="jt-btn jt-btn--primary" type="submit">Enregistrer</button></div></form></div>}

      {participant && <div className="jt-react-modal" role="dialog" aria-modal="true"><div className="jt-dialog-card jt-react-wide"><div className="jt-dialog-head"><div><p className="jt-eyebrow">DOSSIER PARTICIPANT</p><h2>{participant.firstName} {participant.lastName}</h2></div><button className="jt-icon-btn" type="button" onClick={()=>setParticipant(null)}>×</button></div><div className="jt-react-detail"><Info label="Entreprise" value={participant.company} /><Info label="Fonction" value={participant.role} /><Info label="E-mail" value={participant.email} /><Info label="Téléphone" value={participant.phone} /><Info label="Membre Neptune" value={participant.memberStatus === "member" ? "Oui" : "Non / 1 mois inclus"} /><Info label="Statut" value={statusLabel(participant.status)} /><Info label="Sujet" value={participant.topic} wide /><Info label="Contexte" value={participant.topicContext} wide /><Info label="CTA" value={participant.commercialCta} wide /><Info label="Source" value={participant.sourceLink} wide /></div>{dashboard?.canEdit && <div className="jt-dialog-actions jt-react-actions"><button className="jt-btn jt-btn--ghost" onClick={()=>void reservationAction("resend")}>Renvoyer l’e-mail</button>{participant.status !== "confirmed" && <><select value={moveTarget} onChange={e=>setMoveTarget(e.target.value)}><option value="">Déplacer vers…</option>{(dashboard.editions||[]).filter(e=>e.id!==edition?.id && !['cancelled','archived'].includes(e.status||'')).map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select><button className="jt-btn jt-btn--ghost" onClick={()=>void reservationAction("move")}>Déplacer</button></>}<button className="jt-btn jt-btn--danger" onClick={()=>void reservationAction("cancel")}>Annuler la participation</button></div>}</div></div>}
      {toast && <div className="jt-toast">{toast}</div>}
      <style jsx global>{`.jt-react-modal{position:fixed;inset:0;z-index:9999;background:rgba(10,18,38,.58);display:grid;place-items:center;padding:24px}.jt-react-modal .jt-dialog-card{max-height:90vh;overflow:auto;width:min(620px,100%);background:#fff}.jt-react-wide{width:min(860px,100%)!important}.jt-react-detail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.jt-react-info{padding:14px;border:1px solid #e7eaf0;border-radius:14px}.jt-react-info.wide{grid-column:1/-1}.jt-react-info small{display:block;color:#667085;margin-bottom:5px}.jt-react-info strong{white-space:pre-wrap;word-break:break-word}.jt-react-actions{flex-wrap:wrap}.jt-react-actions select{min-height:42px;border:1px solid #d0d5dd;border-radius:10px;padding:0 10px}@media(max-width:720px){.jt-react-detail{grid-template-columns:1fr}}`}</style>
    </div>
  );
}

function Metric({ value, label, detail, width }: { value: string; label: string; detail: string; width: number }) { return <article className="jt-metric"><small>{label}</small><strong>{value}</strong><p>{detail}</p><div className="jt-progress"><i style={{ width: `${width}%` }} /></div></article>; }
function Info({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) { return <div className={`jt-react-info${wide ? " wide" : ""}`}><small>{label}</small><strong>{value || "—"}</strong></div>; }
