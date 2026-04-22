const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// serve frontend
app.use(express.static(path.join(__dirname, "Ramos")));

// ─────────────────────────────
// In-memory database
// ─────────────────────────────
let users = [];
let posts = [];
let messages = [];
let sessions = {};
let nextId = { user: 1, post: 1, comment: 1, message: 1 };

// ─────────────────────────────
// Seed Data
// ─────────────────────────────
(function seed() {
  const demo = [
    { name: "Alex Rivera", username: "alex_r", password: "1234", bio: "Living every moment ✨", color: "#FF6B6B", avatar: "AR" },
    { name: "Jamie West", username: "jamie_w", password: "1234", bio: "Photography & coffee ☕", color: "#4ECDC4", avatar: "JW" },
    { name: "Sam Kira", username: "sam_kira", password: "1234", bio: "Code, music, repeat 🎵", color: "#A78BFA", avatar: "SK" },
  ];

  demo.forEach(u =>
    users.push({ ...u, id: nextId.user++, createdAt: new Date().toISOString() })
  );

  posts = [
    {
      id: nextId.post++,
      userId: 2,
      content: "Just hit the mountains 🏔️",
      timestamp: new Date().toISOString(),
      likes: [],
      comments: []
    }
  ];
})();

// ─────────────────────────────
// Helpers
// ─────────────────────────────
const tokenGen = () => Math.random().toString(36).substring(2);
const safeUser = (u) => {
  const { password, ...safe } = u;
  return safe;
};

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
    id: nextId.user++,
    name,
    username,
    password,
    bio: "",
    avatar: name.slice(0, 2).toUpperCase(),
    color: "#FF6B6B",
    createdAt: new Date().toISOString()
  };

  users.push(user);

  const token = tokenGen();
  sessions[token] = user.id;

  res.json({ token, user: safeUser(user) });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find(
    u => u.username === username && u.password === password
  );

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

// ─────────────────────────────
// USERS
// ─────────────────────────────
app.get("/api/users", auth, (req, res) => {
  res.json(users.map(safeUser));
});

// ─────────────────────────────
// POSTS
// ─────────────────────────────
app.get("/api/posts", auth, (req, res) => {
  res.json(posts);
});

app.post("/api/posts", auth, (req, res) => {
  const post = {
    id: nextId.post++,
    userId: req.userId,
    content: req.body.content,
    timestamp: new Date().toISOString(),
    likes: [],
    comments: []
  };

  posts.unshift(post);
  res.json(post);
});

app.post("/api/posts/:id/like", auth, (req, res) => {
  const post = posts.find(p => p.id == req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });

  const idx = post.likes.indexOf(req.userId);
  if (idx === -1) post.likes.push(req.userId);
  else post.likes.splice(idx, 1);

  res.json(post);
});

// ─────────────────────────────
// MESSAGES
// ─────────────────────────────
app.get("/api/messages", auth, (req, res) => {
  const inbox = messages.filter(
    m => m.fromId === req.userId || m.toId === req.userId
  );
  res.json(inbox);
});

app.post("/api/messages/:id", auth, (req, res) => {
  const msg = {
    id: nextId.message++,
    fromId: req.userId,
    toId: parseInt(req.params.id),
    text: req.body.text,
    timestamp: new Date().toISOString()
  };

  messages.push(msg);
  res.json(msg);
});

// ─────────────────────────────
// START SERVER
// ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🔥 VIBE running → http://localhost:${PORT}`);
});