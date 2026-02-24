// src/services/authService.js
// ✅ 純前端 localStorage 版（無後端）
// ✅ 前台登入與後台登入是「完全獨立」的 session

/* -------------------------
 * LocalStorage Keys
 * ------------------------- */
const LS_USERS = "sk_users_v1";               // 使用者資料庫
const LS_USER_SESS = "sk_current_user";       // 前台登入 session

const LS_ADMINS = "sk_admins_v1";             // 管理員資料庫
const LS_ADMIN_SESS = "sk_admin_session_v1";  // 後台登入 session

const LS_GAME_CFG = "sk_game_cfg_v1";         // 遊戲基礎設定：pages/totalRooms

// ✅ 改成「全量覆蓋」結構：overrideAll[vendor][gameId][roomNo] = { rate, expireAt }
const LS_ROOM_RATE_ALL = "sk_room_rate_all_v1"; // 單房覆蓋（全量結構）

/* -------------------------
 * Utils
 * ------------------------- */
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
function fiveMinMs() {
  return 5 * 60 * 1000;
}
function clampInt(n, min, max) {
  const v = parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function ensureSeed() {
  // admins seed
  const admins = readJSON(LS_ADMINS, null);
  if (!admins || !Array.isArray(admins) || admins.length === 0) {
    // ✅ 你可自己改預設超管帳密
    const seed = [
      { id: "super", password: "super123", name: "Super Admin", role: "superadmin", createdAt: now() },
      { id: "admin1", password: "admin123", name: "Admin 1", role: "admin", createdAt: now() },
    ];
    writeJSON(LS_ADMINS, seed);
  }

  // users seed（可留空）
  const users = readJSON(LS_USERS, null);
  if (!users || typeof users !== "object") {
    writeJSON(LS_USERS, {}); // { [id]: userObj }
  }

  // cfg seed
  const cfg = readJSON(LS_GAME_CFG, null);
  if (!cfg || typeof cfg !== "object") writeJSON(LS_GAME_CFG, {});

  const rrAll = readJSON(LS_ROOM_RATE_ALL, null);
  if (!rrAll || typeof rrAll !== "object") writeJSON(LS_ROOM_RATE_ALL, {});
}
ensureSeed();

/* =========================================================
 * ✅ 前台：取得「使用者資料庫」中的 user（不含密碼）
 * - 用來讓前台即時感知：停用/刪除/次數變動/cycleEndAt
 * ========================================================= */
export function getUserRecordPublic(userId) {
  const db = readJSON(LS_USERS, {});
  const u = db?.[String(userId || "").trim()];
  if (!u) return null;
  // eslint-disable-next-line no-unused-vars
  const { password, ...rest } = u;
  return rest;
}

/* =========================================================
 * 前台：User Session
 * ========================================================= */
export function getCurrentUser() {
  return readJSON(LS_USER_SESS, null);
}

export function logout() {
  localStorage.removeItem(LS_USER_SESS);
}

/**
 * ✅ 修正 BUG#1：登入不重置 5 分鐘
 * - cycleEndAt 改存到「使用者資料庫」(LS_USERS) 的 user 欄位
 * - 登入時：
 *   - 若 user.cycleEndAt 還沒到：沿用（剩多少就多少）
 *   - 若已到/沒有：建立新的 now+5min 並寫回 user
 */
export function login(username, password) {
  const id = (username || "").trim();
  const pw = (password || "").trim();
  if (!id || !pw) throw new Error("請輸入帳號與密碼");

  const users = readJSON(LS_USERS, {});
  const u = users[id];

  if (!u) throw new Error("帳號或密碼錯誤");
  if (u.password !== pw) throw new Error("帳號或密碼錯誤");
  if (u.disabled) throw new Error("帳號已停用");

  // ✅ cycleEndAt 固定從首次登入開始算，不因登出而重置
  let cycleEndAt = Number.isFinite(u.cycleEndAt) ? u.cycleEndAt : 0;
  if (!cycleEndAt || Date.now() >= cycleEndAt) {
    cycleEndAt = Date.now() + fiveMinMs();
    u.cycleEndAt = cycleEndAt;
    u.updatedAt = now();
    users[id] = u;
    writeJSON(LS_USERS, users);
  }

  const usesLeft = Number.isFinite(u.usesLeft) ? u.usesLeft : 0;
  const unlimited = !!u.unlimited;

  const sess = {
    id: u.id,
    displayName: u.displayName || u.id,
    role: "user",
    disabled: !!u.disabled,
    usesLeft,
    unlimited,
    cycleEndAt,       // ✅ 來源改為 user DB
    loginAt: now(),
  };

  writeJSON(LS_USER_SESS, sess);
  return sess;
}

/* =========================================================
 * 前台：次數消耗 + 續 5 分鐘
 * ✅ 只有按「使用」才扣一次 & 續下一輪 5分鐘
 * ========================================================= */
export function consumeOneUseAndRenew(userId) {
  const sess = getCurrentUser();
  if (!sess || sess.id !== userId) throw new Error("尚未登入");

  // ✅ 以使用者資料庫為準（可即時反映停用/刪除）
  const users = readJSON(LS_USERS, {});
  const u = users[userId];
  if (!u) throw new Error("帳號已被刪除");
  if (u.disabled) throw new Error("帳號已停用");

  // unlimited 不扣
  if (!u.unlimited) {
    const usesLeft = Number.isFinite(u.usesLeft) ? u.usesLeft : 0;
    if (usesLeft <= 0) throw new Error("剩餘次數不足");
    u.usesLeft = usesLeft - 1;
  }

  // ✅ 續下一輪 5分鐘（寫回 user DB，避免登出重置）
  u.cycleEndAt = now() + fiveMinMs();
  u.updatedAt = now();
  users[userId] = u;
  writeJSON(LS_USERS, users);

  // 同步 session
  sess.usesLeft = Number.isFinite(u.usesLeft) ? u.usesLeft : 0;
  sess.unlimited = !!u.unlimited;
  sess.disabled = !!u.disabled;
  sess.cycleEndAt = u.cycleEndAt;

  writeJSON(LS_USER_SESS, sess);
  return sess;
}

/**
 * ✅ 前台：重新同步 session（從 users DB）
 * - 用於 FrontApp 每秒監控：停用/刪除/次數/cycleEndAt
 * 回傳：
 *   { ok:true, sess }
 *   { ok:false, reason:'disabled'|'deleted', sess:null }
 */
export function refreshCurrentUserSession() {
  const sess = getCurrentUser();
  if (!sess?.id) return { ok: false, reason: "deleted", sess: null };

  const users = readJSON(LS_USERS, {});
  const u = users[sess.id];
  if (!u) {
    localStorage.removeItem(LS_USER_SESS);
    return { ok: false, reason: "deleted", sess: null };
  }
  if (u.disabled) {
    // 保留 session 讓前台可顯示資訊，但會被 UI 強制登出
    sess.disabled = true;
    writeJSON(LS_USER_SESS, sess);
    return { ok: false, reason: "disabled", sess: null };
  }

  // ✅ 同步欄位（重要：cycleEndAt 不被登入重置）
  sess.displayName = u.displayName || u.id;
  sess.usesLeft = Number.isFinite(u.usesLeft) ? u.usesLeft : 0;
  sess.unlimited = !!u.unlimited;
  sess.disabled = !!u.disabled;
  sess.cycleEndAt = Number.isFinite(u.cycleEndAt) ? u.cycleEndAt : (sess.cycleEndAt || 0);

  writeJSON(LS_USER_SESS, sess);
  return { ok: true, sess };
}

/* =========================================================
 * 後台：Admin Session（前後台獨立）
 * ========================================================= */
export function getAdminSession() {
  return readJSON(LS_ADMIN_SESS, null);
}

export function adminLogout() {
  localStorage.removeItem(LS_ADMIN_SESS);
}

export function adminLogin(id, password) {
  const a = (id || "").trim();
  const p = (password || "").trim();
  if (!a || !p) throw new Error("請輸入後台帳號與密碼");

  const admins = readJSON(LS_ADMINS, []);
  const found = admins.find((x) => x.id === a && x.password === p);
  if (!found) throw new Error("後台帳號或密碼錯誤");

  const sess = { id: found.id, name: found.name, role: found.role, loginAt: now() };
  writeJSON(LS_ADMIN_SESS, sess);
  return sess;
}

export function listAdmins() {
  const admins = readJSON(LS_ADMINS, []);
  return admins.map(({ password, ...rest }) => rest);
}

export function upsertAdmin(id, payload) {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");
  if (sess.role !== "superadmin") throw new Error("只有超級管理員可新增管理員");

  const a = (id || "").trim();
  const pw = (payload?.password || "").trim();
  const name = (payload?.name || "").trim();
  if (!a || !pw || !name) throw new Error("請輸入管理員帳號/密碼/名稱");

  const admins = readJSON(LS_ADMINS, []);
  const existsIdx = admins.findIndex((x) => x.id === a);
  const record = {
    id: a,
    password: pw,
    name,
    role: payload?.role === "admin" ? "admin" : "admin",
    createdAt: now(),
  };
  if (existsIdx >= 0) admins[existsIdx] = { ...admins[existsIdx], ...record };
  else admins.push(record);

  writeJSON(LS_ADMINS, admins);
  return true;
}

export function removeAdmin(id) {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");
  if (sess.role !== "superadmin") throw new Error("只有超級管理員可刪除管理員");
  const a = (id || "").trim();
  const admins = readJSON(LS_ADMINS, []);
  writeJSON(LS_ADMINS, admins.filter((x) => x.id !== a));
  return true;
}

/* =========================================================
 * 後台：Users（admin 只能看自己建立的；super 看全部）
 * ========================================================= */
export function listUsers() {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");

  const db = readJSON(LS_USERS, {});
  const all = Object.values(db).map(({ password, ...rest }) => rest);

  if (sess.role === "superadmin") return all;
  return all.filter((u) => u.createdBy === sess.id);
}

export function upsertUser(id, payload) {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");

  const uId = (id || "").trim();
  const pw = payload?.password != null ? String(payload.password).trim() : null;
  const displayName = payload?.displayName != null ? String(payload.displayName).trim() : null;

  if (!uId) throw new Error("缺少使用者帳號");

  const db = readJSON(LS_USERS, {});
  const existing = db[uId];

  // ✅ admin 只能改自己建立的使用者；super 可改全部
  if (existing && sess.role !== "superadmin" && existing.createdBy !== sess.id) {
    throw new Error("無權限操作此使用者");
  }

  const record = {
    id: uId,
    displayName: displayName ?? existing?.displayName ?? uId,
    password: pw ?? existing?.password ?? "",
    role: "user",
    disabled: payload?.disabled != null ? !!payload.disabled : !!existing?.disabled,
    unlimited: payload?.unlimited != null ? !!payload.unlimited : !!existing?.unlimited,
    usesLeft:
      payload?.usesLeft != null
        ? clampInt(payload.usesLeft, 0, 999999)
        : Number.isFinite(existing?.usesLeft)
          ? existing.usesLeft
          : 0,

    // ✅ 關鍵：cycleEndAt 存在 user DB（修 BUG#1）
    cycleEndAt: Number.isFinite(existing?.cycleEndAt) ? existing.cycleEndAt : 0,

    createdBy: existing?.createdBy ?? sess.id,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };

  if (!existing) {
    if (!record.password) throw new Error("新使用者必須有密碼");
    if (!record.displayName) throw new Error("新使用者必須有名稱");
  }

  db[uId] = record;
  writeJSON(LS_USERS, db);
  return true;
}

export function removeUser(id) {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");
  const uId = (id || "").trim();

  const db = readJSON(LS_USERS, {});
  const existing = db[uId];
  if (!existing) return true;

  if (sess.role !== "superadmin" && existing.createdBy !== sess.id) {
    throw new Error("無權限刪除此使用者");
  }

  delete db[uId];
  writeJSON(LS_USERS, db);
  return true;
}

export function addUses(id, n) {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");
  const uId = (id || "").trim();

  const db = readJSON(LS_USERS, {});
  const u = db[uId];
  if (!u) throw new Error("使用者不存在");

  if (sess.role !== "superadmin" && u.createdBy !== sess.id) {
    throw new Error("無權限操作此使用者");
  }

  const add = clampInt(n, 1, 100);
  u.usesLeft = (Number.isFinite(u.usesLeft) ? u.usesLeft : 0) + add;
  u.unlimited = false;
  u.updatedAt = now();
  db[uId] = u;
  writeJSON(LS_USERS, db);
  return true;
}

export function setUnlimited(id) {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");
  const uId = (id || "").trim();

  const db = readJSON(LS_USERS, {});
  const u = db[uId];
  if (!u) throw new Error("使用者不存在");

  if (sess.role !== "superadmin" && u.createdBy !== sess.id) {
    throw new Error("無權限操作此使用者");
  }

  u.unlimited = true;
  u.updatedAt = now();
  db[uId] = u;
  writeJSON(LS_USERS, db);
  return true;
}

/* =========================================================
 * 遊戲基礎 config（pages/totalRooms）
 * key: vendor|gameId
 * ========================================================= */
function cfgKey(vendor, gameId) {
  return `${vendor}|${gameId}`;
}

export function getRoomConfig(vendor, gameId) {
  const cfg = readJSON(LS_GAME_CFG, {});
  return cfg[cfgKey(vendor, gameId)] || null;
}

export function setRoomConfig(vendor, gameId, data) {
  const sess = getAdminSession();
  if (!sess?.id) throw new Error("未登入後台");

  const cfg = readJSON(LS_GAME_CFG, {});
  cfg[cfgKey(vendor, gameId)] = {
    pages: clampInt(data?.pages, 1, 20),
    totalRooms: clampInt(data?.totalRooms, 1, 5000),
    updatedAt: now(),
    updatedBy: sess.id,
  };
  writeJSON(LS_GAME_CFG, cfg);
  return true;
}

export function getRoomConfigAll() {
  return readJSON(LS_GAME_CFG, {});
}

/* =========================================================
 * ✅ 單房大獎中獎率覆蓋（真正 3 分鐘 TTL）
 * overrideAll[vendor][gameId][roomNo] = { rate, expireAt }
 * ========================================================= */
function cleanupExpiredInPlace(all) {
  const t = Date.now();
  if (!all || typeof all !== "object") return all;

  for (const vendor of Object.keys(all)) {
    const vg = all[vendor];
    if (!vg || typeof vg !== "object") { delete all[vendor]; continue; }

    for (const gameId of Object.keys(vg)) {
      const gm = vg[gameId];
      if (!gm || typeof gm !== "object") { delete vg[gameId]; continue; }

      for (const roomNo of Object.keys(gm)) {
        const v = gm[roomNo];
        if (!v || typeof v !== "object") { delete gm[roomNo]; continue; }
        if (v.expireAt && t >= Number(v.expireAt)) delete gm[roomNo];
      }

      if (Object.keys(gm).length === 0) delete vg[gameId];
    }

    if (Object.keys(vg).length === 0) delete all[vendor];
  }
  return all;
}

export function getRoomRateOverrideAll() {
  const all = readJSON(LS_ROOM_RATE_ALL, {});
  const cleaned = cleanupExpiredInPlace(all || {});
  writeJSON(LS_ROOM_RATE_ALL, cleaned);
  return cleaned;
}

export function saveRoomRateOverrideAll(all) {
  const cleaned = cleanupExpiredInPlace(all || {});
  writeJSON(LS_ROOM_RATE_ALL, cleaned);
  return true;
}

export function setRoomRateOverride(vendor, gameId, roomNo, rate) {
  const v = String(vendor || "").trim();
  const g = String(gameId || "").trim();
  const no = clampInt(roomNo, 1, 999999);
  const r = clampInt(rate, 1, 99);
  if (!v || !g) throw new Error("缺少 vendor/gameId");

  const all = getRoomRateOverrideAll();
  all[v] ??= {};
  all[v][g] ??= {};
  all[v][g][String(no)] = {
    rate: Number(r),
    expireAt: Date.now() + 180000, // ✅ 固定 3分鐘後失效
    updatedAt: Date.now(),
  };

  saveRoomRateOverrideAll(all);
  return all;
}

export function getRoomRateOverride(vendor, gameId, roomNo) {
  const v = String(vendor || "").trim();
  const g = String(gameId || "").trim();
  const no = clampInt(roomNo, 1, 999999);

  const all = getRoomRateOverrideAll();
  const hit = all?.[v]?.[g]?.[String(no)] || null;
  if (!hit) return null;

  if (hit.expireAt && Date.now() >= Number(hit.expireAt)) return null;
  return hit;
}