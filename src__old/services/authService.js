// src/services/authService.js
// ✅ 跨裝置版：Cloudflare Workers + D1
// ✅ 保持原本函式名稱（讓 FrontApp/Admin/Login 只需極少修改）

/* -------------------------
 * LocalStorage Keys (compat)
 * ------------------------- */
const API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787").replace(/\/$/, "");

const LS_USERS = "sk_users_v1";               // (不再當 DB 使用；保留相容)
const LS_USER_SESS = "sk_current_user";       // 前台 session（仍保留）

const LS_ADMINS = "sk_admins_v1";             // (不再當 DB 使用；保留)
const LS_ADMIN_SESS = "sk_admin_session_v1";  // 後台 session（仍保留）

const LS_GAME_CFG = "sk_game_cfg_v1";
const LS_ROOM_RATE_ALL = "sk_room_rate_all_v1";

// tokens
const LS_USER_TOKEN = "sk_user_token_v1";
const LS_ADMIN_TOKEN = "sk_admin_token_v1";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function now() {
  return Date.now();
}

function apiBase() {
  // ✅ 最終一定要有 base（避免 "" 導致 fetch('/user/login') 爆掉）
  const v = (import.meta?.env?.VITE_API_BASE || "").trim();
  return (v || API_BASE).replace(/\/$/, "");
}

