export interface Env {
  DB: D1Database;
  SUPERADMIN_ID: string;
  SUPERADMIN_PW: string;
  ADMIN1_ID: string;
  ADMIN1_PW: string;
  JWT_SECRET: string;
  ALLOW_ORIGINS: string;
}

type Role = "superadmin" | "admin";
type Json = Record<string, any>;

function json(data: Json, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function corsHeaders(env: Env, req: Request) {
  const allow = env.ALLOW_ORIGINS || "*";
  const origin = req.headers.get("Origin") || "";
  return {
    "access-control-allow-origin": allow === "*" ? "*" : origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-max-age": "86400",
  } as Record<string, string>;
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(hash));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(key: string, msg: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return new Uint8Array(sig);
}

async function jwtSign(payload: Json, secret: string, expSec: number) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expSec };

  const encHeader = b64url(new TextEncoder().encode(JSON.stringify(header)));
  const encBody = b64url(new TextEncoder().encode(JSON.stringify(body)));
  const msg = `${encHeader}.${encBody}`;
  const sig = await hmacSha256(secret, msg);
  return `${msg}.${b64url(sig)}`;
}

async function jwtVerify(token: string, secret: string): Promise<Json | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const msg = `${h}.${p}`;
  const sig = await hmacSha256(secret, msg);
  const expect = b64url(sig);
  if (expect !== s) return null;

  const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) as Json;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;
  return payload;
}

function getBearer(req: Request) {
  const a = req.headers.get("Authorization") || "";
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function requireAdmin(env: Env, req: Request): Promise<Json | null> {
  const token = getBearer(req);
  if (!token) return null;
  const payload = await jwtVerify(token, env.JWT_SECRET);
  if (!payload) return null;
  if (payload.type !== "admin") return null;
  return payload;
}

async function requireUser(env: Env, req: Request): Promise<Json | null> {
  const token = getBearer(req);
  if (!token) return null;
  const payload = await jwtVerify(token, env.JWT_SECRET);
  if (!payload) return null;
  if (payload.type !== "user") return null;
  return payload;
}

async function initSchema(env: Env) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        pw_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        uses_left INTEGER NOT NULL DEFAULT 0,
        unlimited INTEGER NOT NULL DEFAULT 0,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_by_admin TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),

    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        pw_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),

    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS game_cfg (
        vendor TEXT NOT NULL,
        game_id TEXT NOT NULL,
        pages INTEGER NOT NULL DEFAULT 2,
        total_rooms INTEGER NOT NULL DEFAULT 10,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (vendor, game_id)
      )
    `),

    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS room_override (
        vendor TEXT NOT NULL,
        game_id TEXT NOT NULL,
        room_no INTEGER NOT NULL,
        rate INTEGER NOT NULL,
        expire_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (vendor, game_id, room_no)
      )
    `),
  ]);
}

async function seedAdmins(env: Env) {
  const now = Date.now();

  async function ensure(id: string, pw: string, name: string, role: Role) {
    const existing = await env.DB.prepare("SELECT id FROM admins WHERE id=?").bind(id).first();
    if (existing) return;
    const pw_hash = await sha256Hex(pw);
    await env.DB.prepare(
      "INSERT INTO admins (id,pw_hash,name,role,created_at,updated_at) VALUES (?,?,?,?,?,?)"
    )
      .bind(id, pw_hash, name, role, now, now)
      .run();
  }

  await ensure(env.SUPERADMIN_ID || "super", env.SUPERADMIN_PW || "super123", "Super Admin", "superadmin");
  await ensure(env.ADMIN1_ID || "admin1", env.ADMIN1_PW || "admin123", "Admin #1", "admin");
}

