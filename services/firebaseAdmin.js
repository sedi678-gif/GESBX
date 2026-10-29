
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
  let candidate = raw;

  // JSON bəzən əlavə dırnaqlar içində saxlanıla bilər.
  try {
    const decoded = JSON.parse(candidate);

    if (typeof decoded === 'string') {
      candidate = decoded;
    } else {
      return decoded;
    }
  } catch {
    // Aşağıda mümkün sətirsonu problemini yoxlayırıq.
  }

  // Əvvəlcə adi JSON kimi oxumağa çalış.
  try {
    return JSON.parse(candidate);
  } catch {
    // private_key daxilindəki həqiqi sətirsonlarını
    // JSON üçün düzgün \n formatına çevir.
  }

  const repaired = candidate.replace(
    /("private_key"\s*:\s*")([\s\S]*?)("\s*[,}])/g,
    (_match, prefix, key, suffix) =>
      prefix +
      key.replace(/\r\n|\r|\n/g, '\\n') +
      suffix
  );

  return JSON.parse(repaired);
}

function getServiceAccount() {
  const raw = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
  ).trim();

  if (!raw) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_MISSING',
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured.'
    );
  }

  let account;

  try {
    account = parseServiceAccountJson(raw);
  } catch {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON. Check the complete service account JSON value.'
    );
  }

  if (
    !account ||
    typeof account !== 'object' ||
    typeof account.client_email !== 'string' ||
    typeof account.private_key !== 'string' ||
    !account.client_email ||
    !account.private_key
  ) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'Firebase service account JSON is missing required fields.'
    );
  }

  if (account.project_id !== PROJECT_ID) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH',
      `Firebase credentials must belong to ${PROJECT_ID}.`
    );
  }

  account.private_key = account.private_key
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();

  try {
    createPrivateKey(account.private_key);
  } catch {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'Firebase service account private key is not a valid PEM key.'
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
      `Firebase Admin SDK could not initialize its service account: ${error.message}`
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
