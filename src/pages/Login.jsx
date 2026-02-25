// src/pages/Login.jsx
import React, { useMemo, useState } from "react";
import "../App.css";
import { useNavigate } from "react-router-dom";
import { useSite } from "../store/SiteStore";

import bgVideo from "../assets/bg.mp4";
import { apiLogin } from "../services/authService";

export default function Login() {
  const nav = useNavigate();
  const { setCurrentUser } = useSite();

  const [account, setAccount] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return !!account.trim() && !!pin.trim() && !loading;
  }, [account, pin, loading]);

  async function doLogin() {
    if (loading) return;
    setErr("");

    const a = account.trim();
    const p = pin.trim();

    if (!a || !p) {
      setErr("請輸入帳號與密碼");
      return;
    }

    try {
      setLoading(true);

      const result = await apiLogin(a, p);

      // ✅ 相容：apiLogin 回 {ok,user} 或直接回 sess
      const ok = typeof result?.ok === "boolean" ? result.ok : !!result?.id;
      const user = result?.user || result;

      if (!ok || !user) {
        setErr(result?.msg || "登入失敗");
        return;
      }

      // ✅ 存本機（F5 不登出）
      localStorage.setItem("sk_user", JSON.stringify(user));
      localStorage.setItem("sk_current_user", JSON.stringify(user));

      // ✅ 更新全域狀態
      setCurrentUser(user);

      // ✅ 回首頁
      nav("/", { replace: true });
    } catch (e) {
      console.error(e);
      setErr(e?.message || "伺服器連線失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app loginOnly">
      <video
        className="mainVideo"
        src={bgVideo}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={(e) => {
          const v = e.currentTarget;
          v.currentTime = 0;
          v.play();
        }}
      />

      <div className="panel loginPanel">
        <div className="title">SK-電子外掛程式</div>
        <div className="version">版本：v3.4.26</div>

        <input
          className="input"
          placeholder="請輸入會員帳號"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doLogin()}
          autoComplete="username"
        />

        <input
          className="input"
          type="password"
          placeholder="請輸入密碼"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doLogin()}
          autoComplete="current-password"
        />

        {err && (
          <div style={{ marginTop: 10, color: "#ffb4b4", fontSize: 13 }}>
            {err}
          </div>
        )}

        <button
          className="button"
          onClick={doLogin}
          disabled={!canSubmit}
          style={!canSubmit ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
        >
          {loading ? "登入中..." : "登入"}
        </button>
      </div>
    </div>
  );
}