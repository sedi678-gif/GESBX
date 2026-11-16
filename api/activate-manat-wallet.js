const {
  ApiError,
  FieldValue,
  applyCors,
  getAdminFirestore,
  sendJson,
  sha256,
  verifySecureRequest,
} = require('../services/apiSecurity');

const USER_ID_PATTERN = /^\d{1,20}$/;
const REFERRAL_XP_THRESHOLD = 6500;

module.exports = async function activateManatWalletHandler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const identity = await verifySecureRequest(req, 'activateManatWallet', payload, { requireIdempotency: true, uidLimit: { max: 3, windowMs: 60_000 } });
    const userId = String(payload.userId || '').trim();
    if (!USER_ID_PATTERN.test(userId) || Object.keys(payload).length !== 1) throw new ApiError(400, 'INVALID_REQUEST');

    const db = getAdminFirestore();
    const playerRef = db.doc(`players/${userId}`);
    const userRef = db.doc(`users/${userId}`);
    const operationRef = db.doc(`operation_ledger/${sha256(`${identity.uid}:${identity.operationId}`).slice(0, 48)}`);
    const [playerSnap, userSnap] = await Promise.all([playerRef.get(), userRef.get()]);
    if (!playerSnap.exists || !userSnap.exists) throw new ApiError(404, 'PROFILE_NOT_FOUND');
    const player = playerSnap.data() || {};
    const user = userSnap.data() || {};
    if (player.firebaseUid !== identity.uid || user.firebaseUid !== identity.uid) throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
    if (player.frozen === true || user.frozen === true || user.banned === true) throw new ApiError(403, 'PROFILE_UNAVAILABLE');
    if (Number(player.walletActivatedAt) > 0) {
      return sendJson(res, 200, { walletActivated: true, alreadyActive: true, activatedAt: Number(player.walletActivatedAt) });
    }

    const referralsSnap = await db.collection('referrals')
      .where('inviterPlayerId', '==', userId)
      .where('status', '==', 'active')
      .get();
    const referralIds = [...new Set(referralsSnap.docs.map((doc) => String(doc.data()?.referredPlayerId || '').trim()).filter(Boolean))];
    const referredPlayers = await Promise.all(referralIds.map((id) => db.doc(`players/${id}`).get()));
    const qualifiedCount = referredPlayers.filter((snap) => snap.exists && Number(snap.data()?.xp) >= REFERRAL_XP_THRESHOLD).length;
    if (qualifiedCount < 2) throw new ApiError(409, 'TWO_QUALIFIED_REFERRALS_REQUIRED');

    const now = Date.now();
    const result = await db.runTransaction(async (tx) => {
      const [opSnap, currentPlayer, currentUser] = await Promise.all([
        tx.get(operationRef), tx.get(playerRef), tx.get(userRef),
      ]);
      if (opSnap.exists) return opSnap.data().result;
      if (!currentPlayer.exists || !currentUser.exists
        || currentPlayer.data()?.firebaseUid !== identity.uid
        || currentUser.data()?.firebaseUid !== identity.uid) throw new ApiError(403, 'PROFILE_OWNER_MISMATCH');
      if (Number(currentPlayer.data()?.walletActivatedAt) > 0) {
        const already = { walletActivated: true, alreadyActive: true, activatedAt: Number(currentPlayer.data().walletActivatedAt) };
        tx.create(operationRef, { authUid: identity.uid, operationId: identity.operationId, action: 'activateManatWallet', result: already, createdAt: FieldValue.serverTimestamp() });
        return already;
      }
      tx.set(playerRef, { walletActivatedAt: now, walletStatus: 'active', updatedAt: now }, { merge: true });
      tx.set(userRef, { walletActivatedAt: now, walletStatus: 'active', updatedAt: now }, { merge: true });
      const activated = { walletActivated: true, alreadyActive: false, activatedAt: now };
      tx.create(operationRef, { authUid: identity.uid, operationId: identity.operationId, action: 'activateManatWallet', result: activated, createdAt: FieldValue.serverTimestamp() });
      return activated;
    });
    return sendJson(res, 200, result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const known = new Set([
      'AUTH_HEADERS_REQUIRED', 'AUTH_TOKEN_INVALID', 'APP_CHECK_INVALID', 'APP_CHECK_PROJECT_MISMATCH',
      'AUTH_OR_APP_CHECK_REQUIRED', 'FIREBASE_SERVICE_ACCOUNT_MISSING', 'FIREBASE_SERVICE_ACCOUNT_INVALID',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH', 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE',
      'PLAY_INTEGRITY_REQUIRED', 'PLAY_INTEGRITY_NOT_CONFIGURED', 'PLAY_INTEGRITY_REJECTED',
      'PLAY_INTEGRITY_UNAVAILABLE', 'RATE_LIMITED', 'SECURITY_CONFIGURATION_MISSING',
      'INVALID_REQUEST', 'PROFILE_NOT_FOUND', 'PROFILE_OWNER_MISMATCH', 'PROFILE_UNAVAILABLE',
      'TWO_QUALIFIED_REFERRALS_REQUIRED',
    ]);
    const code = known.has(error.code) ? error.code : 'WALLET_ACTIVATION_FAILED';
    if (status >= 500) console.error('activate-manat-wallet failed:', error.message);
    return sendJson(res, status, { error: code });
  }
};
