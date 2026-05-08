const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Database ---
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const DEFAULT_DB = { users: [], groups: [], recipes: [], favorites: [], plans: {} };

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return JSON.parse(JSON.stringify(DEFAULT_DB)); }
}
function writeDB(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// --- Ensure admin account exists on startup ---
function ensureAdmin() {
  const db = readDB();
  if (!db.users.find(u => u.role === 'admin')) {
    const admin = {
      id: 'admin',
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      displayName: '绠＄悊鍛?,
      role: 'admin',
      groupId: null,
      createdAt: Date.now()
    };
    db.users.push(admin);
    writeDB(db);
    console.log('  馃憫 宸插垱寤洪粯璁ょ鐞嗗憳璐﹀彿: admin / admin123');
    console.log('  鈿狅笍  璇风櫥褰曞悗绔嬪嵆淇敼瀵嗙爜锛?);
  }
}
ensureAdmin();

// --- Auth Middleware ---
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '璇峰厛鐧诲綍' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: '鐧诲綍宸茶繃鏈? }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '闇€瑕佺鐞嗗憳鏉冮檺' });
  next();
}

// --- Login (no registration) ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: '鐢ㄦ埛鍚嶄笉瀛樺湪' });
  if (!(await bcrypt.compare(password, user.password)))
    return res.status(400).json({ error: '瀵嗙爜閿欒' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role || 'member' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role || 'member', groupId: user.groupId } });
});

// --- Current User ---
app.get('/api/me', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role || 'member', groupId: user.groupId });
});

// --- Update Profile (admin can change username & password without old password) ---
app.put('/api/me', auth, (req, res) => {
  const { displayName, username, password, oldPassword } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });

  if (displayName) user.displayName = displayName;

  // Change username (admin only, no old password needed)
  if (username && username !== user.username) {
    if (user.role === 'admin') {
      if (db.users.find(u => u.username === username && u.id !== user.id))
        return res.status(400).json({ error: '鐢ㄦ埛鍚嶅凡瀛樺湪' });
      user.username = username;
    } else {
      return res.status(403).json({ error: '鍙湁绠＄悊鍛樺彲浠ヤ慨鏀圭敤鎴峰悕' });
    }
  }

  // Change password
  if (password) {
    if (user.role === 'admin') {
      // Admin can change password without old password
      user.password = bcrypt.hashSync(password, 10);
    } else {
      // Non-admin needs old password
      if (!oldPassword || !bcrypt.compareSync(oldPassword, user.password))
        return res.status(400).json({ error: '鏃у瘑鐮侀敊璇? });
      user.password = bcrypt.hashSync(password, 10);
    }
  }

  writeDB(db);
  const newToken = jwt.sign({ id: user.id, username: user.username, role: user.role || 'member' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token: newToken, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role || 'member', groupId: user.groupId } });
});

// --- Admin: List all users ---
app.get('/api/users', auth, adminOnly, (req, res) => {
  const db = readDB();
  const users = db.users.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role || 'member', groupId: u.groupId, createdAt: u.createdAt }));
  res.json(users);
});

// --- Admin: Create member account ---
app.post('/api/users', auth, adminOnly, async (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: '鐢ㄦ埛鍚嶅拰瀵嗙爜涓嶈兘涓虹┖' });
  if (password.length < 4) return res.status(400).json({ error: '瀵嗙爜鑷冲皯4浣? });

  const db = readDB();
  if (db.users.find(u => u.username === username))
    return res.status(400).json({ error: '鐢ㄦ埛鍚嶅凡瀛樺湪' });

  const user = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
    username,
    password: await bcrypt.hash(password, 10),
    displayName: displayName || username,
    role: role || 'member',
    groupId: null,
    createdAt: Date.now()
  };
  db.users.push(user);
  writeDB(db);
  res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, groupId: null });
});

// --- Admin: Update user role / reset password ---
app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });

  if (req.body.role) user.role = req.body.role;
  if (req.body.displayName) user.displayName = req.body.displayName;
  if (req.body.password) user.password = bcrypt.hashSync(req.body.password, 10);
  if (req.body.groupId !== undefined) user.groupId = req.body.groupId;
  writeDB(db);
  res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, groupId: user.groupId });
});

// --- Admin: Delete user ---
app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  if (req.params.id === 'admin') return res.status(400).json({ error: '涓嶈兘鍒犻櫎绠＄悊鍛樿处鍙? });
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
  db.users.splice(idx, 1);
  // Remove their favorites
  db.favorites = db.favorites.filter(f => f.userId !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// --- Group Routes ---
app.post('/api/groups', auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '璇疯緭鍏ュ搴悕' });
  const db = readDB();

  const inviteCode = Math.random().toString(36).substr(2,6).toUpperCase();
  const group = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
    name, inviteCode,
    createdBy: req.user.id,
    createdAt: Date.now()
  };
  db.groups.push(group);

  const user = db.users.find(u => u.id === req.user.id);
  user.groupId = group.id;
  writeDB(db);

  res.json({ group, inviteCode });
});

app.post('/api/groups/join', auth, (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) return res.status(400).json({ error: '璇疯緭鍏ラ個璇风爜' });
  const db = readDB();

  const group = db.groups.find(g => g.inviteCode === inviteCode);
  if (!group) return res.status(400).json({ error: '閭€璇风爜鏃犳晥' });

  const user = db.users.find(u => u.id === req.user.id);
  user.groupId = group.id;
  writeDB(db);

  res.json({ group });
});

