// src/pages/Login.jsx
import React, { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import "../App.css";

import { login as userLogin, getCurrentUser } from "../services/authService";
import { useSite } from "../store/SiteStore";

export default function Login() {
  const nav = useNavigate();
  const { currentUser, setCurrentUser } = useSite();

  const alreadyIn = useMemo(() => {
    const u = currentUser || getCurrentUser();
    return !!u?.id;
  }, [currentUser]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  if (alreadyIn) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setErr("");
    const u = (username || "").trim();
    const p = (password || "").trim();
    if (!u || !p) {
      setErr("請輸入帳號與密碼");
      return;
    }

    try {
      setLoading(true);
      const sess = await userLogin(u, p); // ✅ Workers+D1
      setCurrentUser(sess);
      nav("/", { replace: true });
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
          使用者登入
        </div>

        <div style={{ opacity: 0.9, fontSize: 13, marginBottom: 14 }}>
          請輸入帳號密碼登入後使用系統
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>帳號</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="請輸入帳號"
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
            {loading ? "登入中..." : "登入"}
          </button>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
            後台請到{" "}
            <span
              onClick={() => nav("/admin-login")}
              style={{ textDecoration: "underline", cursor: "pointer" }}
            >
              /admin-login
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}