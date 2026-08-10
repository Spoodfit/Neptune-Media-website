const token = new URL(location.href).searchParams.get('token') || '';
const form = document.querySelector('#availabilityForm');
const message = document.querySelector('#message');
const context = document.querySelector('#context');
const submit = form?.querySelector('button[type="submit"]');

boot();

async function boot() {
  setMinimumSlots();
  if (!token) return fail('Ce lien est incomplet. Demandez un nouveau lien à Neptune Media.');
  try {
    const response = await fetch(`/api/public/client-action-v86/context?token=${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    if (data.alreadySubmitted) return done();
    if (data.action !== 'filming_preferences') throw new Error('invalid_action');
    const name = firstName(data.client?.fullName);
    if (name) document.querySelector('#lead').textContent = `${name}, choisissez jusqu’à trois créneaux qui vous conviennent. Neptune vérifie ensuite la disponibilité du studio et vous confirme la date définitive.`;
    const chips = [data.order?.format, data.client?.company].filter(Boolean);
    if (chips.length) {
      context.innerHTML = chips.map((value) => `<span>${e(value)}</span>`).join('');
      context.hidden = false;
    }
  } catch (error) { fail(errorLabel(error.message)); }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const values = [...form.querySelectorAll('input[name="slot"]')].map((input) => input.value).filter(Boolean);
  const preferences = values.map((value) => new Date(value).toISOString());
  submit.disabled = true;
  setMessage('Enregistrement de vos disponibilités…');
  try {
    const response = await fetch('/api/public/client-action-v86/submit', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, preferences }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `http_${response.status}`);
    done();
  } catch (error) {
    setMessage(errorLabel(error.message), 'error');
    submit.disabled = false;
  }
});

function setMinimumSlots() {
  const minimum = new Date(Date.now() + 60 * 60 * 1000);
  minimum.setMinutes(Math.ceil(minimum.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(minimum.getTime() - minimum.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.querySelectorAll('input[name="slot"]').forEach((input) => { input.min = local; input.step = '900'; });
}
function done() { document.querySelector('#choiceCard')?.classList.add('hidden'); document.querySelector('#doneCard')?.classList.remove('hidden'); }
function fail(text) { form?.classList.add('hidden'); setMessage(text, 'error'); }
function setMessage(text, type = '') { if (!message) return; message.textContent = text; message.dataset.type = type; }
function firstName(value) { return String(value || '').trim().split(/\s+/u)[0] || ''; }
function errorLabel(code) { return ({ token_expired: 'Ce lien a expiré. Demandez un nouveau lien à Neptune Media.', invalid_token: 'Ce lien est invalide.', invalid_action: 'Ce lien ne correspond plus à une demande active.', preferences_required: 'Choisissez au moins un créneau dans le futur.' })[code] || 'Impossible d’enregistrer vos choix. Réessayez ou contactez Neptune Media.'; }
function e(value) { return String(value || '').replace(/[&<>"']/gu, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]); }