app.get('/api/groups/my', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user.groupId) return res.json(null);

  const group = db.groups.find(g => g.id === user.groupId);
  if (!group) return res.json(null);

  const members = db.users.filter(u => u.groupId === group.id)
    .map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role || 'member' }));
  res.json({ ...group, members });
});

app.post('/api/groups/leave', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  user.groupId = null;
  writeDB(db);
  res.json({ ok: true });
});

// --- Recipe Routes ---
app.get('/api/recipes', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  const isAdmin = user.role === 'admin';

  // Admin sees all, member sees own + group
  let groupMemberIds;
  if (isAdmin) {
    groupMemberIds = db.users.map(u => u.id);
  } else if (user.groupId) {
    groupMemberIds = db.users.filter(u => u.groupId === user.groupId).map(u => u.id);
  } else {
    groupMemberIds = [user.id];
  }

  let recipes = db.recipes.filter(r => groupMemberIds.includes(r.createdBy));
  recipes = recipes.map(r => ({
    ...r,
    fav: db.favorites.some(f => f.userId === req.user.id && f.recipeId === r.id)
  }));
  res.json(recipes);
});

app.post('/api/recipes', auth, (req, res) => {
  const { name, category, diff, time, tags, ingredients, steps, note } = req.body;
  if (!name) return res.status(400).json({ error: '鑿滃悕涓嶈兘涓虹┖' });

  const db = readDB();
  const recipe = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
    name, category: category || '瀹跺父鑿?,
    diff: diff || 1, time: time || 0,
    tags: tags || [], ingredients: ingredients || '',
    steps: steps || '', note: note || '',
    createdBy: req.user.id,
    createdAt: Date.now(), updatedAt: Date.now()
  };
  db.recipes.push(recipe);
  writeDB(db);
  res.json({ ...recipe, fav: false });
});

app.put('/api/recipes/:id', auth, (req, res) => {
  const db = readDB();
  const recipe = db.recipes.find(r => r.id === req.params.id);
  if (!recipe) return res.status(404).json({ error: '鑿滆氨涓嶅瓨鍦? });

  const user = db.users.find(u => u.id === req.user.id);
  const isAdmin = user.role === 'admin';

  // Admin can edit any; editor can edit group recipes; member can edit own
  let canEdit = false;
  if (isAdmin) canEdit = true;
  else if (recipe.createdBy === req.user.id) canEdit = true;
  else if (user.role === 'editor' && user.groupId && db.users.find(u => u.id === recipe.createdBy)?.groupId === user.groupId) canEdit = true;

  if (!canEdit) return res.status(403).json({ error: '鏃犳潈缂栬緫姝よ彍璋? });

  const fields = ['name','category','diff','time','tags','ingredients','steps','note'];
  fields.forEach(f => { if (req.body[f] !== undefined) recipe[f] = req.body[f]; });
  recipe.updatedAt = Date.now();
  writeDB(db);

  const fav = db.favorites.some(f => f.userId === req.user.id && f.recipeId === recipe.id);
  res.json({ ...recipe, fav });
});

app.delete('/api/recipes/:id', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  const idx = db.recipes.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '鑿滆氨涓嶅瓨鍦? });

  // Admin can delete any, others only own
  if (user.role !== 'admin' && db.recipes[idx].createdBy !== req.user.id)
    return res.status(403).json({ error: '鍙兘鍒犻櫎鑷繁鍒涘缓鐨勮彍璋? });

  db.recipes.splice(idx, 1);
  db.favorites = db.favorites.filter(f => f.recipeId !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// --- Favorites ---
app.post('/api/recipes/:id/fav', auth, (req, res) => {
  const db = readDB();
  const exists = db.favorites.find(f => f.userId === req.user.id && f.recipeId === req.params.id);
  if (exists) {
    db.favorites = db.favorites.filter(f => f !== exists);
    writeDB(db); res.json({ fav: false });
  } else {
    db.favorites.push({ userId: req.user.id, recipeId: req.params.id });
    writeDB(db); res.json({ fav: true });
  }
});

// --- Week Plan ---
app.get('/api/plan', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  const planKey = user.groupId || user.id;
  const plan = (db.plans || {})[planKey] || {};
  res.json(plan);
});

app.put('/api/plan', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  const planKey = user.groupId || user.id;
  if (!db.plans) db.plans = {};
  db.plans[planKey] = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// --- Export ---
app.get('/api/export', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  const groupMemberIds = user.groupId
    ? db.users.filter(u => u.groupId === user.groupId).map(u => u.id)
    : [user.id];
  const recipes = db.recipes.filter(r => groupMemberIds.includes(r.createdBy));
  const plan = (db.plans || {})[user.groupId || user.id] || {};
  res.json({ recipes, plan, exportedAt: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auto find available port
function startServer(port) {
  const server = app.listen(port, () => {
    const addr = server.address();
    console.log('');
    console.log('  ========================================');
    console.log('  馃嵔锔? 鎴戠殑鑿滃崟 - 绉佷汉鑿滆氨绠″');
    console.log('  ========================================');
    console.log('');
    console.log(`  馃摫 鏈満璁块棶: http://localhost:${addr.port}`);
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  馃摬 灞€鍩熺綉璁块棶: http://${net.address}:${addr.port}`);
          break;
        }
      }
    }
    console.log('');
    console.log('  鎸?Ctrl+C 鍋滄鏈嶅姟');
    console.log('');
    const url = `http://localhost:${addr.port}`;
    const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    require('child_process').exec(`${cmd} "${url}"`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`  鈿狅笍 绔彛 ${port} 琚崰鐢紝灏濊瘯 ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('  鉂?鍚姩澶辫触:', err.message);
    }
  });
}

startServer(PORT);
