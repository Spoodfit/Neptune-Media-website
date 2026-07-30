/*
 * Neptune Media — synchronisation Google Drive incrémentale.
 * À installer dans le projet Google Apps Script qui possède l'accès au Drive Neptune.
 *
 * Principe :
 * - le Worker fournit uniquement le plan des dossiers clients ;
 * - Google Drive Changes renvoie seulement les fichiers réellement modifiés ;
 * - les changements sont envoyés au Worker en un lot ;
 * - une réconciliation complète quotidienne sert de filet de sécurité.
 */

const NEPTUNE_DRIVE_DELTA = Object.freeze({
  version: 'neptune-drive-delta-v2',
  defaultWorkerOrigin: 'https://tv.neptunebusiness.com',
  syncHandler: 'synchroniserDriveNeptuneDelta',
  reconcileHandler: 'reconcilierDriveNeptuneComplet',
  changeTokenKey: 'NEPTUNE_DRIVE_CHANGE_TOKEN_V2',
  workerOriginKeys: ['NEPTUNE_WORKER_ORIGIN', 'WORKER_ORIGIN'],
  rootFolderKeys: ['NEPTUNE_DRIVE_ROOT_FOLDER_ID', 'DRIVE_ROOT_FOLDER_ID', 'ROOT_FOLDER_ID'],
  secretKeys: ['NEPTUNE_DRIVE_WEBHOOK_SECRET', 'DRIVE_WEBHOOK_SECRET', 'NEPTUNE_WEBHOOK_SECRET'],
  legacyHandlers: ['synchroniserDriveNeptune', 'synchroniserDriveNeptuneV2', 'synchroniserDriveNeptuneDelta'],
  maxFilesPerBatch: 250,
  maxOrderBatchesPerRequest: 80,
  maxRemovedPerRequest: 250,
});

function configurerSynchronisationDriveNeptune(rootFolderId, webhookSecret, workerOrigin) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('NEPTUNE_DRIVE_ROOT_FOLDER_ID', String(rootFolderId || '').trim());
  properties.setProperty('NEPTUNE_DRIVE_WEBHOOK_SECRET', String(webhookSecret || '').trim());
  properties.setProperty('NEPTUNE_WORKER_ORIGIN', String(workerOrigin || NEPTUNE_DRIVE_DELTA.defaultWorkerOrigin).replace(/\/+$/u, ''));
  installerSynchronisationDriveNeptuneV2();
}

function installerSynchronisationDriveNeptuneV2() {
  verifierConfigurationDriveNeptune_();
  const handlers = new Set([...NEPTUNE_DRIVE_DELTA.legacyHandlers, NEPTUNE_DRIVE_DELTA.reconcileHandler]);
  ScriptApp.getProjectTriggers()
    .filter((trigger) => handlers.has(trigger.getHandlerFunction()))
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  executerSousVerrouDriveNeptune_(function () {
    reconcilierDriveNeptuneComplet_();
  });

  ScriptApp.newTrigger(NEPTUNE_DRIVE_DELTA.syncHandler)
    .timeBased()
    .everyMinutes(10)
    .create();

  ScriptApp.newTrigger(NEPTUNE_DRIVE_DELTA.reconcileHandler)
    .timeBased()
    .atHour(3)
    .nearMinute(17)
    .everyDays(1)
    .create();
}

function synchroniserDriveNeptuneDelta() {
  executerSousVerrouDriveNeptune_(function () {
    const config = verifierConfigurationDriveNeptune_();
    const passages = obtenirPassagesDriveNeptune_(config);
    if (!passages.length) return;

    const properties = PropertiesService.getScriptProperties();
    const savedToken = properties.getProperty(NEPTUNE_DRIVE_DELTA.changeTokenKey);
    if (!savedToken) {
      reconcilierDriveNeptuneComplet_();
      return;
    }

    const journal = listerChangementsDriveNeptune_(savedToken);
    const folderMap = construireCarteDossiersNeptune_(passages);
    const latestByFile = new Map();
    journal.changes.forEach((change) => {
      if (change && change.fileId) latestByFile.set(change.fileId, change);
    });

    const grouped = new Map();
    const removed = new Set();
    latestByFile.forEach((change, fileId) => {
      if (change.removed || change.file?.trashed) {
        removed.add(fileId);
        return;
      }
      const file = change.file || {};
      const destination = destinationDepuisParents_(file.parents, folderMap);
      if (!destination) {
        if (estFichierMediaNeptune_(file.mimeType)) removed.add(fileId);
        return;
      }
      if (!estFichierMediaNeptune_(file.mimeType)) return;
      const item = fichierApiVersPayloadNeptune_(file, destination.category);
      if (!item) return;
      if (!grouped.has(destination.orderId)) grouped.set(destination.orderId, []);
      grouped.get(destination.orderId).push(item);
    });

    const batches = construireLotsNeptune_(grouped);
    if (batches.length || removed.size) {
      envoyerDeltaNeptune_(config, batches, Array.from(removed));
    }
    properties.setProperty(NEPTUNE_DRIVE_DELTA.changeTokenKey, journal.newStartPageToken);
  });
}