async function apiFetch(path, { method = "GET", token = "", body = null } = {}) {
  const url = `${apiBase()}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* =========================================================
 * 前台：取得「使用者資料」（不含密碼）
 * ========================================================= */
export async function getUserRecordPublic(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const data = await apiFetch(`/user/public?id=${encodeURIComponent(id)}`);
  return data?.user || null;
}

/* =========================================================
 * 前台：User Session
 * ========================================================= */
export function getCurrentUser() {
  return readJSON(LS_USER_SESS, null);
}

export function logout() {
  localStorage.removeItem(LS_USER_SESS);
  localStorage.removeItem(LS_USER_TOKEN);
}

/**
 * 前台登入（async）
 */
export async function login(username, password) {
  const id = (username || "").trim();
  const pw = (password || "").trim();
  if (!id || !pw) throw new Error("請輸入帳號與密碼");

  const data = await apiFetch("/user/login", {
    method: "POST",
    body: { username: id, password: pw },
  });

  const sess = data?.sess;
  const token = data?.token;
  if (!sess || !token) throw new Error("登入失敗");

  writeJSON(LS_USER_SESS, { ...sess, loginAt: now() });
  localStorage.setItem(LS_USER_TOKEN, token);
  return getCurrentUser();
}

/**
 * ✅ 只有按「使用」才扣一次 & 續下一輪 5分鐘
 */
export async function consumeOneUseAndRenew(userId) {
  const sess = getCurrentUser();
  if (!sess || sess.id !== userId) throw new Error("尚未登入");
  const token = localStorage.getItem(LS_USER_TOKEN) || "";
  if (!token) throw new Error("尚未登入");

  const data = await apiFetch("/user/consume", {
    method: "POST",
    token,
    body: {},
  });

  const next = data?.sess;
  if (!next) throw new Error("更新失敗");

  // ✅ 保留原本 loginAt（不要每次刷新都變）
  writeJSON(LS_USER_SESS, { ...sess, ...next, loginAt: sess.loginAt || now() });
  return getCurrentUser();
}

/**
 * ✅ 前台：重新同步 session（從 server）
 */
export async function refreshCurrentUserSession() {
  const sess = getCurrentUser();
  const token = localStorage.getItem(LS_USER_TOKEN) || "";
  if (!sess?.id || !token) return { ok: false, reason: "deleted", sess: null };

  try {
    const data = await apiFetch("/user/refresh", { token });
    const next = data?.sess;
    if (!next) return { ok: false, reason: "deleted", sess: null };

    writeJSON(LS_USER_SESS, { ...sess, ...next });
    return { ok: true, sess: getCurrentUser() };
  } catch (e) {
    const msg = String(e?.message || "");
    logout();
    if (msg.includes("disabled")) return { ok: false, reason: "disabled", sess: null };
    return { ok: false, reason: "deleted", sess: null };
  }
}

/* =========================================================
 * 後台：Admin Session（前後台獨立）
 * ========================================================= */
export function getAdminSession() {
  return readJSON(LS_ADMIN_SESS, null);
}

export function adminLogout() {
  localStorage.removeItem(LS_ADMIN_SESS);
  localStorage.removeItem(LS_ADMIN_TOKEN);
}

export async function adminLogin(id, password) {
  const a = (id || "").trim();
  const p = (password || "").trim();
  if (!a || !p) throw new Error("請輸入後台帳號與密碼");

  const data = await apiFetch("/admin/login", {
    method: "POST",
    body: { id: a, password: p },
  });

  const admin = data?.admin;
  const token = data?.token;
  if (!admin || !token) throw new Error("登入失敗");

  const sess = { id: admin.id, name: admin.name, role: admin.role, loginAt: now() };
  writeJSON(LS_ADMIN_SESS, sess);
  localStorage.setItem(LS_ADMIN_TOKEN, token);
  return sess;
}

export async function listAdmins() {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  const data = await apiFetch("/admin/list", { token });
  return data?.admins || [];
}

export async function upsertAdmin(id, payload) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  await apiFetch("/admin/upsert", {
    method: "POST",
    token,
    body: { id, password: payload?.password, name: payload?.name, role: payload?.role },
  });
  return true;
}

export async function removeAdmin(id) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  await apiFetch("/admin/remove", { method: "POST", token, body: { id } });
  return true;
}

/* =========================================================
 * 後台：Users
 * ========================================================= */
export async function listUsers() {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  const data = await apiFetch("/users/list", { token });
  return data?.users || [];
}

export async function upsertUser(id, payload) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  await apiFetch("/users/upsert", { method: "POST", token, body: { id, ...payload } });
  return true;
}

export async function removeUser(id) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  await apiFetch("/users/remove", { method: "POST", token, body: { id } });
  return true;
}

export async function addUses(id, n) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  await apiFetch("/users/addUses", { method: "POST", token, body: { id, n } });
  return true;
}

export async function setUnlimited(id) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  await apiFetch("/users/setUnlimited", { method: "POST", token, body: { id } });
  return true;
}

/* =========================================================
 * 遊戲基礎 config
 * ========================================================= */
export async function getRoomConfig(vendor, gameId) {
  const v = String(vendor || "").trim();
  const g = String(gameId || "").trim();
  if (!v || !g) return null;
  const data = await apiFetch(`/cfg/get?vendor=${encodeURIComponent(v)}&gameId=${encodeURIComponent(g)}`);
  return data?.cfg || null;
}

export async function setRoomConfig(vendor, gameId, data) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");
  await apiFetch("/cfg/set", { method: "POST", token, body: { vendor, gameId, ...data } });
  return true;
}

export async function getRoomConfigAll() {
  const data = await apiFetch("/cfg/all");
  writeJSON(LS_GAME_CFG, data?.cfg || {});
  return data?.cfg || {};
}

/* =========================================================
 * 單房大獎中獎率覆蓋（全量結構）
 * ========================================================= */
export async function getRoomRateOverrideAll() {
  const data = await apiFetch("/override/all");
  const all = data?.all || {};
  writeJSON(LS_ROOM_RATE_ALL, all);
  return all;
}

export async function saveRoomRateOverrideAll(all) {
  writeJSON(LS_ROOM_RATE_ALL, all || {});
  return true;
}

export async function setRoomRateOverride(vendor, gameId, roomNo, rate) {
  const token = localStorage.getItem(LS_ADMIN_TOKEN) || "";
  if (!token) throw new Error("未登入後台");

  const data = await apiFetch("/override/set", {
    method: "POST",
    token,
    body: { vendor, gameId, roomNo, rate },
  });

  const all = data?.all || {};
  writeJSON(LS_ROOM_RATE_ALL, all);
  return all;
}

export async function getRoomRateOverride(vendor, gameId, roomNo) {
  const v = String(vendor || "").trim();
  const g = String(gameId || "").trim();
  const no = parseInt(String(roomNo || ""), 10);
  if (!v || !g || !Number.isFinite(no)) return null;

  const data = await apiFetch(
    `/override/get?vendor=${encodeURIComponent(v)}&gameId=${encodeURIComponent(g)}&roomNo=${encodeURIComponent(String(no))}`
  );
  return data?.hit || null;
}

// 兼容：避免 tree-shake / lint 認為未用
void LS_USERS; void LS_ADMINS;