const DATABASE = 'neptune-video-local-engine-v1';
const VERSION = 1;
const STORE = 'clips';

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('jobId', 'jobId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error || new Error('indexeddb_unavailable')));
  });
  return databasePromise;
}

function transaction(mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      reject(error);
      return;
    }
    tx.addEventListener('complete', () => resolve(result?.result));
    tx.addEventListener('abort', () => reject(tx.error || new Error('indexeddb_transaction_aborted')));
    tx.addEventListener('error', () => reject(tx.error || new Error('indexeddb_transaction_failed')));
  }));
}

export function clipStorageKey(jobId, clipId) {
  return `${String(jobId)}:${String(clipId)}`;
}

export async function saveClip(jobId, clip, blob) {
  const key = clipStorageKey(jobId, clip.id);
  await transaction('readwrite', (store) => store.put({
    key,
    jobId: String(jobId),
    clipId: String(clip.id),
    title: String(clip.title || ''),
    mimeType: blob.type || 'video/mp4',
    sizeBytes: blob.size,
    blob,
    updatedAt: new Date().toISOString(),
  }));
  return { key, sizeBytes: blob.size, mimeType: blob.type || 'video/mp4' };
}

export async function readClip(jobId, clipId) {
  const key = clipStorageKey(jobId, clipId);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.addEventListener('success', () => resolve(request.result || null));
    request.addEventListener('error', () => reject(request.error || new Error('local_clip_read_failed')));
  });
}

export async function listJobClips(jobId) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).index('jobId').getAll(String(jobId));
    request.addEventListener('success', () => resolve(request.result || []));
    request.addEventListener('error', () => reject(request.error || new Error('local_clip_list_failed')));
  });
}

export async function deleteJobClips(jobId) {
  const records = await listJobClips(jobId);
  if (!records.length) return 0;
  await transaction('readwrite', (store) => {
    for (const record of records) store.delete(record.key);
  });
  return records.length;
}

export async function storageEstimate() {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  return {
    usage: Number(estimate?.usage || 0),
    quota: Number(estimate?.quota || 0),
  };
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist().catch(() => false);
}
