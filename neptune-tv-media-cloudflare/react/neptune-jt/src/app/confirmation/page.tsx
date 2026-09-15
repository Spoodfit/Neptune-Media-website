"use client";

import { useEffect, useState } from "react";

type PaymentState = "checking" | "confirmed" | "review" | "pending" | "error";
type PaymentPayload = { confirmed?: boolean; paymentStatus?: string; financialReviewRequired?: boolean; anomaly?: string; error?: string };

export default function ConfirmationPage() {
  const [state, setState] = useState<PaymentState>("checking");
  const [message, setMessage] = useState("Nous vérifions votre règlement auprès de Stripe…");

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id") || "";
    if (!sessionId) {
      setState("error");
      setMessage("Aucune session de paiement n’a été transmise. Si vous avez réglé, contactez Neptune avant d’effectuer un nouveau paiement.");
      return;
    }
    let alive = true;
    fetch(`/api/neptune-jt/payment-status?session_id=${encodeURIComponent(sessionId)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as PaymentPayload;
        if (!response.ok) throw new Error(data.error || "verification_failed");
        return data;
      })
      .then((data) => {
        if (!alive) return;
        if (data.financialReviewRequired) {
          setState("review");
          setMessage("Votre paiement a bien été détecté mais nécessite une vérification par Neptune. N’effectuez pas de second paiement : notre équipe contrôle la situation.");
          return;
        }
        if (data.confirmed) {
          setState("confirmed");
          setMessage("Votre règlement de 200 € TTC est validé. Votre place au Neptune JT est maintenant confirmée.");
          return;
        }
        setState("pending");
        setMessage(data.paymentStatus === "paid" ? "Le paiement est reçu et sa confirmation est en cours de synchronisation. Ne payez pas une seconde fois." : "Le règlement n’est pas encore confirmé. Revenez sur cette page après le paiement ou vérifiez votre e-mail.");
      })
      .catch(() => {
        if (!alive) return;
        setState("error");
        setMessage("Nous n’avons pas pu vérifier le paiement pour le moment. N’effectuez pas de second paiement ; contactez Neptune si votre compte a déjà été débité.");
      });
    return () => { alive = false; };
  }, []);

  const title = state === "confirmed" ? "Votre place est confirmée." : state === "review" ? "Paiement à vérifier." : state === "pending" ? "Confirmation en cours." : state === "error" ? "Vérification impossible." : "Vérification du paiement…";

  return (
    <div className="app-shell">
      <header className="topbar"><a className="brand" href="/neptune-jt/"><img src="/assets/logo-neptune.svg" alt="" /><span>Neptune Media</span></a><div className="secure">Neptune JT · Paiement</div></header>
      <main style={{ display: "grid", placeItems: "center", minHeight: "calc(100vh - 80px)", padding: 24 }}>
        <section className="success-card" style={{ display: "block", maxWidth: 720, width: "100%" }}>
          <div className="success-icon">{state === "confirmed" ? "✓" : state === "review" ? "!" : state === "error" ? "×" : "…"}</div>
          <div className="step-label">NEPTUNE JT · CONFIRMATION</div>
          <h2>{title}</h2>
          <p>{message}</p>
          {state === "confirmed" && <div className="notice"><b>Prochaine étape :</b> Neptune vous recontactera pour préparer votre sujet et votre passage sur le plateau.</div>}
          {(state === "review" || state === "error" || state === "pending") && <div className="notice"><b>Important :</b> N’effectuez pas de second paiement tant que la situation n’est pas clarifiée.</div>}
          <a className="back-link" href="/neptune-jt/">← Revenir à Neptune JT</a>
        </section>
      </main>
    </div>
  );
}
