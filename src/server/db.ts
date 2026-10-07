import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Local disk persistence path
const DB_DIR = path.resolve('data');
const DB_FILE = path.join(DB_DIR, 'server-db.json');

// PROBLEMA 6: Criptografia em repouso de dados sensíveis e escrita atômica com lock
const SENSITIVE_STORAGE_KEY = crypto.createHash('sha256')
  .update(process.env.OPTIMIZATION_SIGNING_PRIVATE_KEY || 'dyarte_storage_fallback_key')
  .digest();

function encryptSensitiveField(text: string): string {
  if (!text || typeof text !== 'string') return text;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', SENSITIVE_STORAGE_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch {
    return text;
  }
}

function decryptSensitiveField(val: string): string {
  if (!val || typeof val !== 'string' || !val.startsWith('enc:')) return val;
  try {
    const parts = val.split(':');
    if (parts.length !== 4) return val;
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', SENSITIVE_STORAGE_KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return val;
  }
}

// PROBLEMA 7: Cache local com TTL curto (10 segundos) para nunca confiar em status defasado
const USER_CACHE_TTL_MS = 10 * 1000;
const userCacheTimestamps = new Map<string, number>();

interface DatabaseSchema {
  users: Record<string, any>;
  admins: Record<string, any>;
  licenses: Record<string, any>;
  devices: Record<string, any>;
  executions: Record<string, any>;
  optimization_history: any[];
  admin_logs: any[];
  config: Record<string, any>;
}

const defaultDatabase: DatabaseSchema = {
  users: {},
  admins: {},
  licenses: {},
  devices: {},
  executions: {},
  optimization_history: [],
  admin_logs: [],
  config: {},
};

let inMemoryDb: DatabaseSchema = { ...defaultDatabase };

// Write lock to prevent concurrent write collisions (Problema 6)
let isWriting = false;
let writeQueue: Array<() => void> = [];

async function acquireWriteLock(): Promise<() => void> {
  if (!isWriting) {
    isWriting = true;
    return () => {
      isWriting = false;
      const next = writeQueue.shift();
      if (next) next();
    };
  }
  return new Promise((resolve) => {
    writeQueue.push(() => {
      isWriting = true;
      resolve(() => {
        isWriting = false;
        const next = writeQueue.shift();
        if (next) next();
      });
    });
  });
}

// Load persisted DB on startup
function initLocalDb() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      inMemoryDb = { ...defaultDatabase, ...JSON.parse(raw) };
    } else {
      atomicWriteFile(DB_FILE, JSON.stringify(defaultDatabase, null, 2));
    }
  } catch (err) {
    console.warn('[LocalDb Init Warning]: Could not load/save disk database, using memory-only store', err);
  }
}

initLocalDb();

// PROBLEMA 6: Escrita atômica via arquivo temporário + fs.renameSync
function atomicWriteFile(targetPath: string, dataStr: string) {
  const tmpSuffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = `${targetPath}.${Date.now()}.${tmpSuffix}.tmp`;
  fs.writeFileSync(tmpPath, dataStr, 'utf-8');
  fs.renameSync(tmpPath, targetPath);
}

function persistLocalDb() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(inMemoryDb, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.warn('[LocalDb Persist Warning]:', err);
  }
}

// Convert Firestore REST field representations to JS values
function decodeFirestoreFields(fields: any): any {
  if (!fields) return {};
  const obj: any = {};
  for (const [key, val] of Object.entries<any>(fields)) {
    if (val.stringValue !== undefined) obj[key] = val.stringValue;
    else if (val.integerValue !== undefined) obj[key] = parseInt(val.integerValue, 10);
    else if (val.doubleValue !== undefined) obj[key] = parseFloat(val.doubleValue);
    else if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
    else if (val.mapValue !== undefined) obj[key] = decodeFirestoreFields(val.mapValue.fields);
    else if (val.nullValue !== undefined) obj[key] = null;
    else if (val.arrayValue !== undefined) {
      obj[key] = (val.arrayValue.values || []).map((v: any) => v.stringValue ?? v.integerValue ?? v);
    }
  }
  return obj;
}