function reconcilierDriveNeptuneComplet() {
  executerSousVerrouDriveNeptune_(function () {
    reconcilierDriveNeptuneComplet_();
  });
}

function reconcilierDriveNeptuneComplet_() {
  const config = verifierConfigurationDriveNeptune_();
  const tokenBeforeScan = obtenirStartPageTokenDriveNeptune_();
  const passages = obtenirPassagesDriveNeptune_(config);
  const grouped = new Map();

  passages.forEach((passage) => {
    const files = [];
    scannerDossierNeptune_(passage.longFolderId, 'long', files);
    scannerDossierNeptune_(passage.shortsFolderId, 'short', files);
    grouped.set(passage.orderId, files);
  });

  const batches = construireLotsNeptune_(grouped);
  if (batches.length) envoyerDeltaNeptune_(config, batches, []);
  PropertiesService.getScriptProperties().setProperty(NEPTUNE_DRIVE_DELTA.changeTokenKey, tokenBeforeScan);
}

function obtenirPassagesDriveNeptune_(config) {
  const plan = appelerWorkerDriveNeptune_(config, '/api/webhooks/drive/sync-plan', {});
  const byOrder = new Map();
  (plan.passages || []).forEach((item) => byOrder.set(item.orderId, item));

  (plan.provision || []).forEach((item) => {
    const mapping = provisionnerDossiersNeptune_(config, item);
    const saved = appelerWorkerDriveNeptune_(config, '/api/webhooks/drive/provisioned', mapping);
    byOrder.set(item.orderId, Object.assign({}, item, saved, { driveSyncStatus: 'ready' }));
  });
  return Array.from(byOrder.values()).filter((item) => item.orderId && item.longFolderId && item.shortsFolderId);
}

function provisionnerDossiersNeptune_(config, item) {
  const root = DriveApp.getFolderById(config.rootFolderId);
  const clientLabel = nettoyerNomDossierNeptune_(item.company || item.fullName || item.email || item.clientId || 'Client Neptune');
  const clientFolder = item.clientFolderId
    ? DriveApp.getFolderById(item.clientFolderId)
    : trouverOuCreerDossierNeptune_(root, clientLabel);
  const passageNumber = Math.max(1, Number(item.passageNumber || 1));
  const passageFolder = item.passageFolderId
    ? DriveApp.getFolderById(item.passageFolderId)
    : trouverOuCreerPassageNeptune_(clientFolder, passageNumber, item.title || item.format || 'Passage Neptune Media');
  const longFolder = item.longFolderId
    ? DriveApp.getFolderById(item.longFolderId)
    : trouverOuCreerDossierNeptune_(passageFolder, 'Long format');
  const shortsFolder = item.shortsFolderId
    ? DriveApp.getFolderById(item.shortsFolderId)
    : trouverOuCreerDossierNeptune_(passageFolder, 'Shorts');

  return {
    orderId: item.orderId,
    passageNumber: passageNumber,
    clientFolderId: clientFolder.getId(),
    clientFolderUrl: clientFolder.getUrl(),
    passageFolderId: passageFolder.getId(),
    passageFolderUrl: passageFolder.getUrl(),
    longFolderId: longFolder.getId(),
    shortsFolderId: shortsFolder.getId(),
  };
}

function construireCarteDossiersNeptune_(passages) {
  const map = new Map();
  passages.forEach((item) => {
    if (item.longFolderId) map.set(item.longFolderId, { orderId: item.orderId, category: 'long' });
    if (item.shortsFolderId) map.set(item.shortsFolderId, { orderId: item.orderId, category: 'short' });
  });
  return map;
}

function destinationDepuisParents_(parents, folderMap) {
  for (const parentId of Array.isArray(parents) ? parents : []) {
    const destination = folderMap.get(parentId);
    if (destination) return destination;
  }
  return null;
}

function listerChangementsDriveNeptune_(startPageToken) {
  let pageToken = String(startPageToken || '');
  const changes = [];
  let newStartPageToken = pageToken;
  const fields = 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,size,webViewLink,webContentLink,parents,trashed))';

  while (pageToken) {
    const query = [
      'pageToken=' + encodeURIComponent(pageToken),
      'pageSize=1000',
      'spaces=drive',
      'includeRemoved=true',
      'includeItemsFromAllDrives=true',
      'supportsAllDrives=true',
      'fields=' + encodeURIComponent(fields),
    ].join('&');
    const result = appelerApiDriveNeptune_('/changes?' + query);
    (result.changes || []).forEach((change) => changes.push(change));
    if (result.nextPageToken) pageToken = result.nextPageToken;
    else {
      newStartPageToken = result.newStartPageToken || newStartPageToken;
      pageToken = '';
    }
  }
  return { changes: changes, newStartPageToken: newStartPageToken };
}

function obtenirStartPageTokenDriveNeptune_() {
  const result = appelerApiDriveNeptune_('/changes/startPageToken?supportsAllDrives=true&fields=startPageToken');
  if (!result.startPageToken) throw new Error('drive_start_page_token_missing');
  return result.startPageToken;
}

