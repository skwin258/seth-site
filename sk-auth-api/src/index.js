// sk-auth-api/src/index.js

// ===== CORS（一定要每個 Response 都帶）=====
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(data, status = 200) {
  return new Response(data, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ===== 版本號（跨瀏覽器/跨裝置同步用）=====
globalThis.__SYNC_VERSION__ ??= 1;
function bumpSyncVersion() {
  globalThis.__SYNC_VERSION__++;
}

// ===== 確保預設管理員存在 =====
async function ensureAdmin(db) {
  // ✅ 你要改預設帳密就改這兩個
  const DEFAULT_ADMIN_ACCOUNT = "super";
  const DEFAULT_ADMIN_PASSWORD = "1234";

  const exist = await db
    .prepare("SELECT account FROM users WHERE account=?")
    .bind(DEFAULT_ADMIN_ACCOUNT)
    .first();

  if (!exist) {
    // 你的資料表欄位如果沒有 role/created_at 也沒關係，下面用 try/catch 兼容
    try {
      await db
        .prepare(
          "INSERT INTO users (account, password, role, created_at) VALUES (?, ?, ?, ?)"
        )
        .bind(DEFAULT_ADMIN_ACCOUNT, DEFAULT_ADMIN_PASSWORD, "admin", Date.now())
        .run();
    } catch {
      // 如果你的 users 表沒有 role/created_at，就用最基本欄位寫入
      await db
        .prepare("INSERT INTO users (account, password) VALUES (?, ?)")
        .bind(DEFAULT_ADMIN_ACCOUNT, DEFAULT_ADMIN_PASSWORD)
        .run();
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ✅ CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ✅ 不碰 DB 的健康檢查（避免 DB binding 有問題時也能回應）
      if (url.pathname === "/" && request.method === "GET") {
        return text("API OK");
      }

      // ✅ 版本號
      if (url.pathname === "/sync/version" && request.method === "GET") {
        return json({ ok: true, version: globalThis.__SYNC_VERSION__ });
      }

      // ✅ 取 DB（容錯：你 binding 叫 sk_auth_db 或 SK_AUTH_DB 都可）
      const db = env.sk_auth_db || env.SK_AUTH_DB;
      if (!db) {
        // 這是你現在最可能的 500 原因之一：binding 名稱沒對上
        return json(
          {
            ok: false,
            msg: "D1 binding not found. Please check wrangler config binding name.",
          },
          500
        );
      }

      // ✅ 確保有預設管理員
      await ensureAdmin(db);

      // ===============================
      // 登入 /login
      // ===============================
      if (url.pathname === "/login" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const account = (body.account || "").trim();
        const password = (body.password || "").trim();

        if (!account || !password) {
          return json({ ok: false, msg: "請輸入帳號與密碼" }, 400);
        }

        const user = await db
          .prepare("SELECT * FROM users WHERE account=?")
          .bind(account)
          .first();

        if (!user) return json({ ok: false, msg: "帳號不存在" }, 401);
        if (String(user.password) !== String(password))
          return json({ ok: false, msg: "密碼錯誤" }, 401);

        return json({
          ok: true,
          user: {
            account: user.account,
            role: user.role || (user.account === "super" ? "admin" : "user"),
            uses_left: user.uses_left ?? 0,
            unlimited: user.unlimited ?? 0,
          },
        });
      }

      // ===============================
      // 註冊 /register（測試用）
      // ===============================
      if (url.pathname === "/register" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const account = (body.account || "").trim();
        const password = (body.password || "").trim();

        if (!account || !password) {
          return json({ ok: false, msg: "請輸入帳號與密碼" }, 400);
        }

        const exist = await db
          .prepare("SELECT account FROM users WHERE account=?")
          .bind(account)
          .first();

        if (exist) return json({ ok: false, msg: "帳號已存在" }, 409);

        // 兼容不同表結構
        try {
          await db
            .prepare(
              "INSERT INTO users (account, password, role, created_at) VALUES (?, ?, ?, ?)"
            )
            .bind(account, password, "user", Date.now())
            .run();
        } catch {
          await db
            .prepare("INSERT INTO users (account, password) VALUES (?, ?)")
            .bind(account, password)
            .run();
        }

        bumpSyncVersion();
        return json({ ok: true });
      }

      return text("Not Found", 404);
    } catch (e) {
      // ✅ 任何錯誤都回 JSON + CORS，前端才不會 CORS 看不到錯誤
      return json(
        {
          ok: false,
          msg: "Worker error",
          error: String(e?.message || e),
        },
        500
      );
    }
  },
};