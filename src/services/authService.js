// src/services/authService.js
// ✅ Cross-browser / Cross-device 版（Cloudflare Worker + D1）
// ✅ 完整覆蓋用：移除 localStorage 當資料庫，改成全部打 API
// ✅ 兼容你現有 Login.jsx / FrontApp.jsx / Admin.jsx 的呼叫習慣
// ✅ 重要：修正「5 分鐘 cycleEndAt」的保存/校正/補齊（ms vs sec、缺值、刷新覆蓋等）

/* -------------------------
 * API Base
 * ------------------------- */
export const API_BASE = "https://sk-cross-device-api.yy6611345.workers.dev";

/* -------------------------
 * LocalStorage Keys (只存 session/token，不存 DB)
 * ------------------------- */
const LS_USER_TOKEN = "sk_user_token";
const LS_USER_SESS = "sk_user"; // 你專案裡常用的 key
const LS_USER_SESS_OLD = "sk_current_user"; // 舊 key 相容

const LS_ADMIN_TOKEN = "sk_admin_token";
const LS_ADMIN_SESS = "sk_admin_session_v1";

/* -------------------------
 * 5-min cycle settings
 * ------------------------- */
export const CYCLE_MS = 5 * 60 * 1000;

/* -------------------------
 * Utils
 * ------------------------- */
function safeJsonParse(raw, fallback = null) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function readJSON(key, fallback = null) {
  return safeJsonParse(localStorage.getItem(key), fallback);
}
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function del(key) {
  localStorage.removeItem(key);
}

async function readResJson(res) {
  const data = await res.json().catch(() => ({}));
  return data || {};
}

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * 把可能是「秒」的時間欄位校正成「毫秒」。
 * - 例如 1700000000 (sec) => 1700000000000 (ms)
 */
function toMs(ts) {
  const n = Number(ts || 0);
  if (!n) return 0;
  // 小於 1e12 通常是秒（ms 現在約 1.7e12）
  return n < 1e12 ? n * 1000 : n;
}

/**
 * ✅ 統一 session 結構（重點：cycleEndAt）
 * 規則：
 * 1) cycleEndAt 一律存 ms
 * 2) refresh 時如果後端沒給 cycleEndAt，保留本地舊值（避免被覆蓋成 undefined → 立刻到期）
 * 3) consume 時如果後端沒給 cycleEndAt，前端補 now+5min（非 unlimited 才補）
 */
function normalizeUserSess(nextSess, prevSess = null, { now = Date.now(), forceNewCycle = false } = {}) {
  const prev = prevSess || null;
  const next = nextSess || null;
  if (!next && !prev) return null;

  const merged = { ...(prev || {}), ...(next || {}) };

 // normalize flags / numbers
merged.unlimited = !!merged.unlimited;
merged.disabled = !!merged.disabled;

// ✅ usesLeft：轉數字 + 夾到 >= 0（避免 -1 -4）
const u = merged.usesLeft != null ? Number(merged.usesLeft) : NaN;
merged.usesLeft = Number.isFinite(u) ? Math.max(0, Math.floor(u)) : 0;

  // normalize cycleEndAt
  const prevCycleMs = toMs(prev?.cycleEndAt);
  const nextCycleMsRaw = toMs(next?.cycleEndAt);
  let cycleMs = 0;

  if (next?.cycleEndAt != null && nextCycleMsRaw) {
    cycleMs = nextCycleMsRaw;
  } else if (prevCycleMs) {
    // refresh 沒給 cycleEndAt：保留舊值
    cycleMs = prevCycleMs;
  }

  // consume：強制開新 5 分鐘（非 unlimited）
  if (forceNewCycle && !merged.unlimited) {
    cycleMs = now + CYCLE_MS;
  }

  // 寫回
  if (cycleMs) merged.cycleEndAt = cycleMs;

  return merged;
}

/* =========================
 * Cross-tab sync helpers
 * ========================= */
