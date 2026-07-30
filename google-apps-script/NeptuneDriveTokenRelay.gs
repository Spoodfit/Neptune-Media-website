const DRIVE_TOKEN_RELAY_VERSION = 'neptune-drive-token-relay-v1';
const DRIVE_TOKEN_RELAY_FUNCTION = 'publierJetonDriveNeptune';

/**
 * À exécuter une seule fois après avoir ajouté ce fichier au projet Apps Script.
 * Le relais renouvelle ensuite automatiquement l'accès privé Drive toutes les 30 minutes.
 */
function installerRelaisJetonDriveNeptune() {
  verifierConfigurationRelaisDriveNeptune_();
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === DRIVE_TOKEN_RELAY_FUNCTION)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(DRIVE_TOKEN_RELAY_FUNCTION).timeBased().everyMinutes(30).create();
  publierJetonDriveNeptune();
}

/**
 * Publie un jeton OAuth Drive de courte durée au Worker Neptune.
 * Le jeton n'est jamais envoyé au navigateur et expire automatiquement côté Cloudflare.
 */
function publierJetonDriveNeptune() {
  const config = verifierConfigurationRelaisDriveNeptune_();
  const accessToken = ScriptApp.getOAuthToken();
  if (!accessToken) throw new Error('Jeton OAuth Drive indisponible. Autorisez à nouveau le projet Apps Script.');

  const response = UrlFetchApp.fetch(`${config.apiUrl}/api/webhooks/drive/access-token`, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Neptune-Drive-Secret': config.secret,
      'User-Agent': `${DRIVE_TOKEN_RELAY_VERSION}/Apps-Script`,
    },
    payload: JSON.stringify({
      version: DRIVE_TOKEN_RELAY_VERSION,
      accessToken,
      expiresAt: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`Relais Drive Neptune HTTP ${status}: ${body.slice(0, 500)}`);
  }
  const result = JSON.parse(body || '{}');
  if (!result.ok) throw new Error(`Relais Drive Neptune refusé: ${body.slice(0, 500)}`);
  console.log('drive_token_relay_ok', result.expiresAt || 'expiration inconnue');
  return result;
}

function verifierConfigurationRelaisDriveNeptune_() {
  const properties = PropertiesService.getScriptProperties();
  const config = {
    apiUrl: String(properties.getProperty('NEPTUNE_API_URL') || 'https://tv.neptunebusiness.com').trim().replace(/\/$/u, ''),
    secret: String(properties.getProperty('DRIVE_WEBHOOK_SECRET') || '').trim(),
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Configuration relais Drive incomplète : ${missing.join(', ')}`);
  return config;
}
