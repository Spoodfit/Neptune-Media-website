from pathlib import Path

ENTRY = Path('neptune-tv-media-cloudflare/src/entry-v16.js')
BRIDGE = Path('neptune-tv-media-cloudflare/public/studio/video-ai-engine-v73.js')

entry = ENTRY.read_text(encoding='utf-8')
old = """  if (isLocalEngineAsset(pathname)) {\n    headers.set('Cross-Origin-Opener-Policy', 'same-origin');\n"""
new = """  if (isLocalEngineAsset(pathname)) {\n    headers.set('Content-Security-Policy', allowLoopbackEngine(headers.get('Content-Security-Policy') || ''));\n    headers.set('Cross-Origin-Opener-Policy', 'same-origin');\n"""
if old not in entry:
    raise SystemExit('entry withHeaders anchor not found')
entry = entry.replace(old, new, 1)

anchor = """function isLocalEngineAsset(pathname) {\n"""
helper = """function allowLoopbackEngine(csp) {\n  const directives = String(csp || '')\n    .split(';')\n    .map((directive) => directive.trim())\n    .filter(Boolean)\n    .filter((directive) => !/^upgrade-insecure-requests$/iu.test(directive));\n  const loopbackSources = ['http://127.0.0.1:4318', 'http://localhost:4318', 'http://[::1]:4318'];\n  const connectIndex = directives.findIndex((directive) => /^connect-src(?:\\s|$)/iu.test(directive));\n  if (connectIndex >= 0) {\n    const current = directives[connectIndex].split(/\\s+/u);\n    for (const source of loopbackSources) if (!current.includes(source)) current.push(source);\n    directives[connectIndex] = current.join(' ');\n  } else {\n    directives.push(`connect-src 'self' ${loopbackSources.join(' ')}`);\n  }\n  return directives.join('; ');\n}\n\n"""
if anchor not in entry:
    raise SystemExit('entry helper anchor not found')
entry = entry.replace(anchor, helper + anchor, 1)
ENTRY.write_text(entry, encoding='utf-8')

bridge = BRIDGE.read_text(encoding='utf-8')
old_configure = """  configure({ endpoint, token }) {\n    if (endpoint) localStorage.setItem(ENDPOINT_KEY, String(endpoint).replace(/\\/$/u, ''));\n    if (token) localStorage.setItem(TOKEN_KEY, String(token).trim());\n  },\n"""
new_configure = """  configure({ endpoint, token }) {\n    if (endpoint) localStorage.setItem(ENDPOINT_KEY, String(endpoint).trim().replace(/\\/$/u, ''));\n    const normalizedToken = String(token || '').trim();\n    if (normalizedToken) localStorage.setItem(TOKEN_KEY, normalizedToken);\n    else localStorage.removeItem(TOKEN_KEY);\n  },\n"""
if old_configure not in bridge:
    raise SystemExit('bridge configure anchor not found')
bridge = bridge.replace(old_configure, new_configure, 1)

old_refresh_catch = """  } catch (error) {\n    status.dataset.state = 'offline';\n    status.textContent = 'Moteur permanent non connecté';\n    detail.textContent = error?.message === 'local_network_permission_denied'\n      ? 'Chrome ou Edge bloque l’accès local. Autorisez « Réseau local » dans les permissions du site puis reconnectez.'\n      : 'Le Studio utilisera le moteur navigateur de secours. Installez ou reconnectez le moteur pour fermer l’onglet après l’import.';\n    document.documentElement.dataset.neptuneEngine = 'offline';\n  }\n}\n"""
new_refresh_catch = """  } catch (error) {\n    const message = String(error?.message || error || 'engine_connection_failed');\n    status.dataset.state = 'offline';\n    status.textContent = 'Connexion au moteur impossible';\n    if (message === 'local_network_permission_denied') {\n      detail.textContent = 'Chrome ou Edge bloque l’accès au réseau local. Autorisez « Réseau local » pour ce site, puis cliquez à nouveau sur Connecter.';\n    } else if (message === 'engine_health_401') {\n      detail.textContent = 'Le code de connexion est incorrect. Recopiez entièrement le contenu du fichier pairing.txt.';\n    } else if (message === 'engine_health_403') {\n      detail.textContent = 'Le moteur refuse cette origine. Relancez l’installateur Neptune pour actualiser sa configuration.';\n    } else if (message.includes('Timeout') || message.includes('timeout')) {\n      detail.textContent = 'Le moteur ne répond pas. Vérifiez que Docker Desktop est ouvert et que Neptune Video Engine est démarré.';\n    } else if (message.includes('Failed to fetch') || message.includes('NetworkError') || message === 'engine_connection_failed') {\n      detail.textContent = 'Le navigateur n’atteint pas le moteur local. Vérifiez Docker Desktop et autorisez l’accès « Réseau local » dans les permissions du site.';\n    } else {\n      detail.textContent = `Connexion refusée : ${message}. Vérifiez Docker Desktop, l’adresse et le code de connexion.`;\n    }\n    document.documentElement.dataset.neptuneEngine = 'offline';\n    console.warn('neptune_engine_connection_failed', { message, endpoint: bridge.endpoint() });\n  }\n}\n"""
if old_refresh_catch not in bridge:
    raise SystemExit('bridge refresh catch anchor not found')
bridge = bridge.replace(old_refresh_catch, new_refresh_catch, 1)

old_button = """  button?.addEventListener('click', async () => {\n    bridge.configure({ endpoint: endpoint?.value || DEFAULT_ENDPOINT, token: token?.value || '' });\n    await refreshConnection();\n  });\n"""
new_button = """  button?.addEventListener('click', async () => {\n    const previousLabel = button.textContent || 'Connecter';\n    button.disabled = true;\n    button.textContent = 'Connexion…';\n    bridge.configure({ endpoint: endpoint?.value || DEFAULT_ENDPOINT, token: token?.value || '' });\n    try {\n      await refreshConnection();\n    } finally {\n      button.disabled = false;\n      button.textContent = document.documentElement.dataset.neptuneEngine === 'connected' ? 'Reconnecter' : previousLabel;\n    }\n  });\n"""
if old_button not in bridge:
    raise SystemExit('bridge button anchor not found')
bridge = bridge.replace(old_button, new_button, 1)

BRIDGE.write_text(bridge, encoding='utf-8')

print('Applied Neptune local engine loopback/CSP connection fix.')