export function emitAuthChanged(reason = "auth_changed") {
  try {
    const key = "sk_auth_broadcast_v1";
    localStorage.setItem(key, JSON.stringify({ reason, at: Date.now(), r: Math.random() }));
  } catch {}
}
export function onAuthChanged(cb) {
  const handler = (e) => {
    const watched = new Set([
      LS_USER_TOKEN,
      LS_USER_SESS,
      LS_USER_SESS_OLD,
      LS_ADMIN_TOKEN,
      LS_ADMIN_SESS,
      "sk_auth_broadcast_v1",
    ]);
    if (!e || !watched.has(e.key)) return;
    try {
      cb({ key: e.key, newValue: e.newValue, oldValue: e.oldValue });
    } catch {}
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/* =========================================================
 * ✅ 前台：User Session (token + sess)
 * ========================================================= */
export function getUserToken() {
  return localStorage.getItem(LS_USER_TOKEN) || "";
}

export function getCurrentUser() {
  // 兼容：優先 sk_user，沒有就讀舊的 sk_current_user
  return readJSON(LS_USER_SESS, null) || readJSON(LS_USER_SESS_OLD, null);
}

export function setUserSession(token, sess) {
  const prev = getCurrentUser();
  const fixed = normalizeUserSess(sess, prev);

  localStorage.setItem(LS_USER_TOKEN, token || "");
  writeJSON(LS_USER_SESS, fixed || null);
  writeJSON(LS_USER_SESS_OLD, fixed || null); // 舊 key 相容
  emitAuthChanged("user_session_set");
}

export function logout() {
  del(LS_USER_TOKEN);
  del(LS_USER_SESS);
  del(LS_USER_SESS_OLD);
  emitAuthChanged("user_logout");
}

/**
 * ✅ 給 FrontApp 用：取得 cycleEndAt（ms）
 */
export function getCycleEndAtMs() {
  const sess = getCurrentUser();
  return toMs(sess?.cycleEndAt);
}

/**
 * ✅ 給 FrontApp 用：目前是否已過期
 */
export function isCycleExpired(now = Date.now()) {
  const sess = getCurrentUser();
  if (!sess) return true;
  if (sess.unlimited) return false;

  const endAt = toMs(sess.cycleEndAt);
  if (!endAt) return true;
  return now >= endAt;
}

/**
 * ✅ 兼容 Login.jsx：
 * - 回傳 { ok:true, user, token }
 * - 失敗回 { ok:false, msg }
 */
export async function apiLogin(id, password) {
  try {
    const { token, sess } = await userLogin(id, password);
    return { ok: true, token, user: sess };
  } catch (e) {
    return { ok: false, msg: e?.message || "login failed" };
  }
}

/**
 * ✅ 使用者登入（Worker: POST /user/login）
 * body 必須是 { username, password }
 */
export async function userLogin(idOrUsername, password) {
  const username = String(idOrUsername || "").trim();
  const pw = String(password || "").trim();
  if (!username || !pw) throw new Error("請輸入帳號與密碼");

  const res = await fetch(`${API_BASE}/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: pw }),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "帳號或密碼錯誤");

  // ✅ Worker 回傳 { token, sess }
  // 登入時不強制開 5 分鐘（由 FrontApp 決定何時 consume）
  setUserSession(data.token || "", data.sess || null);

// ✅ 登入後立刻 refresh 拉最新（確保 usesLeft / disabled / unlimited 都是最新）
try {
  const r = await refreshCurrentUserSession();
  return { token: data.token, sess: r.sess || getCurrentUser() };
} catch {
  return { token: data.token, sess: getCurrentUser() };
}
}

/**
 * ✅ 取得自己最新 session（Worker: GET /user/refresh，需要 Bearer token）
 * - deleted/disabled/unauthorized 會自動 logout
 * - 重點：refresh 回來沒帶 cycleEndAt，前端保留舊值（避免變 undefined -> 立刻到期）
 */
export async function refreshCurrentUserSession() {
  const token = getUserToken();
  const sess = getCurrentUser();
  if (!token || !sess?.id) return { ok: false, reason: "unauthorized", sess: null };

  const res = await fetch(`${API_BASE}/user/refresh`, {
    method: "GET",
    headers: { ...authHeader(token) },
  });

  const data = await readResJson(res);

  if (!res.ok) {
    logout();
    return { ok: false, reason: data.message || "unauthorized", sess: null };
  }

  // ✅ 更新本地 sess（只存 session，不是 DB）
  const latest = data.sess || null;
  const merged = normalizeUserSess(latest, sess, { now: Date.now(), forceNewCycle: false });
  setUserSession(token, merged || null);
  return { ok: true, sess: getCurrentUser() };
}

/**
 * ✅ 取得公開 user 資料（Worker: GET /user/public?id=xxx）
 */
export async function getUserPublic(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;

  const res = await fetch(`${API_BASE}/user/public?id=${encodeURIComponent(id)}`, { method: "GET" });
  const data = await readResJson(res);
  return data.user || null;
}

/**
 * ✅ 給 FrontApp 同步用（取自己：優先 refresh；沒 token 才走 public）
 */
export async function apiMe(userId) {
  const sess = getCurrentUser();
  const id = String(userId || sess?.id || "").trim();
  if (!id) return null;

  const token = getUserToken();
  if (token && sess?.id) {
    const r = await refreshCurrentUserSession();
    return r.sess || null;
  }
  return await getUserPublic(id);
}

/**
 * ✅ 扣一次使用（Worker: POST /user/consume，需要 Bearer token）
 * - 你前端「使用/繼續使用」按鈕應該呼叫它
 * - 重點：consume 後一定要開新 5 分鐘（非 unlimited 才開）
 */
export async function consumeOneUseAndRenew() {
  const token = getUserToken();
  const sess = getCurrentUser();
  if (!token || !sess?.id) throw new Error("尚未登入");

    // ✅ 先 refresh 一次，吃到後台剛更新的 usesLeft（避免按使用還是 0）
  try {
    await refreshCurrentUserSession();
  } catch {}

  const latestSess = getCurrentUser();
  const latestUses = Number.isFinite(Number(latestSess?.usesLeft)) ? Number(latestSess.usesLeft) : 0;
  if (!latestSess?.unlimited && latestUses <= 0) {
    throw new Error("次數不足，請先由後台補次數或開啟無限。");
  }

  const res = await fetch(`${API_BASE}/user/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify({}),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "consume failed");

  const now = Date.now();
  const latest = data.sess || {};
  const merged = normalizeUserSess(latest, sess, { now, forceNewCycle: true });

  setUserSession(token, merged || null);
  return getCurrentUser();
}

/* =========================================================
 * ✅ 後台：Admin Session (token + admin)
 * ========================================================= */
export function getAdminToken() {
  return localStorage.getItem(LS_ADMIN_TOKEN) || "";
}

export function getAdminSession() {
  return readJSON(LS_ADMIN_SESS, null);
}

export function adminLogout() {
  del(LS_ADMIN_TOKEN);
  del(LS_ADMIN_SESS);
  emitAuthChanged("admin_logout");
}

/**
 * ✅ 管理員登入（Worker: POST /admin/login）
 */
export async function adminLogin(id, password) {
  const adminId = String(id || "").trim();
  const pw = String(password || "").trim();
  if (!adminId || !pw) throw new Error("請輸入後台帳號與密碼");

  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: adminId, password: pw }),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "後台帳號或密碼錯誤");

  localStorage.setItem(LS_ADMIN_TOKEN, data.token || "");
  writeJSON(LS_ADMIN_SESS, data.admin || null);
  emitAuthChanged("admin_login");
  return data.admin;
}

