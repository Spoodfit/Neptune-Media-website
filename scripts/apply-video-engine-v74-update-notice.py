from pathlib import Path

BRIDGE = Path('neptune-tv-media-cloudflare/public/studio/video-ai-engine-v73.js')
text = BRIDGE.read_text(encoding='utf-8')

anchor = "const JOBS_KEY = 'neptune_video_engine_jobs_v1';\n"
replacement = "const JOBS_KEY = 'neptune_video_engine_jobs_v1';\nconst REQUIRED_ENGINE_VERSION = 'neptune-video-engine-20260803-v74';\n"
if anchor not in text:
    raise SystemExit('version constant anchor not found')
text = text.replace(anchor, replacement, 1)

old = """    status.dataset.state = 'connected';
    status.textContent = 'Moteur Neptune connecté';
    detail.textContent = health.openAiConfigured
      ? 'Production autonome active · Whisper, OpenAI, FFmpeg et reprise automatique.'
      : 'Production autonome active · Whisper, FFmpeg et sélection locale/Ollama.';
    if (connect) connect.textContent = 'Reconnecter';
    document.documentElement.dataset.neptuneEngine = 'connected';
"""
new = """    const install = $('#engineInstallButton');
    const currentVersion = String(health.version || 'version inconnue');
    const updateRequired = currentVersion !== REQUIRED_ENGINE_VERSION;
    globalThis.NeptuneVideoEngineHealth = health;
    document.documentElement.dataset.neptuneEngine = 'connected';
    document.documentElement.dataset.neptuneEngineVersion = updateRequired ? 'outdated' : 'current';
    if (updateRequired) {
      status.dataset.state = 'warning';
      status.textContent = 'Mise à jour du moteur requise';
      detail.textContent = `Version actuelle : ${currentVersion}. Installez la v74 pour activer le recadrage de l’intervenant, les jump-cuts, les sous-titres verticaux sécurisés et la sélection multipasse.`;
      if (install) install.textContent = 'Mettre à jour le moteur';
    } else {
      status.dataset.state = 'connected';
      status.textContent = 'Moteur Neptune v74 connecté';
      detail.textContent = health.openAiConfigured
        ? 'Montage intelligent actif · intervenant suivi, silences resserrés, sous-titres verticaux et sélection OpenAI multipasse.'
        : 'Montage intelligent actif · intervenant suivi, silences resserrés, sous-titres verticaux et sélection locale/Ollama.';
      if (install) install.textContent = 'Réinstaller / mettre à jour';
    }
    if (connect) connect.textContent = 'Reconnecter';
"""
if old not in text:
    raise SystemExit('connected-state anchor not found')
text = text.replace(old, new, 1)

BRIDGE.write_text(text, encoding='utf-8')
print('Applied Studio v74 engine update notice.')