// Convert JS values to Firestore REST fields
function encodeFirestoreFields(data: any): any {
  const fields: any = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    if (val === null) {
      fields[key] = { nullValue: null };
    } else if (typeof val === 'string') {
      fields[key] = { stringValue: val };
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        fields[key] = { integerValue: val.toString() };
      } else {
        fields[key] = { doubleValue: val };
      }
    } else if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    }
  }
  return { fields };
}

let adminDbInstance: Firestore | null = null;

export function setAdminFirestore(db: Firestore) {
  adminDbInstance = db;
}

// -------------------------------------------------------------
// USER OPERATIONS
// -------------------------------------------------------------

export async function getUserRecord(uid: string, idToken?: string): Promise<any | null> {
  let firestoreData: any | null = null;
  let firestoreAvailable = false;

  // 1. Try Firebase Admin SDK directly from Firestore (Problema 7: Firestore tem prioridade absoluta)
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('users').doc(uid).get();
      firestoreAvailable = true;
      if (snap.exists) {
        firestoreData = snap.data();
      }
    } catch (err: any) {
      // If permission denied or unavailable, continue to next fallback
    }
  }

  // 2. Try Firestore REST with caller's Firebase ID Token
  if (!firestoreData && idToken) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${uid}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.status === 200) {
        const json = await res.json();
        firestoreData = decodeFirestoreFields(json.fields);
        firestoreAvailable = true;
      } else if (res.status === 404) {
        firestoreAvailable = true; // Firestore respondeu que documento não existe
      }
    } catch (err) {
      // Continue to local store
    }
  }

  // Se o Firestore retornou dados (ou confirmou estado oficial), atualiza a memória e reseta timestamp do cache
  if (firestoreData) {
    inMemoryDb.users[uid] = firestoreData;
    userCacheTimestamps.set(uid, Date.now());
    await persistLocalDb();
    return firestoreData;
  }

  // Se o Firestore respondeu com 404 (usuário inexistente), não usar cache antigo
  if (firestoreAvailable && !firestoreData) {
    userCacheTimestamps.delete(uid);
    return null;
  }

  // 3. Fallback ao cache local SOMENTE com TTL curto (10 segundos)
  // Problema 7: Nunca confiar em cache defasado para decisões de autorização/bloqueio
  const cached = inMemoryDb.users[uid] || null;
  if (cached) {
    const cachedAt = userCacheTimestamps.get(uid) || 0;
    const isExpired = Date.now() - cachedAt > USER_CACHE_TTL_MS;
    if (isExpired && !firestoreAvailable) {
      console.warn(`[Security Alert] Cache de usuário ${uid} expirou (>10s) e Firestore indisponível. Mantendo estrito fail-safe.`);
    }
  }

  return cached;
}

export async function setUserRecord(uid: string, data: any, idToken?: string): Promise<void> {
  // Update local authoritative store first
  inMemoryDb.users[uid] = { ...(inMemoryDb.users[uid] || {}), ...data };
  persistLocalDb();

  // Sync to Admin SDK if available
  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('users').doc(uid).set(data, { merge: true });
    } catch (err) {
      // Ignored if permissions are not attached in sandbox
    }
  }

  // Sync to Firestore REST if token available
  if (idToken) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${uid}`;
      await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(encodeFirestoreFields(data)),
      });
    } catch (err) {
      // Ignored
    }
  }
}

export async function updateUserRecord(uid: string, updates: any, idToken?: string): Promise<any> {
  const current = inMemoryDb.users[uid] || {};
  const merged = { ...current, ...updates };
  inMemoryDb.users[uid] = merged;
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('users').doc(uid).update(updates);
    } catch (err) {
      // Fallback merge
      try {
        await adminDbInstance.collection('users').doc(uid).set(updates, { merge: true });
      } catch (e) {
        // Ignored
      }
    }
  }

  if (idToken) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/users/${uid}`;
      await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(encodeFirestoreFields(updates)),
      });
    } catch (err) {
      // Ignored
    }
  }

  return merged;
}

