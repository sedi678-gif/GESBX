const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { getAdminAuth, getAdminFirestore } = require('./services/firebaseAdmin');

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

async function verifyFirebaseToken(token) {
  if (!FIREBASE_API_KEY) throw new Error('Firebase API key serverdə konfiqurasiya edilməyib.');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  if (!response.ok) throw new Error('Firebase token etibarsızdır.');
  const data = await response.json();
  const uid = data.users?.[0]?.localId;
  if (!uid) throw new Error('Firebase istifadəçisi tapılmadı.');
  return uid;
}

async function getProfileForToken(profileId, token, uid) {
  if (!FIREBASE_PROJECT_ID) return null;
  const path = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/users/${encodeURIComponent(profileId)}`;
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const document = await response.json();
  const fields = document.fields || {};
  if (fields.firebaseUid?.stringValue !== uid) return null;
  return {
    displayName: fields.displayName?.stringValue || [fields.name?.stringValue, fields.surname?.stringValue].filter(Boolean).join(' '),
  };
}

const app = express();

// CORS: yalnız icazəli originlər (env ilə genişləndirilə bilər)
const allowedOrigins = [
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:4000']),
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
];

function originAllowed(origin) {
  // Server-side sorğular (origin yoxdur) icazəlidir
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

app.use(cors({
  origin: function (origin, callback) {
    return callback(null, originAllowed(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

// Public profile-avatar lookup lives on this standalone Node server (Render),
// not in a Vercel Function. Only the avatar URL is returned.
app.get('/profile-avatar/:profileId', async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=60');
  try {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : '';
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const identity = await getAdminAuth().verifyIdToken(token, true);
    if (!identity?.uid) return res.status(401).json({ error: 'AUTH_TOKEN_INVALID' });

    const profileId = String(req.params.profileId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(profileId)) {
      return res.status(400).json({ error: 'PROFILE_ID_INVALID' });
    }

    const db = getAdminFirestore();
    const [userSnap, playerSnap, usersByUid, playersByUid] = await Promise.all([
      db.doc(`users/${profileId}`).get(),
      db.doc(`players/${profileId}`).get(),
      db.collection('users').where('firebaseUid', '==', profileId).limit(1).get(),
      db.collection('players').where('firebaseUid', '==', profileId).limit(1).get(),
    ]);

    // A legacy UID document may exist but have no avatar, while the linked
    // generated-ID profile contains it. Check every linked document.
    const userById = userSnap.exists ? (userSnap.data() || {}) : {};
    const playerById = playerSnap.exists ? (playerSnap.data() || {}) : {};
    const userByUid = usersByUid.empty ? {} : (usersByUid.docs[0].data() || {});
    const playerByUid = playersByUid.empty ? {} : (playersByUid.docs[0].data() || {});

    const avatar = [
      userById.avatar, userById.photoURL, userById.photoUrl, userById.userAvatar,
      userByUid.avatar, userByUid.photoURL, userByUid.photoUrl, userByUid.userAvatar,
      playerById.avatar, playerById.photoURL, playerById.photoUrl, playerById.userAvatar,
      playerByUid.avatar, playerByUid.photoURL, playerByUid.photoUrl, playerByUid.userAvatar,
    ].find((value) => typeof value === 'string' && value.trim());

    return res.status(200).json({ avatar: avatar ? String(avatar).trim() : null });
  } catch (error) {
    const code = error?.code || '';
    const status = code === 'FIREBASE_SERVICE_ACCOUNT_MISSING'
      || code === 'FIREBASE_SERVICE_ACCOUNT_INVALID'
      || code === 'FIREBASE_SERVICE_ACCOUNT_PROJECT_MISMATCH' ? 503 : 401;
    console.error('[Profile avatar] lookup failed:', code || error?.message || error);
    return res.status(status).json({ error: status === 503 ? code : 'PROFILE_AVATAR_LOOKUP_FAILED' });
  }
});

// Legacy Mongo endpoints are retired; Firebase is the authoritative data store.
app.use('/api/users', (_req, res) => res.status(410).json({
  success: false,
  error: 'Bu endpoint deaktiv edilib. Firebase istifadə edin.',
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // ✅ FIXED: socket üçün də wildcard yerinə eyni allowlist işlədilir
    origin: function (origin, callback) {
      return callback(null, originAllowed(origin));
    },
    methods: ['GET', 'POST'],
    maxHttpBufferSize: 2e6
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('unauthorized'));
    socket.data.authUserId = await verifyFirebaseToken(token);
    socket.data.firebaseIdToken = token;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

// REAL-TIME SOCKET.IO — presence/alliance hub transport; application data stays in Firebase.
const allianceHubUsers = new Map(); // socketId -> { userId, userName }
const onlineUsers = new Map(); // socketId -> userId

io.on('connection', (socket) => {
  console.log('🔌 Yeni istifadəçi qoşuldu:', socket.id);

  socket.data.authenticated = true;

  socket.on('user_connected', async (userId) => {
    const profileId = String(userId || '').trim();
    if (!profileId) return;
    if (!await getProfileForToken(profileId, socket.data.firebaseIdToken, socket.data.authUserId)) return;
    onlineUsers.set(socket.id, profileId);
    socket.join(profileId);
    io.emit('user_status_change', { userId: profileId, isOnline: true });
  });

  socket.on('join_alliance_hub', async ({ userId } = {}) => {
    if (!userId) return;
    // ✅ FIXED: auth olunmadan hub-a qoşulmaq olmaz
    if (!socket.data.authenticated) {
      socket.emit('auth_required', { room: 'alliance_hub' });
      return;
    }
    const profileId = String(userId);
    const profile = await getProfileForToken(profileId, socket.data.firebaseIdToken, socket.data.authUserId);
    if (!profile) return;
    const userName = profile.displayName || profileId;
    socket.join('alliance_hub');
    allianceHubUsers.set(socket.id, { userId, userName });
    io.to('alliance_hub').emit('hub_online_count', { count: allianceHubUsers.size });
    io.to('alliance_hub').emit('hub_stats_updated', { type: 'player_joined', userId, userName });
  });

  socket.on('leave_alliance_hub', () => {
    allianceHubUsers.delete(socket.id);
    io.to('alliance_hub').emit('hub_online_count', { 
      count: allianceHubUsers.size 
    });
  });

  // ... (rest of socket handlers remain the same for brevity)
  
  socket.on('disconnect', async () => {
    allianceHubUsers.delete(socket.id);
    io.to('alliance_hub').emit('hub_online_count', { count: allianceHubUsers.size });

    const userId = onlineUsers.get(socket.id);
    if (userId) {
      socket.leave(String(userId));
      io.emit('user_status_change', { userId, isOnline: false });
      onlineUsers.delete(socket.id);
    }
    console.log('❌ İstifadəçi ayrıldı:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Birləşdirilmiş Vahid Server ${PORT} portunda aktivdir...`);
});
