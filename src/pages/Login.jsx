import React, { useMemo, useState } from "react";
import "../App.css";
import { useNavigate } from "react-router-dom";
import { useSite } from "../store/SiteStore";

import bgVideo from "../assets/bg.mp4";
import { login as authLogin } from "../services/authService";

export default function Login() {
  const nav = useNavigate();
  const { setCurrentUser } = useSite();

  const [account, setAccount] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const canSubmit = useMemo(() => {
    return account.trim().length > 0 && pin.trim().length > 0;
  }, [account, pin]);

  function doLogin() {
    setErr("");
    const a = account.trim();
    const p = pin.trim();

    if (!a || !p) {
      setErr("請輸入帳號與密碼");
      return;
    }

    try {
      const user = authLogin(a, p);
      setCurrentUser(user);
      nav("/", { replace: true });
    } catch (e) {
      setErr(e?.message || "登入失敗");
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
          onKeyDown={(e) => {
            if (e.key === "Enter") doLogin();
          }}
        />

        <input
          className="input"
          type="password"
          placeholder="請輸入密碼"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doLogin();
          }}
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
          登入
        </button>
      </div>
    </div>
  );
}