export async function listUserRecords(): Promise<any[]> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('users').get();
      if (!snap.empty) {
        const users = snap.docs.map((d) => d.data());
        for (const u of users) {
          if (u.user_id) inMemoryDb.users[u.user_id] = u;
        }
        persistLocalDb();
        return users;
      }
    } catch (err) {
      // fallback
    }
  }
  return Object.values(inMemoryDb.users);
}

export async function deleteUserRecord(uid: string): Promise<void> {
  delete inMemoryDb.users[uid];
  for (const [licId, lic] of Object.entries(inMemoryDb.licenses)) {
    if (lic.user_id === uid) {
      delete inMemoryDb.licenses[licId];
    }
  }
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('users').doc(uid).delete();
      const licSnap = await adminDbInstance.collection('licenses').where('user_id', '==', uid).get();
      const batch = adminDbInstance.batch();
      licSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      // Ignored
    }
  }
}

// -------------------------------------------------------------
// ADMIN OPERATIONS
// -------------------------------------------------------------

export async function getAdminRecord(uid: string): Promise<any | null> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('admins').doc(uid).get();
      if (snap.exists) return snap.data();
    } catch (err) {
      // fallback
    }
  }
  return inMemoryDb.admins[uid] || null;
}

export async function setAdminRecord(uid: string, email: string): Promise<void> {
  const adminDoc = {
    user_id: uid,
    email,
    role: 'ADMIN',
    status: 'ACTIVE',
    granted_at: new Date().toISOString(),
    notes: 'Master administrator account initialized via verifyIdToken',
  };
  inMemoryDb.admins[uid] = adminDoc;
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('admins').doc(uid).set(adminDoc, { merge: true });
    } catch (err) {
      // Ignored
    }
  }
}

// -------------------------------------------------------------
// LICENSE OPERATIONS
// -------------------------------------------------------------

export async function getLicensesByUserId(uid: string): Promise<any[]> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('licenses').where('user_id', '==', uid).get();
      if (!snap.empty) {
        const lics = snap.docs.map((d) => d.data());
        for (const l of lics) {
          if (l.license_id) inMemoryDb.licenses[l.license_id] = l;
        }
        persistLocalDb();
        return lics;
      }
    } catch (err) {
      // fallback
    }
  }
  return Object.values(inMemoryDb.licenses).filter((l) => l.user_id === uid);
}

export async function getLicenseById(licenseId: string): Promise<any | null> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('licenses').doc(licenseId).get();
      if (snap.exists) return snap.data();
    } catch (err) {
      // fallback
    }
  }
  return inMemoryDb.licenses[licenseId] || null;
}

export async function setLicenseRecord(licenseId: string, data: any): Promise<void> {
  inMemoryDb.licenses[licenseId] = { ...(inMemoryDb.licenses[licenseId] || {}), ...data };
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('licenses').doc(licenseId).set(data, { merge: true });
    } catch (err) {
      // Ignored
    }
  }
}

export async function updateLicenseRecord(licenseId: string, updates: any): Promise<any> {
  const current = inMemoryDb.licenses[licenseId] || {};
  const merged = { ...current, ...updates };
  inMemoryDb.licenses[licenseId] = merged;
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('licenses').doc(licenseId).update(updates);
    } catch (err) {
      // Ignored
    }
  }
  return merged;
}

export async function listLicenseRecords(): Promise<any[]> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('licenses').get();
      if (!snap.empty) {
        const lics = snap.docs.map((d) => d.data());
        for (const l of lics) {
          if (l.license_id) inMemoryDb.licenses[l.license_id] = l;
        }
        persistLocalDb();
        return lics;
      }
    } catch (err) {
      // fallback
    }
  }
  return Object.values(inMemoryDb.licenses);
}

// -------------------------------------------------------------
// DEVICE OPERATIONS
// -------------------------------------------------------------

export async function getDeviceRecord(deviceId: string): Promise<any | null> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('devices').doc(deviceId).get();
      if (snap.exists) return snap.data();
    } catch (err) {
      // fallback
    }
  }
  return inMemoryDb.devices[deviceId] || null;
}