/* -------------------- Admin 管理（superadmin 才能動） -------------------- */
export async function listAdmins() {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const res = await fetch(`${API_BASE}/admin/list`, {
    method: "GET",
    headers: { ...authHeader(token) },
  });
  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "listAdmins failed");
  return data.admins || [];
}

export async function upsertAdmin(id, payload) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const body = {
    id: String(id || payload?.id || "").trim(),
    password: String(payload?.password || "").trim(),
    name: String(payload?.name || "").trim(),
    role: payload?.role === "superadmin" ? "superadmin" : "admin",
  };

  const res = await fetch(`${API_BASE}/admin/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(body),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "upsertAdmin failed");
  return true;
}

export async function removeAdmin(id) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const res = await fetch(`${API_BASE}/admin/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify({ id: String(id || "").trim() }),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "removeAdmin failed");
  return true;
}

/* =========================================================
 * ✅ 後台：Users（admin 只能看自己建立的；super 看到全部）
 * ========================================================= */
export async function listUsers() {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const res = await fetch(`${API_BASE}/users/list`, {
    method: "GET",
    headers: { ...authHeader(token) },
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "listUsers failed");
  return data.users || [];
}

export async function upsertUser(id, payload = {}) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const body = {
    id: String(id || payload.id || "").trim(),
    password: payload.password != null ? String(payload.password).trim() : undefined,
    displayName: payload.displayName != null ? String(payload.displayName).trim() : undefined,
    usesLeft: payload.usesLeft != null ? Number(payload.usesLeft) : undefined,
    unlimited: !!payload.unlimited,
    disabled: !!payload.disabled,
    role: payload.role != null ? String(payload.role).trim() : "user",
  };

  const res = await fetch(`${API_BASE}/users/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(body),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "upsertUser failed");
  return true;
}

export async function removeUser(id) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const res = await fetch(`${API_BASE}/users/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify({ id: String(id || "").trim() }),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "removeUser failed");
  return true;
}