function appelerApiDriveNeptune_(path) {
  const response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3' + path, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  const data = parseJsonNeptune_(body);
  if (status < 200 || status >= 300) {
    throw new Error('drive_api_http_' + status + ':' + String(data.error?.message || body).slice(0, 300));
  }
  return data;
}

function scannerDossierNeptune_(folderId, category, output) {
  if (!folderId) return;
  const files = DriveApp.getFolderById(folderId).getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!estFichierMediaNeptune_(file.getMimeType())) continue;
    output.push({
      driveFileId: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      modifiedAt: file.getLastUpdated().toISOString(),
      category: category,
      webViewUrl: file.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(file.getId()),
      sizeBytes: Number(file.getSize() || 0),
    });
  }
}

function fichierApiVersPayloadNeptune_(file, category) {
  if (!file.id || !file.name || !file.modifiedTime) return null;
  return {
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType || '',
    modifiedAt: file.modifiedTime,
    category: category,
    webViewUrl: file.webViewLink || ('https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/view'),
    downloadUrl: file.webContentLink || ('https://drive.google.com/uc?export=download&id=' + encodeURIComponent(file.id)),
    sizeBytes: Number(file.size || 0),
  };
}

function construireLotsNeptune_(grouped) {
  const batches = [];
  grouped.forEach((files, orderId) => {
    for (let index = 0; index < files.length; index += NEPTUNE_DRIVE_DELTA.maxFilesPerBatch) {
      batches.push({
        orderId: orderId,
        scannedAt: new Date().toISOString(),
        files: files.slice(index, index + NEPTUNE_DRIVE_DELTA.maxFilesPerBatch),
      });
    }
  });
  return batches;
}

function envoyerDeltaNeptune_(config, batches, removedFileIds) {
  const pendingBatches = batches.slice();
  const pendingRemoved = removedFileIds.slice();
  while (pendingBatches.length || pendingRemoved.length) {
    appelerWorkerDriveNeptune_(config, '/api/webhooks/drive/delta', {
      batches: pendingBatches.splice(0, NEPTUNE_DRIVE_DELTA.maxOrderBatchesPerRequest),
      removedFileIds: pendingRemoved.splice(0, NEPTUNE_DRIVE_DELTA.maxRemovedPerRequest),
      syncVersion: NEPTUNE_DRIVE_DELTA.version,
    });
  }
}

function appelerWorkerDriveNeptune_(config, path, payload) {
  const response = UrlFetchApp.fetch(config.workerOrigin + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Neptune-Drive-Secret': config.webhookSecret },
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  const data = parseJsonNeptune_(body);
  if (status < 200 || status >= 300 || data.ok === false) {
    throw new Error('neptune_worker_http_' + status + ':' + String(data.error || body).slice(0, 300));
  }
  return data;
}

function verifierConfigurationDriveNeptune_() {
  const properties = PropertiesService.getScriptProperties();
  const workerOrigin = premiereProprieteNeptune_(properties, NEPTUNE_DRIVE_DELTA.workerOriginKeys)
    || NEPTUNE_DRIVE_DELTA.defaultWorkerOrigin;
  const rootFolderId = premiereProprieteNeptune_(properties, NEPTUNE_DRIVE_DELTA.rootFolderKeys);
  const webhookSecret = premiereProprieteNeptune_(properties, NEPTUNE_DRIVE_DELTA.secretKeys);
  if (!rootFolderId) throw new Error('NEPTUNE_DRIVE_ROOT_FOLDER_ID manquant dans les propriétés du script.');
  if (!webhookSecret) throw new Error('NEPTUNE_DRIVE_WEBHOOK_SECRET manquant dans les propriétés du script.');
  return {
    workerOrigin: workerOrigin.replace(/\/+$/u, ''),
    rootFolderId: rootFolderId,
    webhookSecret: webhookSecret,
  };
}

function executerSousVerrouDriveNeptune_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    callback();
  } finally {
    lock.releaseLock();
  }
}

function trouverOuCreerDossierNeptune_(parent, name) {
  const iterator = parent.getFoldersByName(name);
  return iterator.hasNext() ? iterator.next() : parent.createFolder(name);
}

function trouverOuCreerPassageNeptune_(parent, passageNumber, title) {
  const prefix = 'Passage ' + String(passageNumber).padStart(2, '0');
  const iterator = parent.getFolders();
  while (iterator.hasNext()) {
    const folder = iterator.next();
    if (folder.getName().indexOf(prefix) === 0) return folder;
  }
  return parent.createFolder(prefix + ' - ' + nettoyerNomDossierNeptune_(title));
}

function nettoyerNomDossierNeptune_(value) {
  return String(value || 'Neptune Media')
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120) || 'Neptune Media';
}

function estFichierMediaNeptune_(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  return value.indexOf('video/') === 0
    || ['application/zip', 'application/octet-stream'].indexOf(value) >= 0;
}

function premiereProprieteNeptune_(properties, keys) {
  for (const key of keys) {
    const value = String(properties.getProperty(key) || '').trim();
    if (value) return value;
  }
  return '';
}

function parseJsonNeptune_(value) {
  try {
    return JSON.parse(String(value || '{}'));
  } catch (error) {
    return {};
  }
}