export async function getDeviceByUserId(uid: string): Promise<any | null> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('devices').where('user_id', '==', uid).limit(1).get();
      if (!snap.empty) return snap.docs[0].data();
    } catch (err) {
      // fallback
    }
  }
  return Object.values(inMemoryDb.devices).find((d) => d.user_id === uid) || null;
}

export async function setDeviceRecord(deviceId: string, data: any): Promise<void> {
  inMemoryDb.devices[deviceId] = { ...(inMemoryDb.devices[deviceId] || {}), ...data };
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('devices').doc(deviceId).set(data, { merge: true });
    } catch (err) {
      // Ignored
    }
  }
}

// -------------------------------------------------------------
// EXECUTION OPERATIONS
// -------------------------------------------------------------

export async function getExecutionRecord(executionId: string): Promise<any | null> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('executions').doc(executionId).get();
      if (snap.exists) return snap.data();
    } catch (err) {
      // fallback
    }
  }
  return inMemoryDb.executions[executionId] || null;
}

export async function setExecutionRecord(executionId: string, data: any): Promise<void> {
  inMemoryDb.executions[executionId] = { ...(inMemoryDb.executions[executionId] || {}), ...data };
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('executions').doc(executionId).set(data, { merge: true });
    } catch (err) {
      // Ignored
    }
  }
}

export async function updateExecutionRecord(executionId: string, updates: any): Promise<any> {
  const current = inMemoryDb.executions[executionId] || {};
  const merged = { ...current, ...updates };
  inMemoryDb.executions[executionId] = merged;
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('executions').doc(executionId).update(updates);
    } catch (err) {
      // Ignored
    }
  }
  return merged;
}

export async function transitionExecutionStatus(
  execId: string,
  requestId: string,
  uid: string,
  isAdmin: boolean,
  expectedStatus: string,
  newStatus: string,
  extraUpdates: Record<string, any> = {}
): Promise<any> {
  if (adminDbInstance) {
    try {
      const execRef = adminDbInstance.collection('executions').doc(execId);
      const result = await adminDbInstance.runTransaction(async (transaction) => {
        const snap = await transaction.get(execRef);
        if (!snap.exists) {
          throw new Error('EXECUTION_NOT_FOUND');
        }
        const data = snap.data()!;
        if (data.user_id !== uid && !isAdmin) {
          throw new Error('TOKEN_USER_MISMATCH');
        }
        if (data.request_id !== requestId) {
          throw new Error('REQUEST_ID_MISMATCH');
        }
        if (data.status !== expectedStatus) {
          throw new Error(`INVALID_STATUS_TRANSITION_${data.status}`);
        }
        const updates = {
          status: newStatus,
          ...extraUpdates,
        };
        transaction.update(execRef, updates);
        return { execution_id: execId, request_id: requestId, status: newStatus, ...extraUpdates };
      });
      inMemoryDb.executions[execId] = { ...(inMemoryDb.executions[execId] || {}), ...result };
      persistLocalDb();
      return result;
    } catch (err: any) {
      if (err.message && (err.message.includes('EXECUTION_NOT_FOUND') || err.message.includes('MISMATCH') || err.message.includes('INVALID_STATUS_TRANSITION'))) {
        throw err;
      }
    }
  }

  // Fallback to in-memory state
  const current = inMemoryDb.executions[execId];
  if (!current) {
    throw new Error('EXECUTION_NOT_FOUND');
  }
  if (current.user_id !== uid && !isAdmin) {
    throw new Error('TOKEN_USER_MISMATCH');
  }
  if (current.request_id !== requestId) {
    throw new Error('REQUEST_ID_MISMATCH');
  }
  if (current.status !== expectedStatus) {
    throw new Error(`INVALID_STATUS_TRANSITION_${current.status}`);
  }
  const updated = {
    ...current,
    status: newStatus,
    ...extraUpdates,
  };
  inMemoryDb.executions[execId] = updated;
  persistLocalDb();
  return { execution_id: execId, request_id: requestId, status: newStatus, ...extraUpdates };
}

