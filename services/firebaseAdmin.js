const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAppCheck } = require('firebase-admin/app-check');
const { getAuth } = require('firebase-admin/auth');
const {
  FieldValue,
  getFirestore,
  Timestamp,
} = require('firebase-admin/firestore');
const { createPrivateKey } = require('node:crypto');

const PROJECT_ID = 'gesbx-c4312';
const APP_NAME = 'gesbx-vercel-api';

function serviceAccountConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseServiceAccountJson(raw) {
  let cleaned = raw.trim();

  // Əgər dəyişən bütövlükdə tək və ya cüt dırnaq içində verilibsə, onları təmizləyirik
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // Unescaped control characters-ləri təmizləyirik
  cleaned = cleaned.replace(/[\u0000-\u001F]+/g, "");

  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    // Əgər private_key daxilindəki \n simvolları problem yaradırsa, onları düzəldirik
    try {
      // Literal \n-ləri əsl sətirsonuna çeviririk və ya əksinə
      const repaired = cleaned
        .replace(/\\n/g, '\n')
        .replace(/\n/g, '\\n');
      return JSON.parse(repaired);
    } catch (e2) {
      throw e1;
    }
  }
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_MISSING',
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured.'
    );
  }

  let account;

  try {
    account = parseServiceAccountJson(raw);
  } catch (err) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      `FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON: ${err.message}`
    );
  }

  if (
    !account ||
    typeof account !== 'object' ||
    typeof account.client_email !== 'string' ||
    typeof account.private_key !== 'string'
  ) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'Firebase service account JSON is missing required fields.'
    );
  }

  if (account.project_id !== PROJECT_ID) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH',
      `Firebase credentials must belong to ${PROJECT_ID}. Got ${account.project_id}`
    );
  }

  // Private key sətirsonlarını qəti şəkildə düzgün PEM formatına salırıq
  let pk = account.private_key;
  if (pk.includes('\\n')) {
    pk = pk.replace(/\\n/g, '\n');
  }
  account.private_key = pk.trim();

  try {
    createPrivateKey(account.private_key);
  } catch (pkErr) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      `Private key PEM error: ${pkErr.message}`
    );
  }

  return account;
}

function getAdminApp() {
  const existing = getApps().find(
    (app) => app.name === APP_NAME
  );

  if (existing) {
    return existing;
  }

  const serviceAccount = getServiceAccount();

  try {
    return initializeApp(
      {
        credential: cert(serviceAccount),
        projectId: PROJECT_ID,
      },
      APP_NAME
    );
  } catch (error) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      `Firebase Admin SDK could not initialize: ${error.message}`
    );
  }
}

function getAdminAuth() {
  return getAuth(getAdminApp());
}

function getAdminAppCheck() {
  return getAppCheck(getAdminApp());
}

function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

module.exports = {
  PROJECT_ID,
  FieldValue,
  Timestamp,
  getServiceAccount,
  getAdminApp,
  getAdminAuth,
  getAdminAppCheck,
  getAdminFirestore,
};
