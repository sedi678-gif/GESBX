const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAppCheck } = require('firebase-admin/app-check');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

const PROJECT_ID = 'gesbx-c4312';
const APP_NAME = 'gesbx-vercel-api';

function getServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.');
  }
  if (!account || account.project_id !== PROJECT_ID || !account.client_email || !account.private_key) {
    throw new Error(`Firebase API credentials must belong to ${PROJECT_ID}.`);
  }
  return account;
}

function getAdminApp() {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;
  const serviceAccount = getServiceAccount();
  return initializeApp({
    credential: cert(serviceAccount),
    projectId: PROJECT_ID,
  }, APP_NAME);
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
