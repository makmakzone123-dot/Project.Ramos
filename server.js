const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  console.log("REQ:", req.method, req.url);
  next();
});

// IMPORTANT: All /api routes are registered BEFORE express.static so that
// unknown API paths return JSON 404 instead of the HTML fallback page —
// which caused "Unexpected token '<'" when the client tried to JSON.parse it.

// ─────────────────────────────
// In-memory database
// ─────────────────────────────
let users = [];
let posts = [];
let messages = [];
let sessions = {};
let nextId = { user: 1, post: 1, comment: 1, message: 1 };

// ─────────────────────────────
// Helpers
// ─────────────────────────────
const tokenGen = () => Math.random().toString(36).substring(2);
const safeUser = (u) => { const { password, ...safe } = u; return safe; };

const auth = (req, res, next) => {
  const t = req.headers.authorization;
  if (!t || !sessions[t]) return res.status(401).json({ error: "Unauthorized" });
  req.userId = sessions[t];
  next();
};

// ─────────────────────────────
// AUTH
// ─────────────────────────────
app.post("/api/register", (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password)
    return res.status(400).json({ error: "Missing fields" });
  if (users.find(u => u.username === username))
    return res.status(409).json({ error: "Username taken" });
  const user = {
    id: nextId.user++, name, username, password,
    bio: "", avatar: name.slice(0, 2).toUpperCase(),
    photo: null, color: "#FF6B6B", createdAt: new Date().toISOString()
  };
  users.push(user);
  const token = tokenGen();
  sessions[token] = user.id;
  res.json({ token, user: safeUser(user) });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid login" });
  const token = tokenGen();
  sessions[token] = user.id;
  res.json({ token, user: safeUser(user) });
});

app.post("/api/logout", auth, (req, res) => {
  delete sessions[req.headers.authorization];
  res.json({ message: "Logged out" });
});

app.get("/api/me", auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  res.json(safeUser(user));
});

app.patch("/api/me", auth, (req, res) => {
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "Not found" });
  const { bio, photo, name } = req.body;
  if (bio !== undefined) user.bio = bio;
  if (photo !== undefined) user.photo = photo;
  if (name !== undefined) user.name = name;
  res.json(safeUser(user));
});

// ─────────────────────────────
// USERS
// ─────────────────────────────
app.get("/api/users", auth, (req, res) => {
  res.json(users.map(safeUser));
});

app.get("/api/users/:id", auth, (req, res) => {
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const userPosts = posts.filter(p => p.userId == req.params.id);
  res.json({ user: safeUser(user), posts: userPosts });
});

// ─────────────────────────────
// POSTS
// ─────────────────────────────
app.get("/api/posts", auth, (req, res) => { res.json(posts); });

app.post("/api/posts", auth, (req, res) => {
  const post = {
    id: nextId.post++, userId: req.userId, content: req.body.content,
    timestamp: new Date().toISOString(), likes: [], comments: []
  };
  posts.unshift(post);
  res.json(post);
});

app.post("/api/posts/:id/like", auth, (req, res) => {
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  const idx = post.likes.indexOf(req.userId);
  if (idx === -1) post.likes.push(req.userId); else post.likes.splice(idx, 1);
  res.json(post);
});

app.delete("/api/posts/:id", auth, (req, res) => {
  const idx = posts.findIndex(p => p.id == req.params.id && p.userId === req.userId);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  posts.splice(idx, 1);
  res.json({ message: "Deleted" });
});

// ─────────────────────────────
// COMMENTS
// ─────────────────────────────
app.post("/api/posts/:id/comments", auth, (req, res) => {
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  const comment = {
    id: nextId.comment++, userId: req.userId,
    text: req.body.text, timestamp: new Date().toISOString()
  };
  post.comments.push(comment);
  res.json(comment);
});

app.delete("/api/posts/:postId/comments/:cid", auth, (req, res) => {
  const post = posts.find(p => p.id == req.params.postId);
  if (!post) return res.status(404).json({ error: "Not found" });
  const idx = post.comments.findIndex(c => c.id == req.params.cid && c.userId === req.userId);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  post.comments.splice(idx, 1);
  res.json({ message: "Deleted" });
});

// ─────────────────────────────
// MESSAGES
// ─────────────────────────────
app.get("/api/messages", auth, (req, res) => {
  const seen = new Map();
  [...messages].reverse().forEach(m => {
    const otherId = m.fromId === req.userId ? m.toId : m.fromId;
    if ((m.fromId === req.userId || m.toId === req.userId) && !seen.has(otherId))
      seen.set(otherId, m);
  });
  res.json([...seen.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
});

// /api/unread MUST be before /api/messages/:id so "unread" isn't parsed as :id
app.get("/api/unread", auth, (req, res) => {
  const count = messages.filter(m => m.toId === req.userId && !m.read).length;
  res.json({ count });
});

app.get("/api/messages/:id", auth, (req, res) => {
  const otherId = parseInt(req.params.id);
  const convo = messages.filter(
    m => (m.fromId === req.userId && m.toId === otherId) ||
         (m.fromId === otherId && m.toId === req.userId)
  );
  convo.forEach(m => { if (m.toId === req.userId) m.read = true; });
  res.json(convo);
});

app.post("/api/messages/:id", auth, (req, res) => {
  const msg = {
    id: nextId.message++, fromId: req.userId, toId: parseInt(req.params.id),
    text: req.body.text, timestamp: new Date().toISOString(), read: false
  };
  messages.push(msg);
  res.json(msg);
});

// ─────────────────────────────
// Catch-all: unknown /api/* → JSON 404 (never falls through to static HTML)
// ─────────────────────────────
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `Unknown API route: ${req.method} ${req.path}` });
});

// ─────────────────────────────
// Static files — registered LAST so /api/* always wins above
// ─────────────────────────────
app.use(express.static(path.join(__dirname, "Ramos")));

// ─────────────────────────────
// START SERVER
// ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🔥 VIBE running → http://localhost:${PORT}`);
});
app.all("/api/*", (req, res) => {
  res.status(404).json({
    error: `Unknown API route: ${req.method} ${req.path}`
  });
});