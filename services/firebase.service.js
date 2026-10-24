const admin = require("firebase-admin");

const COLLECTIONS = {
  photos: "photos",
  sessions: "sessions",
  captures: "captures",
  pairings: "pairings",
};

let initialized = false;
let dbInstance = null;

function parseServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_CONFIG;
  if (raw && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.private_key && parsed.private_key.indexOf("\\n") !== -1) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      }
      return parsed;
    } catch (e) {
      throw new Error("FIREBASE_CONFIG is not valid JSON");
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function initFirebase() {
  if (initialized) return dbInstance;

  const usingAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccount = parseServiceAccountFromEnv();

  try {
    if (admin.apps.length === 0) {
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId:
            serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
        });
      } else if (usingAdc) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      } else {
        throw new Error(
          "Firebase credentials missing: set FIREBASE_CONFIG or GOOGLE_APPLICATION_CREDENTIALS"
        );
      }
    }
    dbInstance = admin.firestore();
    dbInstance.settings({ ignoreUndefinedProperties: true });
    initialized = true;
    return dbInstance;
  } catch (err) {
    console.error("[firebase] initialization failed:", err.message);
    throw err;
  }
}

function getDb() {
  if (!dbInstance) {
    return initFirebase();
  }
  return dbInstance;
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function getCollections() {
  return COLLECTIONS;
}

async function createPhotoRecord(data) {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.photos).doc();
  const record = Object.assign({}, data, {
    id: ref.id,
    createdAt: serverTimestamp(),
  });
  await ref.set(record);
  return Object.assign({}, record, { id: ref.id });
}

async function getPhotoById(photoId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.photos).doc(photoId).get();
  if (!snap.exists) return null;
  return Object.assign({ id: snap.id }, snap.data());
}

async function deletePhotoById(photoId) {
  const db = getDb();
  await db.collection(COLLECTIONS.photos).doc(photoId).delete();
  return true;
}

async function listPhotos(options) {
  const db = getDb();
  const limit = options.limit || 24;
  const cursor = options.cursor;

  let query = db
    .collection(COLLECTIONS.photos)
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (cursor) {
    try {
      const cursorDoc = await db
        .collection(COLLECTIONS.photos)
        .doc(cursor)
        .get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    } catch (e) {}
  }

  const snap = await query.get();
  const items = [];
  snap.forEach((doc) => {
    items.push(Object.assign({ id: doc.id }, doc.data()));
  });

  const nextCursor =
    items.length === limit ? items[items.length - 1].id : null;

  return { items, nextCursor };
}

async function createCaptureRecord(data) {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.captures).doc(data.captureId);
  const record = Object.assign({}, data, {
    createdAt: serverTimestamp(),
    status: data.status || "pending",
  });
  await ref.set(record);
  return record;
}

async function getCaptureById(captureId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.captures).doc(captureId).get();
  if (!snap.exists) return null;
  return Object.assign({ id: snap.id }, snap.data());
}

async function updateCaptureStatus(captureId, status, extra) {
  const db = getDb();
  const payload = Object.assign(
    { status, updatedAt: serverTimestamp() },
    extra || {}
  );
  await db
    .collection(COLLECTIONS.captures)
    .doc(captureId)
    .set(payload, { merge: true });
  return true;
}

async function createSessionRecord(data) {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.sessions).doc(data.sessionId);
  await ref.set(
    Object.assign({}, data, { createdAt: serverTimestamp() }),
    { merge: true }
  );
  return true;
}

async function updateSessionRecord(sessionId, data) {
  const db = getDb();
  await db
    .collection(COLLECTIONS.sessions)
    .doc(sessionId)
    .set(
      Object.assign({}, data, { updatedAt: serverTimestamp() }),
      { merge: true }
    );
  return true;
}

async function getSessionRecord(sessionId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.sessions).doc(sessionId).get();
  if (!snap.exists) return null;
  return Object.assign({ id: snap.id }, snap.data());
}

async function createPairingRecord(data) {
  const db = getDb();
  const ref = db.collection(COLLECTIONS.pairings).doc(data.pairingId);
  await ref.set(
    Object.assign({}, data, { createdAt: serverTimestamp() }),
    { merge: true }
  );
  return true;
}

async function getPairingRecord(pairingId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.pairings).doc(pairingId).get();
  if (!snap.exists) return null;
  return Object.assign({ id: snap.id }, snap.data());
}

async function deletePairingRecord(pairingId) {
  const db = getDb();
  await db.collection(COLLECTIONS.pairings).doc(pairingId).delete();
  return true;
}

function toSerializable(record) {
  if (!record || typeof record !== "object") return record;
  const out = {};
  Object.keys(record).forEach((key) => {
    const value = record[key];
    if (value && typeof value.toDate === "function") {
      out[key] = value.toDate().toISOString();
    } else if (value && typeof value._seconds === "number") {
      out[key] = new Date(value._seconds * 1000).toISOString();
    } else {
      out[key] = value;
    }
  });
  return out;
}

module.exports = {
  initFirebase,
  getDb,
  getCollections,
  serverTimestamp,
  createPhotoRecord,
  getPhotoById,
  deletePhotoById,
  listPhotos,
  createCaptureRecord,
  getCaptureById,
  updateCaptureStatus,
  createSessionRecord,
  updateSessionRecord,
  getSessionRecord,
  createPairingRecord,
  getPairingRecord,
  deletePairingRecord,
  toSerializable,
};
