const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAppCheck } = require('firebase-admin/app-check');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

const PROJECT_ID = 'gesbx-c4312';
const APP_NAME = 'gesbx-vercel-api';

function serviceAccountConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_MISSING',
      'FIREBASE_SERVICE_ACCOUNT_JSON is not configured.',
    );
  }
  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.',
    );
  }
  if (!account || !account.client_email || !account.private_key) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'Firebase service account JSON is missing required fields.',
    );
  }
  if (account.project_id !== PROJECT_ID) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH',
      `Firebase API credentials must belong to ${PROJECT_ID}.`,
    );
  }
  return account;
}

function getAdminApp() {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;
  const serviceAccount = getServiceAccount();
  try {
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: PROJECT_ID,
    }, APP_NAME);
  } catch (error) {
    throw serviceAccountConfigError(
      'FIREBASE_SERVICE_ACCOUNT_INVALID',
      `Firebase Admin SDK could not initialize its service account: ${error.message}`,
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
