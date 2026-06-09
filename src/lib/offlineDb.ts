const DB_NAME = 'forge-offline-v1'
const SETS_STORE = 'pending-sets'
const SESSION_STORE = 'pending-sessions'

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(SETS_STORE)) {
        db.createObjectStore(SETS_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'session_id' })
      }
    }
    req.onsuccess = (e: Event) => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = (e: Event) => reject((e.target as IDBOpenDBRequest).error)
  })
}

function idbPut(store: string, data: Record<string, unknown>): Promise<void> {
  return openDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(data)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  }))
}

function idbGetAll<T>(store: string): Promise<T[]> {
  return openDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = (e: Event) => res((e.target as IDBRequest).result as T[])
    req.onerror = () => rej(req.error)
  }))
}

function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return openDb().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  }))
}

export function saveOfflineSet(set: Record<string, unknown>): Promise<void> {
  return idbPut(SETS_STORE, {
    ...set,
    client_updated_at: new Date().toISOString(),
    key: `${set.session_id}_${set.set_number}_${set.exercise_id}`,
  })
}

export function saveOfflineSession(data: Record<string, unknown>): Promise<void> {
  return idbPut(SESSION_STORE, data)
}

export function getOfflineSets<T = Record<string, unknown>>(): Promise<T[]> {
  return idbGetAll<T>(SETS_STORE)
}

export function getOfflineSessions<T = Record<string, unknown>>(): Promise<T[]> {
  return idbGetAll<T>(SESSION_STORE)
}

export function clearOfflineSet(key: string): Promise<void> {
  return idbDelete(SETS_STORE, key)
}

export function clearOfflineSession(sessionId: string): Promise<void> {
  return idbDelete(SESSION_STORE, sessionId)
}