function normalizeInt(n: any, min: number, max: number, fallback: number) {
  const v = parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

async function cleanupOverrides(env: Env) {
  const t = Date.now();
  await env.DB.prepare("DELETE FROM room_override WHERE expire_at <= ?").bind(t).run();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const cors = corsHeaders(env, req);

    // ✅ OPTIONS
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // ✅ 先止血：/ 和 favicon 不要跑 DB，不要跑任何流程
    if (req.method === "GET" && (path === "/" || path === "/favicon.ico")) {
      return new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // ✅ Health 也不用碰 DB（避免你現在的 duration 錯誤又被觸發）
    if (req.method === "GET" && path === "/health") {
      return json({ ok: true, ts: Date.now() }, 200, cors);
    }

    try {
      // ✅ 只有真的打 API 時才初始化 DB
      await initSchema(env);
      await seedAdmins(env);

      // lightweight cleanup each request (room_override 量很小)
      if (path.startsWith("/override")) {
        await cleanupOverrides(env);
      }

      // -------------------- Admin login --------------------
      if (path === "/admin/login" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as Json;
        const id = String(body.id || "").trim();
        const pw = String(body.password || "").trim();
        if (!id || !pw) return json({ message: "missing" }, 400, cors);

        const row = await env.DB.prepare("SELECT id,pw_hash,name,role FROM admins WHERE id=?").bind(id).first();
        if (!row) return json({ message: "帳號或密碼錯誤" }, 401, cors);
        const pw_hash = await sha256Hex(pw);
        if (pw_hash !== (row as any).pw_hash) return json({ message: "帳號或密碼錯誤" }, 401, cors);

        const token = await jwtSign({ type: "admin", id: (row as any).id, role: (row as any).role }, env.JWT_SECRET, 60 * 60 * 24);
        return json(
          { token, admin: { id: (row as any).id, name: (row as any).name, role: (row as any).role } },
          200,
          cors
        );
      }

      // -------------------- Admin list / upsert / remove --------------------
      if (path === "/admin/list" && req.method === "GET") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const rows = await env.DB.prepare("SELECT id,name,role,created_at,updated_at FROM admins ORDER BY role DESC, id ASC").all();
        return json({ admins: rows.results }, 200, cors);
      }

      if (path === "/admin/upsert" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);
        if (auth.role !== "superadmin") return json({ message: "forbidden" }, 403, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const id = String(body.id || "").trim();
        const pw = String(body.password || "").trim();
        const name = String(body.name || "").trim() || id;
        const role = (String(body.role || "admin") as Role) === "superadmin" ? "superadmin" : "admin";
        if (!id || !pw) return json({ message: "missing" }, 400, cors);

        const now = Date.now();
        const pw_hash = await sha256Hex(pw);
        await env.DB.prepare(
          `INSERT INTO admins (id,pw_hash,name,role,created_at,updated_at)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET pw_hash=excluded.pw_hash, name=excluded.name, role=excluded.role, updated_at=excluded.updated_at`
        )
          .bind(id, pw_hash, name, role, now, now)
          .run();

        return json({ ok: true }, 200, cors);
      }

      if (path === "/admin/remove" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);
        if (auth.role !== "superadmin") return json({ message: "forbidden" }, 403, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const id = String(body.id || "").trim();
        if (!id) return json({ message: "missing" }, 400, cors);
        if (id === auth.id) return json({ message: "cannot remove self" }, 400, cors);

        await env.DB.prepare("DELETE FROM admins WHERE id=?").bind(id).run();
        return json({ ok: true }, 200, cors);
      }

      // -------------------- Users --------------------
      if (path === "/users/list" && req.method === "GET") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        let q =
          "SELECT id,display_name as displayName,role,uses_left as usesLeft,unlimited,disabled,created_by_admin as createdBy FROM users";
        const binds: any[] = [];
        if (auth.role !== "superadmin") {
          q += " WHERE created_by_admin=?";
          binds.push(auth.id);
        }
        q += " ORDER BY updated_at DESC";

        const rows = await env.DB.prepare(q).bind(...binds).all();
        const users = rows.results.map((r: any) => ({ ...r, unlimited: !!r.unlimited, disabled: !!r.disabled }));
        return json({ users }, 200, cors);
      }

      if (path === "/users/upsert" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const id = String(body.id || "").trim();
        if (!id) return json({ message: "missing" }, 400, cors);

        if (auth.role !== "superadmin") {
          const owner = await env.DB.prepare("SELECT created_by_admin as createdBy FROM users WHERE id=?").bind(id).first();
          if (owner && (owner as any).createdBy !== auth.id) return json({ message: "forbidden" }, 403, cors);
        }

        const now = Date.now();
        const displayName = String(body.displayName || body.display_name || "").trim() || id;
        const disabled = body.disabled ? 1 : 0;
        const unlimited = body.unlimited ? 1 : 0;
        const role = String(body.role || "user").trim() || "user";
        const usesLeft = normalizeInt(body.usesLeft, 0, 999999, 0);
        const password = body.password ? String(body.password).trim() : "";

        const exists = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(id).first();
        if (!exists) {
          if (!password) return json({ message: "password required" }, 400, cors);
          const pw_hash = await sha256Hex(password);
          await env.DB.prepare(
            `INSERT INTO users (id,pw_hash,display_name,role,uses_left,unlimited,disabled,created_by_admin,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)`
          )
            .bind(id, pw_hash, displayName, role, usesLeft, unlimited, disabled, auth.id, now, now)
            .run();
        } else {
          if (password) {
            const pw_hash = await sha256Hex(password);
            await env.DB.prepare(
              `UPDATE users SET pw_hash=?, display_name=?, role=?, uses_left=?, unlimited=?, disabled=?, updated_at=? WHERE id=?`
            )
              .bind(pw_hash, displayName, role, usesLeft, unlimited, disabled, now, id)
              .run();
          } else {
            await env.DB.prepare(
              `UPDATE users SET display_name=?, role=?, uses_left=?, unlimited=?, disabled=?, updated_at=? WHERE id=?`
            )
              .bind(displayName, role, usesLeft, unlimited, disabled, now, id)
              .run();
          }
        }

        return json({ ok: true }, 200, cors);
      }

      if (path === "/users/remove" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const id = String(body.id || "").trim();
        if (!id) return json({ message: "missing" }, 400, cors);

        if (auth.role !== "superadmin") {
          const owner = await env.DB.prepare("SELECT created_by_admin as createdBy FROM users WHERE id=?").bind(id).first();
          if (owner && (owner as any).createdBy !== auth.id) return json({ message: "forbidden" }, 403, cors);
        }

        await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();
        return json({ ok: true }, 200, cors);
      }

      if (path === "/users/addUses" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const id = String(body.id || "").trim();
        const n = normalizeInt(body.n, 1, 100000, 1);
        if (!id) return json({ message: "missing" }, 400, cors);

        if (auth.role !== "superadmin") {
          const owner = await env.DB.prepare("SELECT created_by_admin as createdBy FROM users WHERE id=?").bind(id).first();
          if (owner && (owner as any).createdBy !== auth.id) return json({ message: "forbidden" }, 403, cors);
        }

        await env.DB.prepare("UPDATE users SET uses_left = uses_left + ?, updated_at=? WHERE id=?").bind(n, Date.now(), id).run();
        return json({ ok: true }, 200, cors);
      }

      if (path === "/users/setUnlimited" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const id = String(body.id || "").trim();
        if (!id) return json({ message: "missing" }, 400, cors);

        if (auth.role !== "superadmin") {
          const owner = await env.DB.prepare("SELECT created_by_admin as createdBy FROM users WHERE id=?").bind(id).first();
          if (owner && (owner as any).createdBy !== auth.id) return json({ message: "forbidden" }, 403, cors);
        }

        await env.DB.prepare("UPDATE users SET unlimited=1, updated_at=? WHERE id=?").bind(Date.now(), id).run();
        return json({ ok: true }, 200, cors);
      }

      // -------------------- User public / login / refresh / consume --------------------
      if (path === "/user/public" && req.method === "GET") {
        const id = String(url.searchParams.get("id") || "").trim();
        if (!id) return json({ user: null }, 200, cors);
        const row = await env.DB.prepare(
          "SELECT id,display_name as displayName,role,uses_left as usesLeft,unlimited,disabled FROM users WHERE id=?"
        ).bind(id).first();
        if (!row) return json({ user: null }, 200, cors);
        const user = { ...(row as any), unlimited: !!(row as any).unlimited, disabled: !!(row as any).disabled };
        return json({ user }, 200, cors);
      }

      if (path === "/user/login" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as Json;
        const username = String(body.username || "").trim();
        const password = String(body.password || "").trim();
        if (!username || !password) return json({ message: "missing" }, 400, cors);

        const row = await env.DB.prepare(
          "SELECT id,pw_hash,display_name as displayName,role,uses_left as usesLeft,unlimited,disabled FROM users WHERE id=?"
        ).bind(username).first();
        if (!row) return json({ message: "帳號或密碼錯誤" }, 401, cors);
        const pw_hash = await sha256Hex(password);
        if (pw_hash !== (row as any).pw_hash) return json({ message: "帳號或密碼錯誤" }, 401, cors);
        if ((row as any).disabled) return json({ message: "disabled" }, 403, cors);

        const token = await jwtSign({ type: "user", id: (row as any).id }, env.JWT_SECRET, 60 * 60 * 24 * 30);
        const sess = {
          id: (row as any).id,
          displayName: (row as any).displayName,
          role: (row as any).role,
          usesLeft: (row as any).usesLeft,
          unlimited: !!(row as any).unlimited,
          disabled: !!(row as any).disabled,
          cycleEndAt: 0,
        };
        return json({ token, sess }, 200, cors);
      }

      if (path === "/user/refresh" && req.method === "GET") {
        const auth = await requireUser(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const row = await env.DB.prepare(
          "SELECT id,display_name as displayName,role,uses_left as usesLeft,unlimited,disabled FROM users WHERE id=?"
        ).bind(auth.id).first();
        if (!row) return json({ message: "deleted" }, 404, cors);
        if ((row as any).disabled) return json({ message: "disabled" }, 403, cors);

        const sess = {
          id: (row as any).id,
          displayName: (row as any).displayName,
          role: (row as any).role,
          usesLeft: (row as any).usesLeft,
          unlimited: !!(row as any).unlimited,
          disabled: !!(row as any).disabled,
        };
        return json({ sess }, 200, cors);
      }

      if (path === "/user/consume" && req.method === "POST") {
        const auth = await requireUser(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const row = await env.DB.prepare("SELECT uses_left as usesLeft, unlimited, disabled FROM users WHERE id=?").bind(auth.id).first();
        if (!row) return json({ message: "deleted" }, 404, cors);
        if ((row as any).disabled) return json({ message: "disabled" }, 403, cors);

        const unlimited = !!(row as any).unlimited;
        const usesLeft = (row as any).usesLeft as number;

        if (!unlimited) {
          if (usesLeft <= 0) return json({ message: "no_uses" }, 403, cors);
          await env.DB.prepare("UPDATE users SET uses_left = uses_left - 1, updated_at=? WHERE id=?").bind(Date.now(), auth.id).run();
        }

        const row2 = await env.DB.prepare(
          "SELECT id,display_name as displayName,role,uses_left as usesLeft,unlimited,disabled FROM users WHERE id=?"
        ).bind(auth.id).first();
        const sess = {
          id: (row2 as any).id,
          displayName: (row2 as any).displayName,
          role: (row2 as any).role,
          usesLeft: (row2 as any).usesLeft,
          unlimited: !!(row2 as any).unlimited,
          disabled: !!(row2 as any).disabled,
        };
        return json({ sess }, 200, cors);
      }

      // -------------------- Game config --------------------
      if (path === "/cfg/get" && req.method === "GET") {
        const vendor = String(url.searchParams.get("vendor") || "").trim();
        const gameId = String(url.searchParams.get("gameId") || "").trim();
        if (!vendor || !gameId) return json({ cfg: null }, 200, cors);

        const row = await env.DB.prepare(
          "SELECT vendor,game_id as gameId,pages,total_rooms as totalRooms,updated_at as updatedAt FROM game_cfg WHERE vendor=? AND game_id=?"
        )
          .bind(vendor, gameId)
          .first();
        if (!row) return json({ cfg: { vendor, gameId, pages: 2, totalRooms: 10 } }, 200, cors);
        return json({ cfg: row }, 200, cors);
      }

      if (path === "/cfg/set" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const vendor = String(body.vendor || "").trim();
        const gameId = String(body.gameId || "").trim();
        const pages = normalizeInt(body.pages, 1, 50, 2);
        const totalRooms = normalizeInt(body.totalRooms, 1, 99999, 10);
        if (!vendor || !gameId) return json({ message: "missing" }, 400, cors);

        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO game_cfg (vendor,game_id,pages,total_rooms,updated_at)
           VALUES (?,?,?,?,?)
           ON CONFLICT(vendor,game_id) DO UPDATE SET pages=excluded.pages, total_rooms=excluded.total_rooms, updated_at=excluded.updated_at`
        )
          .bind(vendor, gameId, pages, totalRooms, now)
          .run();

        return json({ ok: true }, 200, cors);
      }

      if (path === "/cfg/all" && req.method === "GET") {
        const rows = await env.DB.prepare("SELECT vendor,game_id as gameId,pages,total_rooms as totalRooms,updated_at as updatedAt FROM game_cfg").all();
        const cfg: Record<string, any> = {};
        for (const r of rows.results as any[]) cfg[`${r.vendor}|${r.gameId}`] = r;
        return json({ cfg }, 200, cors);
      }

      // -------------------- Overrides --------------------
      if (path === "/override/get" && req.method === "GET") {
        const vendor = String(url.searchParams.get("vendor") || "").trim();
        const gameId = String(url.searchParams.get("gameId") || "").trim();
        const roomNo = normalizeInt(url.searchParams.get("roomNo"), 1, 999999, 0);
        if (!vendor || !gameId || !roomNo) return json({ hit: null }, 200, cors);

        const row = await env.DB.prepare(
          "SELECT vendor,game_id as gameId,room_no as roomNo,rate,expire_at as expireAt FROM room_override WHERE vendor=? AND game_id=? AND room_no=?"
        )
          .bind(vendor, gameId, roomNo)
          .first();
        return json({ hit: row || null }, 200, cors);
      }

      if (path === "/override/all" && req.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT vendor,game_id as gameId,room_no as roomNo,rate,expire_at as expireAt FROM room_override"
        ).all();

        const all: any = {};
        for (const r of rows.results as any[]) {
          all[r.vendor] ??= {};
          all[r.vendor][r.gameId] ??= {};
          all[r.vendor][r.gameId][String(r.roomNo)] = { rate: r.rate, expireAt: r.expireAt };
        }
        return json({ all }, 200, cors);
      }

      if (path === "/override/set" && req.method === "POST") {
        const auth = await requireAdmin(env, req);
        if (!auth) return json({ message: "unauthorized" }, 401, cors);

        const body = (await req.json().catch(() => ({}))) as Json;
        const vendor = String(body.vendor || "").trim();
        const gameId = String(body.gameId || "").trim();
        const roomNo = normalizeInt(body.roomNo, 1, 999999, 0);
        const rate = normalizeInt(body.rate, 1, 99, 93);
        if (!vendor || !gameId || !roomNo) return json({ message: "missing" }, 400, cors);

        const now = Date.now();
        const expireAt = now + 3 * 60 * 1000; // 3 mins

        await env.DB.prepare(
          `INSERT INTO room_override (vendor,game_id,room_no,rate,expire_at,updated_at)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(vendor,game_id,room_no) DO UPDATE SET rate=excluded.rate, expire_at=excluded.expire_at, updated_at=excluded.updated_at`
        )
          .bind(vendor, gameId, roomNo, rate, expireAt, now)
          .run();

        const rows = await env.DB.prepare(
          "SELECT vendor,game_id as gameId,room_no as roomNo,rate,expire_at as expireAt FROM room_override"
        ).all();

        const all: any = {};
        for (const r of rows.results as any[]) {
          all[r.vendor] ??= {};
          all[r.vendor][r.gameId] ??= {};
          all[r.vendor][r.gameId][String(r.roomNo)] = { rate: r.rate, expireAt: r.expireAt };
        }

        return json({ ok: true, all }, 200, cors);
      }

      return json({ message: "not found" }, 404, cors);
    } catch (e: any) {
      // ✅ 先把真正錯誤吐回來（你現在看到的 duration 就是這裡來的）
      return json({ message: e?.message || "server error" }, 500, cors);
    }
  },
};