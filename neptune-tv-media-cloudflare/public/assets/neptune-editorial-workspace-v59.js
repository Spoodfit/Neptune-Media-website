const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const PLATFORM_URLS = {
  instagram: 'https://www.instagram.com/',
  linkedin: 'https://www.linkedin.com/feed/?shareActive=true',
  tiktok: 'https://www.tiktok.com/upload',
  youtube: 'https://www.youtube.com/upload',
};
const PLATFORM_LABELS = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const state = {
  context: null,
  selectedProposalId: '',
  mode: 'content',
  loading: false,
  fileId: '',
  occurrenceId: '',
};

install();

function install() {
  ensureWorkspace();
  document.addEventListener('click', interceptEditorialOpen, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('#neptuneEditorialPanel')?.classList.contains('is-open')) closeWorkspace();
  });
  const observer = new MutationObserver(() => augmentVideoCards());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  augmentVideoCards();
}

function interceptEditorialOpen(event) {
  const explicit = event.target.closest('[data-neptune-editorial-file]');
  if (explicit) {
    event.preventDefault();
    event.stopPropagation();
    openWorkspace({ fileId: explicit.dataset.neptuneEditorialFile });
    return;
  }

  const reuse = event.target.closest('[data-reuse-file]');
  if (reuse) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openWorkspace({ fileId: reuse.dataset.reuseFile, mode: 'reuse' });
    return;
  }

  const occurrence = event.target.closest('[data-occurrence-id]');
  if (occurrence) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openWorkspace({ occurrenceId: occurrence.dataset.occurrenceId });
    return;
  }

  const asset = event.target.closest('[data-open-asset]');
  if (asset && !event.target.closest('button,a')) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openWorkspace({ fileId: asset.dataset.openAsset });
  }
}

function augmentVideoCards() {
  $$('.compact-media-card').forEach((card) => {
    const open = $('[data-open-video]', card);
    const actions = $('.compact-media-actions', card);
    if (!open || !actions || $('[data-neptune-editorial-file]', actions)) return;
    const fileId = open.dataset.openVideo || '';
    if (!fileId) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'neptune-editorial-card-action';
    button.dataset.neptuneEditorialFile = fileId;
    button.textContent = 'Préparer le post';
    actions.append(button);
  });
}

