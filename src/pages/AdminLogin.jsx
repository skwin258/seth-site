// src/pages/AdminLogin.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "../services/authService";

export default function AdminLogin() {
  const nav = useNavigate();

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return account.trim().length > 0 && password.trim().length > 0 && !loading;
  }, [account, password, loading]);

  async function doLogin() {
    if (!canSubmit) return;
    setErr("");
    setLoading(true);

    try {
      const a = account.trim();
      const p = password.trim();

      // ✅ 改成 await（API 版一定是 async）
      const result = await adminLogin(a, p);

      // 相容：如果 authService 回 {ok, msg, admin} 這種格式
      if (result && typeof result === "object" && "ok" in result) {
        if (!result.ok) {
          setErr(result.msg || "登入失敗");
          return;
        }
      }

      // ✅ 成功就進後台
      nav("/admin", { replace: true });
    } catch (e) {
      setErr(e?.message || "登入失敗");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") doLogin();
  }

  return (
    <div className="adminRoot">
      <div className="adminLoginShell">
        <div className="adminLoginCard">
          <div className="adminLoginHeader">
            <div className="adminLoginTitle">SK-選房程式後台</div>
            <div className="adminLoginSub">-----------------------------------</div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div>
              <div className="adminLabel">帳號</div>
              <input
                className="adminInput"
                placeholder="輸入帳號"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                onKeyDown={onKeyDown}
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <div className="adminLabel">密碼</div>
              <input
                className="adminInput"
                type="password"
                placeholder="輸入密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKeyDown}
                autoComplete="current-password"
              />
            </div>

            {err && (
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,180,180,.95)",
                  background: "rgba(255,80,80,.12)",
                  border: "1px solid rgba(255,80,80,.20)",
                  padding: "10px 12px",
                  borderRadius: 12,
                }}
              >
                {err}
              </div>
            )}

            <button
              className={`adminBtn ${canSubmit ? "" : "disabled"}`}
              onClick={doLogin}
              type="button"
              disabled={!canSubmit}
              style={{ width: "100%" }}
            >
              {loading ? "登入中…" : "登入後台"}
            </button>

            <div style={{ fontSize: 12, color: "rgba(233,236,255,.55)", lineHeight: 1.6 }}>
              • 本系統僅限授權管理員使用，所有操作將被記錄。
              <br />
              • 登入即代表同意系統使用與安全規範。
            </div>
          </div>
        </div>

        <div className="adminLoginFooter">
          <div className="adminLoginHintDot" />
          <div>Secure Console · Dark Neon UI</div>
        </div>
      </div>
    </div>
  );
}