// src/pages/AdminLogin.jsx
import React, { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import "../App.css";

import { adminLogin, getAdminSession } from "../services/authService";

export default function AdminLogin() {
  const nav = useNavigate();

  const alreadyIn = useMemo(() => {
    const s = getAdminSession();
    return !!s?.id;
  }, []);

  const [id, setId] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (alreadyIn) return <Navigate to="/admin" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setErr("");
    const a = (id || "").trim();
    const p = (password || "").trim();
    if (!a || !p) {
      setErr("請輸入管理員帳號與密碼");
      return;
    }

    try {
      setLoading(true);
      await adminLogin(a, p); // ✅ Workers+D1
      nav("/admin", { replace: true });
    } catch (e2) {
      setErr(String(e2?.message || "登入失敗"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex" }}>
      <div
        style={{
          margin: "auto",
          width: "min(420px, 92vw)",
          border: "2px solid #00ff66",
          padding: 18,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
          管理員後台登入
        </div>

        {/* ✅ 你之前問的「兩句註釋詞」：我直接放在這裡（甜一點但官方） */}
        <div style={{ opacity: 0.9, fontSize: 13, marginBottom: 6 }}>
          請使用管理員帳號登入，操作將被紀錄以保護系統安全
        </div>
        <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 14 }}>
          若帳號無法登入，請聯絡系統管理者協助處理
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>管理員帳號</div>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              placeholder="請輸入管理員帳號"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "transparent",
                color: "#00ff66",
                border: "2px solid #00ff66",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>密碼</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="請輸入密碼"
              type="password"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "transparent",
                color: "#00ff66",
                border: "2px solid #00ff66",
                outline: "none",
              }}
            />
          </div>

          {err ? (
            <div
              style={{
                border: "1px solid rgba(255,80,80,0.7)",
                padding: 10,
                marginBottom: 12,
                color: "#ff6060",
                fontSize: 13,
                whiteSpace: "pre-line",
              }}
            >
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "2px solid #00ff66",
              background: loading ? "rgba(0,255,102,0.08)" : "transparent",
              color: "#00ff66",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "登入中..." : "登入後台"}
          </button>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
            回前台{" "}
            <span
              onClick={() => nav("/login")}
              style={{ textDecoration: "underline", cursor: "pointer" }}
            >
              /login
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}