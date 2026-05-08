const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Supabase 閰嶇疆
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ibhqmxkrcajbfhwxvykm.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_2wdggHPlKmOGezo-a6RiJw_YpXkIfnt';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'YOUR_SERVICE_ROLE_KEY_HERE';

// 浣跨敤 service key 杩涜鍚庣鎿嶄綔锛堢粫杩?RLS锛?const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

app.use(express.json());
app.use(express.static(require('path').join(__dirname, 'public')));

// --- Database Helpers ---
async function getUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return data || [];
}
async function getUserById(id) {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
async function getUserByUsername(username) {
  const { data, error } = await supabase.from('users').select('*').eq('username', username).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
async function upsertUser(user) {
  const { data, error } = await supabase.from('users').upsert(user).select().single();
  if (error) throw error;
  return data;
}
async function deleteUser(id) {
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) throw error;
}

async function getGroups() {
  const { data, error } = await supabase.from('groups').select('*');
  if (error) throw error;
  return data || [];
}
async function getGroupById(id) {
  const { data, error } = await supabase.from('groups').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
async function getGroupByInviteCode(code) {
  const { data, error } = await supabase.from('groups').select('*').eq('invite_code', code).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
async function upsertGroup(group) {
  const { data, error } = await supabase.from('groups').upsert(group).select().single();
  if (error) throw error;
  return data;
}

async function getRecipes() {
  const { data, error } = await supabase.from('recipes').select('*');
  if (error) throw error;
  return data || [];
}
async function getRecipeById(id) {
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
async function upsertRecipe(recipe) {
  const { data, error } = await supabase.from('recipes').upsert(recipe).select().single();
  if (error) throw error;
  return data;
}
async function deleteRecipe(id) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

async function getFavorites() {
  const { data, error } = await supabase.from('favorites').select('*');
  if (error) throw error;
  return data || [];
}
async function addFavorite(userId, recipeId) {
  const id = `${userId}_${recipeId}`;
  const { error } = await supabase.from('favorites').upsert({ id, user_id: userId, recipe_id: recipeId });
  if (error) throw error;
}
async function removeFavorite(userId, recipeId) {
  const id = `${userId}_${recipeId}`;
  const { error } = await supabase.from('favorites').delete().eq('id', id);
  if (error) throw error;
}
async function isFavorite(userId, recipeId) {
  const id = `${userId}_${recipeId}`;
  const { data, error } = await supabase.from('favorites').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

async function getPlan(key) {
  const { data, error } = await supabase.from('plans').select('*').eq('plan_key', key).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ? JSON.parse(data.data || '{}') : {};
}
async function savePlan(key, data) {
  const id = key;
  const { error } = await supabase.from('plans').upsert({ id, plan_key: key, data: JSON.stringify(data) });
  if (error) throw error;
}

// --- Ensure admin account exists on startup ---
async function ensureAdmin() {
  try {
    const admin = await getUserById('admin');
    if (!admin) {
      const newAdmin = {
        id: 'admin',
        username: 'admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        display_name: '绠＄悊鍛?,
        role: 'admin',
        group_id: null,
        created_at: Date.now()
      };
      await upsertUser(newAdmin);
      console.log('  馃憫 宸插垱寤洪粯璁ょ鐞嗗憳璐﹀彿: admin / admin123');
      console.log('  鈿狅笍  璇风櫥褰曞悗绔嬪嵆淇敼瀵嗙爜锛?);
    }
  } catch (e) {
    console.error('妫€鏌ョ鐞嗗憳璐﹀彿澶辫触:', e.message);
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
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user) return res.status(400).json({ error: '鐢ㄦ埛鍚嶄笉瀛樺湪' });
    if (!(await bcrypt.compare(password, user.password_hash)))
      return res.status(400).json({ error: '瀵嗙爜閿欒' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role || 'member' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role || 'member', groupId: user.group_id } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Current User ---
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });
    res.json({ id: user.id, username: user.username, displayName: user.display_name, role: user.role || 'member', groupId: user.group_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Update Profile ---
app.put('/api/me', auth, async (req, res) => {
  try {
    const { displayName, username, password, oldPassword } = req.body;
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });

    const updates = {};
    if (displayName) updates.display_name = displayName;

    if (username && username !== user.username) {
      if (user.role === 'admin') {
        const existing = await getUserByUsername(username);
        if (existing && existing.id !== user.id)
          return res.status(400).json({ error: '鐢ㄦ埛鍚嶅凡瀛樺湪' });
        updates.username = username;
      } else {
        return res.status(403).json({ error: '鍙湁绠＄悊鍛樺彲浠ヤ慨鏀圭敤鎴峰悕' });
      }
    }

    if (password) {
      if (user.role === 'admin') {
        updates.password_hash = bcrypt.hashSync(password, 10);
      } else {
        if (!oldPassword || !bcrypt.compareSync(oldPassword, user.password_hash))
          return res.status(400).json({ error: '鏃у瘑鐮侀敊璇? });
        updates.password_hash = bcrypt.hashSync(password, 10);
      }
    }

    if (Object.keys(updates).length > 0) {
      await upsertUser({ ...user, ...updates });
    }

    const updatedUser = await getUserById(req.user.id);
    const newToken = jwt.sign({ id: updatedUser.id, username: updatedUser.username, role: updatedUser.role || 'member' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: newToken, user: { id: updatedUser.id, username: updatedUser.username, displayName: updatedUser.display_name, role: updatedUser.role || 'member', groupId: updatedUser.group_id } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin: List all users ---
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role || 'member', groupId: u.group_id, createdAt: u.created_at })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin: Create member account ---
app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: '鐢ㄦ埛鍚嶅拰瀵嗙爜涓嶈兘涓虹┖' });
    if (password.length < 4) return res.status(400).json({ error: '瀵嗙爜鑷冲皯4浣? });

    const existing = await getUserByUsername(username);
    if (existing) return res.status(400).json({ error: '鐢ㄦ埛鍚嶅凡瀛樺湪' });

    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
      username,
      password_hash: await bcrypt.hash(password, 10),
      display_name: displayName || username,
      role: role || 'member',
      group_id: null,
      created_at: Date.now()
    };
    await upsertUser(user);
    res.json({ id: user.id, username: user.username, displayName: user.display_name, role: user.role, groupId: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin: Update user ---
app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: '鐢ㄦ埛涓嶅瓨鍦? });

    const updates = {};
    if (req.body.role) updates.role = req.body.role;
    if (req.body.displayName) updates.display_name = req.body.displayName;
    if (req.body.password) updates.password_hash = bcrypt.hashSync(req.body.password, 10);
    if (req.body.groupId !== undefined) updates.group_id = req.body.groupId;

    if (Object.keys(updates).length > 0) {
      await upsertUser({ ...user, ...updates });
    }

    const updated = await getUserById(req.params.id);
    res.json({ id: updated.id, username: updated.username, displayName: updated.display_name, role: updated.role, groupId: updated.group_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Admin: Delete user ---
app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (req.params.id === 'admin') return res.status(400).json({ error: '涓嶈兘鍒犻櫎绠＄悊鍛樿处鍙? });
    await deleteUser(req.params.id);
    // Remove their favorites
    const { error } = await supabase.from('favorites').delete().eq('user_id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Group Routes ---
app.post('/api/groups', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '璇疯緭鍏ュ搴悕' });

    const inviteCode = Math.random().toString(36).substr(2,6).toUpperCase();
    const group = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
      name, invite_code: inviteCode,
      created_by: req.user.id,
      created_at: Date.now()
    };
    await upsertGroup(group);

    const user = await getUserById(req.user.id);
    await upsertUser({ ...user, group_id: group.id });

    res.json({ group: { ...group, inviteCode }, inviteCode });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/groups/join', auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: '璇疯緭鍏ラ個璇风爜' });

    const group = await getGroupByInviteCode(inviteCode);
    if (!group) return res.status(400).json({ error: '閭€璇风爜鏃犳晥' });

    const user = await getUserById(req.user.id);
    await upsertUser({ ...user, group_id: group.id });

    res.json({ group: { id: group.id, name: group.name, inviteCode: group.invite_code } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/groups/my', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user.group_id) return res.json(null);

    const group = await getGroupById(user.group_id);
    if (!group) return res.json(null);

    const allUsers = await getUsers();
    const members = allUsers.filter(u => u.group_id === group.id)
      .map(u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role || 'member' }));
    res.json({ id: group.id, name: group.name, inviteCode: group.invite_code, members });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/groups/leave', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    await upsertUser({ ...user, group_id: null });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Recipe Routes ---
app.get('/api/recipes', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const isAdmin = user.role === 'admin';

    const allUsers = await getUsers();
    let groupMemberIds;
    if (isAdmin) {
      groupMemberIds = allUsers.map(u => u.id);
    } else if (user.group_id) {
      groupMemberIds = allUsers.filter(u => u.group_id === user.group_id).map(u => u.id);
    } else {
      groupMemberIds = [user.id];
    }

    const allRecipes = await getRecipes();
    let recipes = allRecipes.filter(r => groupMemberIds.includes(r.created_by));

    const favorites = await getFavorites();
    recipes = recipes.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      diff: r.diff,
      time: r.time,
      tags: JSON.parse(r.tags || '[]'),
      ingredients: r.ingredients,
      steps: r.steps,
      note: r.note,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      fav: favorites.some(f => f.user_id === req.user.id && f.recipe_id === r.id)
    }));
    res.json(recipes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/recipes', auth, async (req, res) => {
  try {
    const { name, category, diff, time, tags, ingredients, steps, note } = req.body;
    if (!name) return res.status(400).json({ error: '鑿滃悕涓嶈兘涓虹┖' });

    const recipe = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2,5),
      name, category: category || '瀹跺父鑿?,
      diff: diff || 1, time: time || 0,
      tags: JSON.stringify(tags || []),
      ingredients: ingredients || '',
      steps: steps || '', note: note || '',
      created_by: req.user.id,
      created_at: Date.now(), updated_at: Date.now()
    };
    await upsertRecipe(recipe);
    res.json({ ...recipe, tags: JSON.parse(recipe.tags), fav: false, createdBy: recipe.created_by, createdAt: recipe.created_at, updatedAt: recipe.updated_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/recipes/:id', auth, async (req, res) => {
  try {
    const recipe = await getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: '鑿滆氨涓嶅瓨鍦? });

    const user = await getUserById(req.user.id);
    const isAdmin = user.role === 'admin';

    let canEdit = false;
    if (isAdmin) canEdit = true;
    else if (recipe.created_by === req.user.id) canEdit = true;
    else if (user.role === 'editor' && user.group_id) {
      const creator = await getUserById(recipe.created_by);
      if (creator && creator.group_id === user.group_id) canEdit = true;
    }

    if (!canEdit) return res.status(403).json({ error: '鏃犳潈缂栬緫姝よ彍璋? });

    const updates = { updated_at: Date.now() };
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.category !== undefined) updates.category = req.body.category;
    if (req.body.diff !== undefined) updates.diff = req.body.diff;
    if (req.body.time !== undefined) updates.time = req.body.time;
    if (req.body.tags !== undefined) updates.tags = JSON.stringify(req.body.tags);
    if (req.body.ingredients !== undefined) updates.ingredients = req.body.ingredients;
    if (req.body.steps !== undefined) updates.steps = req.body.steps;
    if (req.body.note !== undefined) updates.note = req.body.note;

    await upsertRecipe({ ...recipe, ...updates });

    const updated = await getRecipeById(req.params.id);
    const fav = await isFavorite(req.user.id, req.params.id);
    res.json({ ...updated, tags: JSON.parse(updated.tags || '[]'), fav, createdBy: updated.created_by, createdAt: updated.created_at, updatedAt: updated.updated_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/recipes/:id', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const recipe = await getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: '鑿滆氨涓嶅瓨鍦? });

    if (user.role !== 'admin' && recipe.created_by !== req.user.id)
      return res.status(403).json({ error: '鍙兘鍒犻櫎鑷繁鍒涘缓鐨勮彍璋? });

    await deleteRecipe(req.params.id);
    await supabase.from('favorites').delete().eq('recipe_id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Favorites ---
app.post('/api/recipes/:id/fav', auth, async (req, res) => {
  try {
    const exists = await isFavorite(req.user.id, req.params.id);
    if (exists) {
      await removeFavorite(req.user.id, req.params.id);
      res.json({ fav: false });
    } else {
      await addFavorite(req.user.id, req.params.id);
      res.json({ fav: true });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Week Plan ---
app.get('/api/plan', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const planKey = user.group_id || user.id;
    const plan = await getPlan(planKey);
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/plan', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const planKey = user.group_id || user.id;
    await savePlan(planKey, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Export ---
app.get('/api/export', auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    const allUsers = await getUsers();
    const groupMemberIds = user.group_id
      ? allUsers.filter(u => u.group_id === user.group_id).map(u => u.id)
      : [user.id];
    const allRecipes = await getRecipes();
    const recipes = allRecipes.filter(r => groupMemberIds.includes(r.created_by)).map(r => ({
      ...r,
      tags: JSON.parse(r.tags || '[]'),
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
    const plan = await getPlan(user.group_id || user.id);
    res.json({ recipes, plan, exportedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

// Auto find available port
function startServer(port) {
  const server = app.listen(port, () => {
    const addr = server.address();
    console.log('');
    console.log('  ========================================');
    console.log('  馃嵔锔? 鎴戠殑鑿滃崟 - 绉佷汉鑿滆氨绠″ (Supabase鐗?');
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
    console.log('  鈽侊笍  鏁版嵁瀛樺偍: Supabase Cloud');
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