function ensureWorkspace() {
  if ($('#neptuneEditorialPanel')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="neptuneEditorialBackdrop" class="neptune-editorial-backdrop" hidden></div>
    <aside id="neptuneEditorialPanel" class="neptune-editorial-panel" hidden role="dialog" aria-modal="true" aria-labelledby="neptuneEditorialTitle">
      <header class="neptune-editorial-head">
        <div>
          <p>NEPTUNE IA · PUBLICATION EXPRESS</p>
          <h2 id="neptuneEditorialTitle">Préparer la publication</h2>
        </div>
        <button type="button" data-editorial-close aria-label="Fermer">×</button>
      </header>
      <div id="neptuneEditorialBody" class="neptune-editorial-body"></div>
    </aside>
    <div id="neptuneEditorialToast" class="neptune-editorial-toast" hidden></div>
  `);
  $('#neptuneEditorialBackdrop').addEventListener('click', closeWorkspace);
  $('[data-editorial-close]').addEventListener('click', closeWorkspace);
  $('#neptuneEditorialPanel').addEventListener('click', onWorkspaceClick);
  $('#neptuneEditorialPanel').addEventListener('submit', onWorkspaceSubmit);
}

async function openWorkspace({ fileId = '', occurrenceId = '', mode = 'content' }) {
  if (state.loading) return;
  state.fileId = fileId;
  state.occurrenceId = occurrenceId;
  state.mode = mode;
  state.context = null;
  state.selectedProposalId = '';
  showWorkspace();
  renderLoading('Chargement du contenu…');
  state.loading = true;
  try {
    let context = await api(`/api/client/editorial/context?${new URLSearchParams({ fileId, occurrenceId }).toString()}`);
    if (!Array.isArray(context.editorial?.proposals) || context.editorial.proposals.length !== 3) {
      renderLoading('Neptune IA prépare trois angles éditoriaux…');
      context = await api('/api/client/editorial/generate', {
        method: 'POST',
        body: JSON.stringify({ fileId: context.item?.fileId || fileId, occurrenceId }),
      });
    }
    state.context = context;
    state.fileId = context.item?.fileId || fileId;
    state.occurrenceId = context.occurrence?.occurrenceId || occurrenceId;
    state.selectedProposalId = context.editorial?.selectedProposalId
      || context.editorial?.proposals?.[0]?.id
      || 'proposal_1';
    renderWorkspace();
  } catch (error) {
    renderError(errorText(error));
  } finally {
    state.loading = false;
  }
}

function showWorkspace() {
  const backdrop = $('#neptuneEditorialBackdrop');
  const panel = $('#neptuneEditorialPanel');
  backdrop.hidden = false;
  panel.hidden = false;
  document.body.classList.add('neptune-editorial-open');
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    panel.classList.add('is-open');
    panel.focus({ preventScroll: true });
  });
}

function closeWorkspace() {
  const backdrop = $('#neptuneEditorialBackdrop');
  const panel = $('#neptuneEditorialPanel');
  if (!panel) return;
  panel.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  document.body.classList.remove('neptune-editorial-open');
  window.setTimeout(() => {
    panel.hidden = true;
    backdrop.hidden = true;
    $('#neptuneEditorialBody').replaceChildren();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
}

function renderLoading(label) {
  $('#neptuneEditorialBody').innerHTML = `
    <div class="neptune-editorial-loading" role="status">
      <span></span><strong>${esc(label)}</strong><small>La page reste disponible. Aucune donnée n’est enregistrée pendant ce chargement.</small>
    </div>`;
}

function renderError(message) {
  $('#neptuneEditorialBody').innerHTML = `
    <div class="neptune-editorial-error">
      <strong>La fiche éditoriale n’a pas pu être chargée.</strong>
      <p>${esc(message)}</p>
      <button type="button" data-editorial-close>Fermer</button>
    </div>`;
  $('[data-editorial-close]', $('#neptuneEditorialBody'))?.addEventListener('click', closeWorkspace);
}

function renderWorkspace() {
  const context = state.context || {};
  const item = context.item || {};
  const occurrence = context.occurrence || null;
  const editorial = context.editorial || {};
  const proposals = editorial.proposals || [];
  const selected = selectedProposal(proposals);
  const final = finalFields(editorial, selected);
  const usageCount = Number(context.usageCount || 0);
  const sourceWarning = editorial.generationStatus === 'fallback'
    ? '<div class="neptune-source-warning"><strong>Contexte limité</strong><span>Le texte a été produit prudemment sans transcription complète. Vérifiez les formulations avant publication.</span></div>'
    : '';
  const occurrenceFields = occurrence ? occurrenceEditor(occurrence) : '';
  const reuseBlock = state.mode === 'reuse' || (!occurrence && usageCount >= 1) ? reuseEditor(context) : '';

  $('#neptuneEditorialTitle').textContent = cleanName(item.name) || 'Préparer la publication';
  $('#neptuneEditorialBody').innerHTML = `
    <div class="neptune-editorial-layout">
      <section class="neptune-editorial-media-column">
        <div class="neptune-editorial-video-shell">
          <video controls playsinline preload="metadata" src="${esc(item.previewUrl || item.downloadUrl || '')}"></video>
        </div>
        <div class="neptune-editorial-file-meta">
          <span>${esc(item.format || 'NEPTUNE MEDIA')}</span>
          <h3>${esc(cleanName(item.name) || 'Contenu Neptune Media')}</h3>
          <p>${esc(item.orderTitle || item.company || 'Production Neptune Media')}</p>
        </div>
        <div class="neptune-editorial-quick-actions">
          <a href="${esc(item.downloadUrl || '#')}" download>Télécharger la vidéo</a>
          <button type="button" data-copy-post>Copier le post</button>
        </div>
        ${sourceWarning}
        <div class="neptune-editorial-publish-box">
          <div><strong>Publier rapidement</strong><span>Le texte est copié, la vidéo est téléchargée et le réseau s’ouvre.</span></div>
          <div class="neptune-editorial-platforms">
            ${Object.entries(PLATFORM_LABELS).map(([key, label]) => `<button type="button" data-express-platform="${key}">${label}</button>`).join('')}
          </div>
        </div>
      </section>

      <section class="neptune-editorial-compose-column">
        <div class="neptune-editorial-section-head">
          <div><span>3 COMPOSITIONS</span><h3>Choisissez l’angle le plus juste.</h3></div>
          <button type="button" data-regenerate-editorial>Régénérer</button>
        </div>
        <div class="neptune-editorial-proposals" role="radiogroup" aria-label="Choisir une proposition">
          ${proposals.map((proposal, index) => proposalCard(proposal, index)).join('')}
        </div>

        <form id="neptuneEditorialForm" class="neptune-editorial-form">
          <input type="hidden" name="selectedProposalId" value="${esc(state.selectedProposalId)}">
          <label><span>Accroche</span><input name="hook" maxlength="180" value="${esc(final.hook)}" required></label>
          <label><span>Description</span><textarea name="description" maxlength="1800" required>${esc(final.description)}</textarea></label>
          <label><span>Question pour les commentaires</span><input name="cta" maxlength="280" value="${esc(final.cta)}" required></label>
          <label><span>Hashtags</span><input name="hashtags" value="${esc((final.hashtags || []).map((tag) => `#${tag}`).join(' '))}" required></label>
          ${occurrenceFields}
          <div class="neptune-editorial-form-note">Vous pouvez modifier librement les champs. L’enregistrement ne déclenche qu’une seule écriture.</div>
          <div class="neptune-editorial-sticky-actions">
            <button type="button" class="secondary" data-copy-post>Copier</button>
            <a class="secondary" href="${esc(item.downloadUrl || '#')}" download>Télécharger</a>
            <button type="submit" class="primary">Enregistrer la version retenue</button>
          </div>
        </form>
        ${reuseBlock}
      </section>
    </div>`;
}

function proposalCard(proposal, index) {
  const active = proposal.id === state.selectedProposalId;
  return `
    <button type="button" class="neptune-editorial-proposal${active ? ' is-selected' : ''}" data-select-proposal="${esc(proposal.id)}" aria-pressed="${active}">
      <span class="neptune-proposal-number">0${index + 1}</span>
      <span class="neptune-proposal-angle">${esc(proposal.label || proposal.angle || `Proposition ${index + 1}`)}</span>
      <strong>${esc(proposal.hook)}</strong>
      <small>${esc(proposal.description)}</small>
      <em>${esc(proposal.cta)}</em>
    </button>`;
}

function occurrenceEditor(occurrence) {
  return `
    <div class="neptune-editorial-schedule-grid">
      <label><span>Date et heure</span><input name="publishAt" type="datetime-local" value="${esc(toLocalInput(occurrence.publishAt))}" required></label>
      <fieldset><legend>Canaux prévus</legend><div>${networkCheckboxes(occurrence.networks || [])}</div></fieldset>
    </div>`;
}

function reuseEditor(context) {
  const next = context.nextReuseAt || new Date().toISOString();
  return `
    <section class="neptune-editorial-reuse">
      <div><span>NOUVELLE UTILISATION</span><h3>Réutiliser ce contenu avec trois nouveaux angles.</h3><p>Neptune IA change l’accroche, le développement, la question et les hashtags. La vidéo reste identique.</p></div>
      <form id="neptuneEditorialReuseForm">
        <label><span>Nouvelle date</span><input name="publishAt" type="datetime-local" min="${esc(toLocalInput(next))}" value="${esc(toLocalInput(next))}" required></label>
        <fieldset><legend>Canaux</legend><div>${networkCheckboxes(['instagram', 'linkedin'])}</div></fieldset>
        <button type="submit">Créer la nouvelle utilisation</button>
      </form>
    </section>`;
}

function networkCheckboxes(selected = []) {
  return Object.entries(PLATFORM_LABELS).map(([key, label]) => `
    <label><input type="checkbox" name="networks" value="${key}" ${selected.includes(key) ? 'checked' : ''}><span>${label}</span></label>`).join('');
}

function selectedProposal(proposals) {
  return proposals.find((proposal) => proposal.id === state.selectedProposalId) || proposals[0] || {};
}

function finalFields(editorial, selected) {
  const selectedMatchesSaved = editorial.selectedProposalId && editorial.selectedProposalId === state.selectedProposalId;
  return {
    hook: selectedMatchesSaved && editorial.finalHook ? editorial.finalHook : selected.hook || editorial.finalHook || '',
    description: selectedMatchesSaved && editorial.finalDescription ? editorial.finalDescription : selected.description || editorial.finalDescription || '',
    cta: selectedMatchesSaved && editorial.finalCta ? editorial.finalCta : selected.cta || editorial.finalCta || '',
    hashtags: selectedMatchesSaved && editorial.finalHashtags?.length ? editorial.finalHashtags : selected.hashtags || editorial.finalHashtags || [],
  };
}

async function onWorkspaceClick(event) {
  const select = event.target.closest('[data-select-proposal]');
  if (select) {
    state.selectedProposalId = select.dataset.selectProposal;
    renderWorkspace();
    return;
  }
  if (event.target.closest('[data-copy-post]')) {
    await copyCurrentPost();
    return;
  }
  const express = event.target.closest('[data-express-platform]');
  if (express) {
    await publishExpress(express.dataset.expressPlatform, express);
    return;
  }
  if (event.target.closest('[data-regenerate-editorial]')) {
    await regenerateEditorial(event.target.closest('[data-regenerate-editorial]'));
  }
}

async function onWorkspaceSubmit(event) {
  if (event.target.id === 'neptuneEditorialForm') {
    event.preventDefault();
    await saveEditorial(event.target);
  }
  if (event.target.id === 'neptuneEditorialReuseForm') {
    event.preventDefault();
    await createReuse(event.target);
  }
}

async function saveEditorial(form, options = {}) {
  const button = $('button[type=submit]', form);
  const values = new FormData(form);
  const networks = values.getAll('networks');
  if (state.occurrenceId && !networks.length) {
    toast('Choisissez au moins un canal.', true);
    return false;
  }
  const payload = {
    fileId: state.fileId,
    occurrenceId: state.occurrenceId,
    selectedProposalId: values.get('selectedProposalId') || state.selectedProposalId,
    hook: values.get('hook'),
    description: values.get('description'),
    cta: values.get('cta'),
    hashtags: values.get('hashtags'),
    publishAt: values.get('publishAt') ? new Date(values.get('publishAt')).toISOString() : undefined,
    networks,
  };
  if (button) {
    button.disabled = true;
    button.textContent = 'Enregistrement…';
  }
  try {
    const result = await api('/api/client/editorial/select', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.selectedProposalId = result.selectedProposalId;
    if (state.context?.editorial) {
      Object.assign(state.context.editorial, {
        selectedProposalId: result.selectedProposalId,
        finalHook: result.hook,
        finalDescription: result.description,
        finalCta: result.cta,
        finalHashtags: result.hashtags,
        finalPost: result.finalPost,
        generationStatus: 'selected',
      });
    }
    if (state.context?.occurrence && result.occurrenceId) {
      Object.assign(state.context.occurrence, {
        title: result.hook,
        description: [result.description, result.cta].join('\n\n'),
        hashtags: result.hashtags,
        publishAt: result.publishAt,
        networks: result.networks,
        caption: result.finalPost,
      });
    }
    if (!options.silent) toast('Version enregistrée.');
    return true;
  } catch (error) {
    toast(errorText(error), true);
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Enregistrer la version retenue';
    }
  }
}

async function copyCurrentPost() {
  const post = currentPost();
  if (!post) return toast('La publication est incomplète.', true);
  try {
    await copyText(post);
    toast('Publication copiée.');
  } catch {
    toast('Impossible de copier automatiquement.', true);
  }
}

async function publishExpress(platform, button) {
  const form = $('#neptuneEditorialForm');
  if (!form) return;
  button.disabled = true;
  const popup = window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  try {
    const saved = await saveEditorial(form, { silent: true });
    if (!saved) throw new Error('save_failed');
    const post = currentPost();
    await copyText(post);
    triggerDownload(state.context?.item?.downloadUrl, state.context?.item?.name || 'contenu-neptune.mp4');
    if (popup) popup.location.replace(PLATFORM_URLS[platform]);
    else window.open(PLATFORM_URLS[platform], '_blank', 'noopener');
    if (state.occurrenceId) {
      await api('/api/client/editorial/publish', {
        method: 'POST',
        body: JSON.stringify({ occurrenceId: state.occurrenceId, platform }),
      }).catch(() => null);
    }
    toast(`Texte copié, vidéo téléchargée et ${PLATFORM_LABELS[platform]} ouvert.`);
  } catch (error) {
    try { popup?.close(); } catch {}
    toast(errorText(error), true);
  } finally {
    button.disabled = false;
  }
}

async function regenerateEditorial(button) {
  button.disabled = true;
  button.textContent = 'Génération…';
  renderLoading('Neptune IA reconstruit trois nouvelles propositions…');
  try {
    const context = await api('/api/client/editorial/generate', {
      method: 'POST',
      body: JSON.stringify({ fileId: state.fileId, occurrenceId: state.occurrenceId, force: true }),
    });
    state.context = context;
    state.selectedProposalId = context.editorial?.selectedProposalId || context.editorial?.proposals?.[0]?.id || 'proposal_1';
    renderWorkspace();
    toast('Trois nouvelles propositions sont prêtes.');
  } catch (error) {
    renderError(errorText(error));
  }
}

async function createReuse(form) {
  const values = new FormData(form);
  const networks = values.getAll('networks');
  if (!networks.length) return toast('Choisissez au moins un canal.', true);
  const button = $('button[type=submit]', form);
  button.disabled = true;
  button.textContent = 'Création des 3 angles…';
  try {
    const result = await api('/api/client/content-calendar/reuse', {
      method: 'POST',
      body: JSON.stringify({
        fileId: state.fileId,
        publishAt: new Date(values.get('publishAt')).toISOString(),
        networks,
      }),
    });
    const occurrenceId = result.occurrence?.occurrenceId;
    if (!occurrenceId) throw new Error('reuse_creation_failed');
    const context = await api(`/api/client/editorial/context?${new URLSearchParams({ occurrenceId }).toString()}`);
    state.context = context;
    state.occurrenceId = occurrenceId;
    state.mode = 'content';
    state.selectedProposalId = context.editorial?.selectedProposalId || context.editorial?.proposals?.[0]?.id || 'proposal_1';
    renderWorkspace();
    toast('Nouvelle utilisation créée avec trois angles différents.');
  } catch (error) {
    toast(errorText(error), true);
    button.disabled = false;
    button.textContent = 'Créer la nouvelle utilisation';
  }
}

function currentPost() {
  const form = $('#neptuneEditorialForm');
  if (!form) return '';
  const values = new FormData(form);
  const hashtags = normalizeHashtags(values.get('hashtags')).map((tag) => `#${tag}`).join(' ');
  return [values.get('hook'), values.get('description'), ensureQuestion(values.get('cta')), hashtags]
    .map((value) => String(value || '').trim()).filter(Boolean).join('\n\n');
}

function triggerDownload(url, filename) {
  if (!url) return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('copy_failed');
}

function toast(message, error = false) {
  const element = $('#neptuneEditorialToast');
  element.textContent = message;
  element.dataset.error = error ? 'true' : 'false';
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { element.hidden = true; }, 3200);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `http_${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function errorText(error) {
  const code = String(error?.message || error || 'unknown');
  const labels = {
    unauthorized: 'Votre session a expiré. Reconnectez-vous.',
    content_not_found: 'Ce contenu n’est plus disponible.',
    editorial_fields_incomplete: 'Complétez l’accroche, la description, la question et au moins trois hashtags.',
    invalid_editorial_proposals: 'Les propositions générées sont incomplètes. Relancez la génération.',
    reuse_too_soon: 'Ce contenu doit rester espacé d’au moins 30 jours de sa précédente utilisation.',
    save_failed: 'La version n’a pas été enregistrée.',
    reuse_creation_failed: 'La nouvelle utilisation n’a pas été créée.',
  };
  return labels[code] || 'Une erreur technique est survenue. Réessayez.';
}

function normalizeHashtags(value) {
  return [...new Set(String(value || '').split(/[\s,]+/u).map((tag) => tag.trim().replace(/^#+/u, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean))].slice(0, 6);
}

function ensureQuestion(value) {
  const text = String(value || '').trim();
  return /\?$/u.test(text) ? text : `${text.replace(/[.!]+$/u, '')} ?`;
}

function toLocalInput(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function cleanName(value) {
  return String(value || '').replace(/\.[a-z0-9]{2,5}$/iu, '').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