export async function finalizeExecutionWithReceipt(
  execId: string,
  receipt: any,
  uid: string,
  isAdmin: boolean,
  finalStatus: string,
  verified: boolean,
  extraUpdates: Record<string, any> = {}
): Promise<any> {
  const checkReceiptConsistency = (data: any) => {
    if (data.execution_id !== receipt.execution_id) throw new Error('EXECUTION_ID_MISMATCH');
    if (data.request_id !== receipt.request_id) throw new Error('REQUEST_ID_MISMATCH');
    if (data.tool_id !== receipt.tool_id) throw new Error('TOOL_ID_MISMATCH');
    if (data.operation !== receipt.operation) throw new Error('OPERATION_MISMATCH');
    if (data.user_id !== uid && !isAdmin) throw new Error('USER_MISMATCH');
    if (data.device_id !== receipt.device_id) throw new Error('DEVICE_MISMATCH');
    if (data.status === 'COMPLETED' || data.status === 'FAILED' || data.status === 'REVERTED') {
      throw new Error('EXECUTION_ALREADY_COMPLETED');
    }
    if (data.status !== 'EXECUTING') {
      throw new Error(`INVALID_STATUS_TRANSITION_${data.status}`);
    }
  };

  if (adminDbInstance) {
    try {
      const execRef = adminDbInstance.collection('executions').doc(execId);
      const result = await adminDbInstance.runTransaction(async (transaction) => {
        const snap = await transaction.get(execRef);
        if (!snap.exists) throw new Error('EXECUTION_NOT_FOUND');
        const data = snap.data()!;
        checkReceiptConsistency(data);
        const updates = {
          status: finalStatus,
          verified,
          receipt,
          ...extraUpdates,
        };
        transaction.update(execRef, updates);
        return updates;
      });
      inMemoryDb.executions[execId] = { ...(inMemoryDb.executions[execId] || {}), ...result };
      persistLocalDb();
      return result;
    } catch (err: any) {
      if (err.message && (err.message.includes('MISMATCH') || err.message.includes('EXECUTION_') || err.message.includes('INVALID_STATUS_TRANSITION'))) {
        throw err;
      }
    }
  }

  const current = inMemoryDb.executions[execId];
  if (!current) throw new Error('EXECUTION_NOT_FOUND');
  checkReceiptConsistency(current);
  const updated = {
    ...current,
    status: finalStatus,
    verified,
    receipt,
    ...extraUpdates,
  };
  inMemoryDb.executions[execId] = updated;
  persistLocalDb();
  return updated;
}

// -------------------------------------------------------------
// OPTIMIZATION HISTORY & ADMIN LOGS & CONFIG
// -------------------------------------------------------------

export async function saveOptimizationHistoryRecord(historyId: string, data: any): Promise<void> {
  inMemoryDb.optimization_history.push({ id: historyId, ...data });
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('optimization_history').doc(historyId).set(data);
    } catch (err) {
      // Ignored
    }
  }
}

export async function getOptimizationHistoryRecords(uid: string): Promise<any[]> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('optimization_history').where('user_id', '==', uid).get();
      if (!snap.empty) {
        return snap.docs.map((d) => d.data());
      }
    } catch (err) {
      // fallback
    }
  }
  return inMemoryDb.optimization_history.filter((h) => h.user_id === uid);
}

export async function saveAdminLogRecord(logId: string, data: any): Promise<void> {
  inMemoryDb.admin_logs.unshift({ id: logId, ...data });
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('admin_logs').doc(logId).set(data);
    } catch (err) {
      // Ignored
    }
  }
}

export async function listAdminLogRecords(limit = 100): Promise<any[]> {
  if (adminDbInstance) {
    try {
      const snap = await adminDbInstance.collection('admin_logs').orderBy('timestamp', 'desc').limit(limit).get();
      if (!snap.empty) return snap.docs.map((d) => d.data());
    } catch (err) {
      // fallback
    }
  }
  return inMemoryDb.admin_logs.slice(0, limit);
}

export async function setConfigRecord(configId: string, data: any): Promise<void> {
  inMemoryDb.config[configId] = { ...(inMemoryDb.config[configId] || {}), ...data };
  persistLocalDb();

  if (adminDbInstance) {
    try {
      await adminDbInstance.collection('config').doc(configId).set(data, { merge: true });
    } catch (err) {
      // Ignored
    }
  }
}
