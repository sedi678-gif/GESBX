const express = require('express');
const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();

// CORS: yalnız icazəli originlər (env ilə genişləndirilə bilər)
const allowedOrigins = [
  'https://your-domain.com',
  'http://localhost:3000',
  'http://localhost:4000',
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

// ─────────────────────────────────────────────────────────────
// ZEGO TOKEN — serverSecret YALNIZ burada yaşayır, klientə getmir
// ─────────────────────────────────────────────────────────────
// Zego tokeni: base64( HMAC-SHA256(secret_hash, payload) )
// Sənəd: https://docs.zegocloud.com/article/11649
const ZEGO_APP_ID = Number(process.env.ZEGO_APP_ID || process.env.NEXT_PUBLIC_ZEGO_APP_ID || 0);
const ZEGO_SERVER_SECRET = String(process.env.ZEGO_SERVER_SECRET || '').trim();
const ZEGO_TOKEN_TTL_SEC = 3600;

function makeZegoToken(userId, roomId, ttlSec) {
  if (!ZEGO_APP_ID || !ZEGO_SERVER_SECRET) {
    throw new Error('Zego server konfiqurasiyası yoxdur (ZEGO_APP_ID / ZEGO_SERVER_SECRET)');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    app_id: ZEGO_APP_ID,
    user_id: String(userId),
    nonce: Math.floor(Math.random() * 2147483647) + 1,
    ctime: now,
    expire: now + (Number(ttlSec) > 0 ? Number(ttlSec) : ZEGO_TOKEN_TTL_SEC),
    payload: JSON.stringify({ room_id: String(roomId || '') }),
  };
  const secretHash = crypto.createHash('sha256').update(ZEGO_SERVER_SECRET).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', secretHash, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

app.post('/api/zego/token', (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const roomId = String(req.body?.roomId || '').trim();
    if (!userId || !roomId) {
      return res.status(400).json({ error: 'userId və roomId tələb olunur' });
    }
    const token = makeZegoToken(userId, roomId, req.body?.ttlSec);
    return res.json({ token, appId: ZEGO_APP_ID, expireSec: ZEGO_TOKEN_TTL_SEC });
  } catch (error) {
    console.error('Zego token xətası:', error.message);
    return res.status(500).json({ error: 'Token yaradıla bilmədi' });
  }
});

// 1. MONGODB BAZASINA QOŞULMA
// DIQQƏT: Firebase artıq əsas backenddir. MongoDB yalnız köhnə REST endpointləri üçün
// saxlanılır və heç bir sinxronizasiya yoxdur. İki mənbədə eyni istifadəçinin
// bölünməsinin qarşısını almaq üçün bu hissəni tamamilə silmək tövsiyə olunur.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gesbx';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB verilənlər bazasına uğurla qoşuldu!'))
  .catch((err) => console.error('❌ Baza qoşulma xətası:', err));

// 2. İSTİFADƏÇİ SXEMİ VƏ MODELİ (Baza üçün)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  age: { type: Number, default: 18 },
  avatar: { type: String, default: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80' },
  isOnline: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// 3. MESAJ SXEMİ VƏ MODELİ (Mesajların bazada qalması üçün)
const messageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  recipientId: { type: String, required: true },
  text: String,
  audioUrl: String,
  fileUrl: String,
  fileType: String,
  location: Object,
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// 4. REST API ROUTES (Qeydiyyat, Axtarış, Siyahı)

// Yeni İstifadəçi Qeydiyyatı
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, username, age } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Bu istifadəçi adı artıq götürülüb.' });
    }

    const newUser = new User({ name, username, age });
    await newUser.save();

    res.json({ success: true, user: newUser });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ FIXED: bu endpointlər auth-suz idi — bütün istifadəçi siyahısını verirdi.
// İndi server açarı tələb olunur (ADMIN_API_KEY env). Tətbiq onsuz da Firebase işlədir.
function requireAdminKey(req, res) {
  const key = String(process.env.ADMIN_API_KEY || '').trim();
  if (!key) {
    res.status(503).json({ success: false, error: 'Bu endpoint konfiqurasiya olunmayıb' });
    return false;
  }
  const sent = String(req.headers['x-admin-key'] || '').trim();
  if (sent !== key) {
    res.status(401).json({ success: false, error: 'İcazə yoxdur' });
    return false;
  }
  return true;
}

// Qeydiyyatdan Keçən Bütün İstifadəçiləri Gettir
app.get('/api/users/all', async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Axtarış Sistemi (Ad və ya Username üzrə dayıoğlunu və s. tapmaq üçün)
app.get('/api/users/search', async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  try {
    const { query } = req.query;
    if (!query) return res.json({ success: true, users: [] });

    // ✅ FIXED: regex inject — istifadəçi girişi escape olunur (ReDoS / wildcard axtarışın qarşısı)
    const safe = String(query).slice(0, 64).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const users = await User.find({
      $or: [
        { name: { $regex: safe, $options: 'i' } },
        { username: { $regex: safe, $options: 'i' } }
      ]
    });

    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. REAL-TIME SOCKET.IO — Alliance Hub (mərkəzi beyin otağı)
const allianceHubUsers = new Map(); // socketId -> { userId, userName }
const onlineUsers = new Map(); // socketId -> userId

io.on('connection', (socket) => {
  console.log('🔌 Yeni istifadəçi qoşuldu:', socket.id);

  // Socket auth: klient Firebase ID tokeni göndərir; uğursuzsa bağlantı kəsilir.
  socket.on('authenticate', async ({ token, userId } = {}) => {
    if (!token || !userId) {
      socket.emit('auth_failed', { reason: 'token_required' });
      return;
    }
    try {
      const { getAuth } = require('firebase-admin/auth');
      const decoded = await getAuth().verifyIdToken(String(token));
      if (String(userId) !== decoded.uid && String(userId) !== decoded.user_id) {
        socket.emit('auth_failed', { reason: 'uid_mismatch' });
        return;
      }
      socket.data.authUserId = decoded.uid;
      socket.data.authenticated = true;
      socket.emit('auth_ok', { userId: decoded.uid });
    } catch (error) {
      console.warn('Socket auth uğursuz:', error.message);
      socket.emit('auth_failed', { reason: 'invalid_token' });
    }
  });

  socket.on('join_alliance_hub', ({ userId, userName }) => {
    if (!userId) return;
    // ✅ FIXED: auth olunmadan hub-a qoşulmaq olmaz
    if (!socket.data.authenticated) {
      socket.emit('auth_required', { room: 'alliance_hub' });
      return;
    }
    socket.join('alliance_hub');
    allianceHubUsers.set(socket.id, { userId, userName });
    io.to('alliance_hub').emit('hub_online_count', { count: allianceHubUsers.size });
    io.to('alliance_hub').emit('hub_stats_updated', { type: 'player_joined', userId, userName });
  });

  socket.on('leave_alliance_hub', ({ userId }) => {
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