export async function addUses(id, n) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const res = await fetch(`${API_BASE}/users/addUses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify({ id: String(id || "").trim(), n: Number(n || 1) }),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "addUses failed");
  return true;
}

export async function setUnlimited(id) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const res = await fetch(`${API_BASE}/users/setUnlimited`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify({ id: String(id || "").trim() }),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "setUnlimited failed");
  return true;
}

/* =========================================================
 * ✅ 遊戲 config（Worker: /cfg/get /cfg/set /cfg/all）
 * ========================================================= */
export async function getRoomConfig(vendor, gameId) {
  const v = String(vendor || "").trim();
  const g = String(gameId || "").trim();
  if (!v || !g) return null;

  const res = await fetch(`${API_BASE}/cfg/get?vendor=${encodeURIComponent(v)}&gameId=${encodeURIComponent(g)}`);
  const data = await readResJson(res);
  return data.cfg || null;
}

export async function setRoomConfig(vendor, gameId, data) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const body = {
    vendor: String(vendor || "").trim(),
    gameId: String(gameId || "").trim(),
    pages: Number(data?.pages ?? 2),
    totalRooms: Number(data?.totalRooms ?? 10),
  };

  const res = await fetch(`${API_BASE}/cfg/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(body),
  });

  const j = await readResJson(res);
  if (!res.ok) throw new Error(j.message || "setRoomConfig failed");
  return true;
}

export async function getRoomConfigAll() {
  const res = await fetch(`${API_BASE}/cfg/all`);
  const data = await readResJson(res);
  return data.cfg || {};
}

/* =========================================================
 * ✅ 單房覆蓋（Worker: /override/get /override/set /override/all）
 * 結構：overrideAll[vendor][gameId][roomNo] = { rate, expireAt }
 * ========================================================= */
export async function getRoomRateOverride(vendor, gameId, roomNo) {
  const v = String(vendor || "").trim();
  const g = String(gameId || "").trim();
  const no = Number(roomNo || 0);
  if (!v || !g || !no) return null;

  const res = await fetch(
    `${API_BASE}/override/get?vendor=${encodeURIComponent(v)}&gameId=${encodeURIComponent(g)}&roomNo=${encodeURIComponent(String(no))}`
  );
  const data = await readResJson(res);
  return data.hit || null;
}

export async function getRoomRateOverrideAll() {
  const res = await fetch(`${API_BASE}/override/all`);
  const data = await readResJson(res);
  return data.all || {};
}

export async function setRoomRateOverride(vendor, gameId, roomNo, rate) {
  const token = getAdminToken();
  if (!token) throw new Error("未登入後台");

  const body = {
    vendor: String(vendor || "").trim(),
    gameId: String(gameId || "").trim(),
    roomNo: Number(roomNo || 0),
    rate: Number(rate || 93),
  };

  const res = await fetch(`${API_BASE}/override/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify(body),
  });

  const data = await readResJson(res);
  if (!res.ok) throw new Error(data.message || "setRoomRateOverride failed");
  return data.all || {};
}

/* =========================================================
 * ✅ Sync watcher（可選）：每 3 秒 refresh 一次 user sess
 * - 讓同一瀏覽器內頁面保持最新（跨瀏覽器靠後端 D1）
 * ========================================================= */
const SYNC_POLL_MS = 3000;
let __syncTimer = null;

export function startSyncWatcher(onChanged) {
  if (__syncTimer) return;
  __syncTimer = setInterval(async () => {
    try {
      const before = getCurrentUser();
      const r = await refreshCurrentUserSession();
      const after = r?.sess || null;

      const b = JSON.stringify(before || {});
      const a = JSON.stringify(after || {});
      if (b !== a) onChanged?.(after);
    } catch {}
  }, SYNC_POLL_MS);
}

export function stopSyncWatcher() {
  if (__syncTimer) clearInterval(__syncTimer);
  __syncTimer = null;
}