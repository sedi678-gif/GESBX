const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();

// ✅ FIXED: Restrict CORS to specific origins instead of wildcard
const allowedOrigins = [
  'https://your-domain.com',
  'http://localhost:3000',
  'http://localhost:4000'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow server-side requests (no origin)
    if (!origin) return callback(null, true);
    return callback(null, allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: '*',
    maxHttpBufferSize: 2e6
  }
});

// 1. MONGODB BAZASINA QOŞULMA
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yolustu';
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

// Qeydiyyatdan Keçən Bütün İstifadəçiləri Gettir
app.get('/api/users/all', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Axtarış Sistemi (Ad və ya Username üzrə dayıoğlunu və s. tapmaq üçün)
app.get('/api/users/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.json({ success: true, users: [] });

    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } }
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

  socket.on('join_alliance_hub', ({ userId, userName }) => {
    if (!userId) return;
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