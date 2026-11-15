const {
  ApiError,
  FieldValue,
  applyCors,
  enforceClientRateLimits,
  getAdminAuth,
  getAdminFirestore,
  getClientIp,
  header,
  sendJson,
} = require('../services/apiSecurity');
const { allocateUserId } = require('../services/userIdAllocator');

const EMPTY_CARDS = { zombi: 0, yarasa: 0, duman: 0, mutant: 0, standing: 0, it: 0 };

module.exports = async function completeProfileRegistration(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authorization = header(req, 'authorization').match(/^Bearer\s+(.+)$/i);
    const installationId = header(req, 'x-firebase-installation-id').trim();
    if (!authorization || !/^[A-Za-z0-9_-]{8,200}$/.test(installationId)) {
      throw new ApiError(401, 'AUTH_HEADERS_REQUIRED');
    }

    let identity;
    try {
      identity = await getAdminAuth().verifyIdToken(authorization[1], true);
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : '';
      if (code.startsWith('auth/')) throw new ApiError(401, 'AUTH_TOKEN_INVALID');
      throw new ApiError(503, 'FIREBASE_AUTH_VERIFIER_UNAVAILABLE');
    }
    if (!identity?.uid || identity.firebase?.sign_in_provider === 'anonymous') {
      throw new ApiError(401, 'EMAIL_ACCOUNT_REQUIRED');
    }

    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 50);
    const surname = String(body.surname || '').trim().slice(0, 50);
    const handleInput = String(body.handle || '').trim().slice(0, 40);
    const gender = String(body.gender || 'Kişi').trim();
    const birthDate = String(body.birthDate || '').trim();
    if (!name || !surname || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
      || !['Kişi', 'Qadın', 'Digər'].includes(gender)) {
      throw new ApiError(400, 'PROFILE_FIELDS_INVALID');
    }

    await enforceClientRateLimits(
      identity.uid, installationId, getClientIp(req),
      'completeProfileRegistration', { max: 5, windowMs: 10 * 60_000 },
    );

    const { userId } = await allocateUserId(identity.uid);
    const db = getAdminFirestore();
    const userRef = db.doc(`users/${userId}`);
    const privateRef = db.doc(`private_user_profiles/${identity.uid}`);
    const playerRef = db.doc(`players/${userId}`);
    const formattedHandle = handleInput
      ? (handleInput.startsWith('@') ? handleInput : `@${handleInput}`)
      : `@${name.toLowerCase().replace(/\s+/g, '')}`;

    const publicUser = {
      id: String(userId),
      firebaseUid: identity.uid,
      name,
      surname,
      handle: formattedHandle,
      gender,
      role: 'user',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
      bannerImage: '',
      bannerGradient: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 50%, #3b82f6 100%)',
      bio: 'Yeni başlanğıc 🚀',
      allianceName: '',
      createdAt: Date.now(),
      likesReceived: 0,
      viewsReceived: 0,
    };

    await db.runTransaction(async (tx) => {
      const [userSnap, privateSnap, playerSnap] = await Promise.all([
        tx.get(userRef), tx.get(privateRef), tx.get(playerRef),
      ]);
      if (userSnap.exists && userSnap.data().firebaseUid !== identity.uid) {
        throw new ApiError(409, 'PROFILE_ID_ALREADY_OWNED');
      }
      if (privateSnap.exists && privateSnap.data().birthDate !== birthDate) {
        throw new ApiError(409, 'PRIVATE_PROFILE_ALREADY_EXISTS');
      }
      if (!userSnap.exists) tx.create(userRef, publicUser);
      if (!privateSnap.exists) {
        tx.create(privateRef, { birthDate, updatedAt: Date.now() });
      }
      if (playerSnap.exists && playerSnap.data().firebaseUid !== identity.uid) {
        throw new ApiError(409, 'PLAYER_ID_ALREADY_OWNED');
      }
      if (!playerSnap.exists) {
        tx.create(playerRef, {
          firebaseUid: identity.uid,
          odId: String(userId),
          displayName: `${name} ${surname}`.trim(),
          allianceId: null,
          allianceName: null,
          isLeader: false,
          score: 0,
          manat: 0,
          coins: 0,
          battleCards: EMPTY_CARDS,
          activeShields: [],
          cosmetics: { owned: [], equipped: {}, vip: { tier: 'none', expiresAt: 0 } },
          userPlan: 'FREE',
          hasVipPass: false,
          isVipLifetime: false,
          proPanelActive: false,
          creatorPanelExpiresAt: 0,
          adFreeUntil: 0,
          freeCreatorPanelClaimedAt: 0,
          battleCardsVersion: 4,
          identityVerifiedAt: FieldValue.serverTimestamp(),
          updatedAt: Date.now(),
        });
      }
    });

    return sendJson(res, 200, { userId: String(userId), profile: publicUser, birthDate });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError
      ? error.code
      : (typeof error?.message === 'string' && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message : 'PROFILE_REGISTRATION_FAILED');
    if (status >= 500) console.error('Profile registration failed:', error?.message || error);
    return sendJson(res, status, { error: code });
  }
};
