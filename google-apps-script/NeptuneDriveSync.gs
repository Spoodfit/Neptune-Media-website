const DRIVE_SYNC_VERSION = 'neptune-drive-sync-v2';
const DRIVE_SYNC_FUNCTION = 'synchroniserDriveNeptune';

function installerSynchronisationDrive() {
  verifierConfigurationDrive();
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === DRIVE_SYNC_FUNCTION)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(DRIVE_SYNC_FUNCTION).timeBased().everyMinutes(5).create();
  synchroniserDriveNeptune();
}

function synchroniserDriveNeptune() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const config = verifierConfigurationDrive();
    const plan = appelNeptuneDrive_(config, '/api/webhooks/drive/sync-plan', {});
    const passages = Array.isArray(plan.passages) ? plan.passages.slice() : [];

    (Array.isArray(plan.provision) ? plan.provision : []).forEach((item) => {
      try {
        const provisioned = provisionnerPassage_(config, item);
        const saved = appelNeptuneDrive_(config, '/api/webhooks/drive/provisioned', provisioned);
        passages.push({ ...item, ...saved, driveSyncStatus: 'ready' });
      } catch (error) {
        console.error('drive_provision_failed', item.orderId, String(error && error.stack || error));
      }
    });

    passages.forEach((passage) => {
      try {
        synchroniserPassage_(config, passage);
      } catch (error) {
        console.error('drive_passage_sync_failed', passage.orderId, String(error && error.stack || error));
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function verifierConfigurationDrive() {
  const properties = PropertiesService.getScriptProperties();
  const config = {
    rootFolderId: String(properties.getProperty('ROOT_FOLDER_ID') || '').trim(),
    apiUrl: String(properties.getProperty('NEPTUNE_API_URL') || 'https://tv.neptunebusiness.com').trim().replace(/\/$/u, ''),
    secret: String(properties.getProperty('DRIVE_WEBHOOK_SECRET') || '').trim(),
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Configuration Drive incomplète : ${missing.join(', ')}`);
  DriveApp.getFolderById(config.rootFolderId).getName();
  return config;
}

function provisionnerPassage_(config, item) {
  const root = DriveApp.getFolderById(config.rootFolderId);
  const clientMarker = `NEPTUNE_CLIENT_ID=${item.clientId}`;
  const passageMarker = `NEPTUNE_ORDER_ID=${item.orderId}`;
  const clientFolder = dossierParIdOuMarqueur_(item.clientFolderId, root, clientMarker)
    || creerDossierMarque_(root, nomDossierClient_(item), clientMarker);
  const passageFolder = dossierParMarqueur_(clientFolder, passageMarker)
    || creerDossierMarque_(clientFolder, nomDossierPassage_(item), `${passageMarker}\nPASSAGE_NUMBER=${item.passageNumber || 1}`);
  const longFolder = dossierParMarqueur_(passageFolder, `${passageMarker}:LONG`)
    || creerDossierMarque_(passageFolder, 'Long format', `${passageMarker}:LONG`);
  const shortsFolder = dossierParMarqueur_(passageFolder, `${passageMarker}:SHORTS`)
    || creerDossierMarque_(passageFolder, 'Shorts', `${passageMarker}:SHORTS`);

  return {
    version: DRIVE_SYNC_VERSION,
    orderId: item.orderId,
    clientId: item.clientId,
    passageNumber: Number(item.passageNumber || 1),
    clientFolderId: clientFolder.getId(),
    clientFolderUrl: clientFolder.getUrl(),
    passageFolderId: passageFolder.getId(),
    passageFolderUrl: passageFolder.getUrl(),
    longFolderId: longFolder.getId(),
    shortsFolderId: shortsFolder.getId(),
  };
}

function synchroniserPassage_(config, passage) {
  if (!passage.orderId || !passage.longFolderId || !passage.shortsFolderId) return;
  const files = [];
  collecterFichiers_(DriveApp.getFolderById(passage.longFolderId), 'long', passage.email, files);
  collecterFichiers_(DriveApp.getFolderById(passage.shortsFolderId), 'short', passage.email, files);
  appelNeptuneDrive_(config, '/api/webhooks/drive/files', {
    version: DRIVE_SYNC_VERSION,
    orderId: passage.orderId,
    scannedAt: new Date().toISOString(),
    files,
  });
}

function collecterFichiers_(folder, category, clientEmail, output) {
  const iterator = folder.getFiles();
  while (iterator.hasNext()) {
    const file = iterator.next();
    const mimeType = String(file.getMimeType() || '').toLowerCase();
    if (!mimeType.startsWith('video/') && !['application/zip', 'application/octet-stream'].includes(mimeType)) continue;
    partagerLectureSansNotification_(file.getId(), clientEmail);
    output.push({
      driveFileId: file.getId(),
      name: file.getName(),
      category,
      mimeType,
      sizeBytes: Number(file.getSize() || 0),
      modifiedAt: file.getLastUpdated().toISOString(),
      webViewUrl: file.getUrl(),
      downloadUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.getId())}`,
    });
  }
}

function partagerLectureSansNotification_(fileId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (normalized) {
    creerPermissionDrive_(fileId, {
      type: 'user',
      role: 'reader',
      emailAddress: normalized,
    });
  }
  creerPermissionDrive_(fileId, {
    type: 'anyone',
    role: 'reader',
    allowFileDiscovery: false,
  });
}

function creerPermissionDrive_(fileId, permission) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    payload: JSON.stringify(permission),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if ([200, 201, 409].includes(status)) return;
  const body = response.getContentText();
  if (status === 400 && /already|existing|permission/u.test(body)) return;
  console.warn('drive_permission_warning', fileId, permission.type, permission.emailAddress || 'link-only', status, body.slice(0, 300));
}

function appelNeptuneDrive_(config, path, payload) {
  const response = UrlFetchApp.fetch(`${config.apiUrl}${path}`, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Neptune-Drive-Secret': config.secret },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  let result = {};
  try { result = JSON.parse(text || '{}'); } catch (error) { result = { raw: text }; }
  if (status < 200 || status >= 300) throw new Error(`Neptune HTTP ${status}: ${result.error || text.slice(0, 300)}`);
  return result;
}

function dossierParIdOuMarqueur_(folderId, parent, marker) {
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (error) { console.warn('drive_folder_id_invalid', folderId); }
  }
  return dossierParMarqueur_(parent, marker);
}

function dossierParMarqueur_(parent, marker) {
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (String(folder.getDescription() || '').includes(marker)) return folder;
  }
  return null;
}

function creerDossierMarque_(parent, name, marker) {
  const folder = parent.createFolder(nettoyerNom_(name));
  folder.setDescription(`${marker}\nCREATED_BY=${DRIVE_SYNC_VERSION}`);
  return folder;
}

function nomDossierClient_(item) {
  const identity = item.fullName || item.email || 'Client Neptune Media';
  return item.company ? `${identity} — ${item.company}` : identity;
}

function nomDossierPassage_(item) {
  const number = String(Math.max(1, Number(item.passageNumber || 1))).padStart(2, '0');
  const format = item.format || item.title || 'Neptune Media';
  const date = new Date(item.createdAt || Date.now());
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  return `Passage ${number} — ${format} — ${year}`;
}

function nettoyerNom_(value) {
  return String(value || 'Dossier Neptune Media')
    .replace(/[\\/:*?"<>|]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 180) || 'Dossier Neptune Media';
}