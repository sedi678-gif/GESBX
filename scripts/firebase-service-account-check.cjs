const { PROJECT_ID, getServiceAccount } = require('../services/firebaseAdmin');

try {
  getServiceAccount();
  console.log(`Firebase service-account JSON and PEM are valid for ${PROJECT_ID}.`);
  console.log('This local check does not verify Vercel deployment state, IAM permissions, or Firebase API access.');
} catch (error) {
  const code = typeof error?.code === 'string' ? error.code : 'FIREBASE_SERVICE_ACCOUNT_INVALID';
  const guidance = {
    FIREBASE_SERVICE_ACCOUNT_MISSING: 'Set FIREBASE_SERVICE_ACCOUNT_JSON in the server environment.',
    FIREBASE_SERVICE_ACCOUNT_INVALID: 'Provide the complete service-account JSON with a valid private_key PEM.',
    FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH: `Use a service account created in ${PROJECT_ID}.`,
  };
  console.error(`Firebase service-account preflight failed (${code}). ${guidance[code] || 'Check the server credential configuration.'}`);
  process.exitCode = 1;
}
