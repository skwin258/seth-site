// src/pages/Admin.jsx
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  getAdminSession,
  adminLogout,
  upsertAdmin,
  listAdmins,
  removeAdmin,

  listUsers,
  upsertUser,
  removeUser,
  addUses,
  setUnlimited,

  // ✅ 這兩個一定要有
  setRoomRateOverride,
  getRoomRateOverrideAll,
} from "../services/authService";

/** 8款：ATG 5款 + GR 3款 */
const ATG_GAMES = [
  { id: "戰神賽特", name: "戰神賽特" },
  { id: "覺醒之力", name: "覺醒之力" },
  { id: "赤三國", name: "赤三國" },
  { id: "孫行者", name: "孫行者" },
  { id: "武俠", name: "武俠" },
];

const GR_GAMES = [
  { id: "GR-1", name: "雷神" },
  { id: "GR-2", name: "戰神呂布" },
  { id: "GR-3", name: "魔龍傳奇" },
];

function clampInt(n, min, max) {
  const v = parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export default function Admin() {
  const [adminSess, setAdminSess] = useState(() => getAdminSession());
  const role = adminSess?.role || "";
  const isAuthed = !!adminSess?.id;
  const isSuper = role === "superadmin";

  const [msg, setMsg] = useState("");

  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const selected = useMemo(
    () => users.find((x) => x.id === selectedId) || null,
    [users, selectedId]
  );

  // 新增使用者
  const [uId, setUId] = useState("");
  const [uPw, setUPw] = useState("");
  const [uName, setUName] = useState("");
  const [addCount, setAddCount] = useState("1");

  // 超管：新增管理員
  const [admins, setAdmins] = useState([]);
  const [aId, setAId] = useState("");
  const [aPw, setAPw] = useState("");
  const [aName, setAName] = useState("");

  // 房間 override（單房）
  const [cfgVendor, setCfgVendor] = useState("ATG");
  const games = useMemo(() => (cfgVendor === "GR" ? GR_GAMES : ATG_GAMES), [cfgVendor]);
  const [cfgGameId, setCfgGameId] = useState("戰神賽特");
  const [cfgRoomNo, setCfgRoomNo] = useState("1");
  const [cfgHotRate, setCfgHotRate] = useState("93");
  const [overrideAll, setOverrideAll] = useState({});

  // 左側 tab
  const [tab, setTab] = useState("users"); // users / override / admins

  function toast(t) {
    setMsg(t);
    setTimeout(() => setMsg(""), 1400);
  }

  function reload() {
    setAdminSess(getAdminSession());
    try { setUsers(listUsers()); } catch { setUsers([]); }
    try { setAdmins(listAdmins()); } catch { setAdmins([]); }
    try { setOverrideAll(getRoomRateOverrideAll()); } catch { setOverrideAll({}); }
  }

  useEffect(() => { reload(); }, []);

  // ✅ 沒後台登入：直接導去 /admin-login
  if (!isAuthed) return <Navigate to="/admin-login" replace />;

  function doAdminLogout() {
    adminLogout();
    reload();
    location.href = "/admin-login";
  }

  function createUser() {
    const id = uId.trim();
    const pw = uPw.trim();
    const name = uName.trim();
    if (!id || !pw || !name) return toast("❌ 請輸入：帳號 / 密碼 / 名稱");

    try {
      upsertUser(id, {
        password: pw,
        displayName: name,
        role: "user",
        usesLeft: 0,
        disabled: false,
        unlimited: false,
      });
      setUId(""); setUPw(""); setUName("");
      reload();
      toast("✅ 已新增使用者");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  function setDisabled(id, disabled) {
    try {
      upsertUser(id, { disabled: !!disabled });
      reload();
      toast("✅ 已更新狀態");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  function doAddUses(id, n) {
    try {
      addUses(id, n);
      reload();
      toast("✅ 已增加次數");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  function doUnlimited(id) {
    try {
      setUnlimited(id);
      reload();
      toast("✅ 已設為無限次");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  function delUser(id) {
    if (!confirm(`確定刪除：${id} ?`)) return;
    try {
      removeUser(id);
      if (selectedId === id) setSelectedId("");
      reload();
      toast("✅ 已刪除使用者");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  function createAdmin() {
    if (!isSuper) return toast("❌ 只有超級管理員可新增管理員");

    const id = aId.trim();
    const pw = aPw.trim();
    const name = aName.trim();
    if (!id || !pw || !name) return toast("❌ 請輸入：帳號 / 密碼 / 名稱");

    try {
      upsertAdmin(id, { password: pw, name, role: "admin" });
      setAId(""); setAPw(""); setAName("");
      reload();
      toast("✅ 已新增管理員");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  function delAdmin(id) {
    if (!isSuper) return toast("❌ 只有超級管理員可刪除管理員");
    if (!confirm(`確定刪除管理員：${id} ?`)) return;

    try {
      removeAdmin(id);
      reload();
      toast("✅ 已刪除管理員");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  function applyRoomOverride() {
    const roomNo = clampInt(cfgRoomNo, 1, 5000);
    const hotRate = clampInt(cfgHotRate, 1, 99);
    const gameId = String(cfgGameId || "").trim();
    const vendor = String(cfgVendor || "").trim();
    if (!vendor || !gameId) return toast("❌ 請先選系統/遊戲");

    try {
      setRoomRateOverride(vendor, gameId, roomNo, hotRate);
      reload();
      toast("✅ 已套用（只改這一房）並同步前端");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  const overrideCount = Object.keys(overrideAll?.[cfgVendor]?.[cfgGameId] || {}).length;

  return (
    <div className="adminRoot">
      <div className="adminShell">
        {/* Sidebar */}
        <aside className="adminSidebar">
          <div className="adminBrand">
            <div className="adminBrandTitle">SETH ADMIN</div>
            <div className="adminBrandSub">
              登入：{adminSess?.name || adminSess?.id}（{role}）
            </div>
          </div>

          <div className="adminNav">
            {/* ✅ 手機版：四格對齊（CSS 控制只在手機顯示） */}
            <div className="adminQuickGrid" role="group" aria-label="Quick actions">
              {/* 左上：使用者 */}
              <button
                className={`adminNavBtn ${tab === "users" ? "active" : ""}`}
                onClick={() => setTab("users")}
                type="button"
              >
                <span>👤 使用者</span>
                <span className="adminNavHint">{users.length}</span>
              </button>

              {/* 右上：登出後台 */}
              <button className="adminBtn adminQuickLogout" onClick={doAdminLogout} type="button">
                登出後台
              </button>

              {/* 左下：單房覆蓋 */}
              <button
                className={`adminNavBtn ${tab === "override" ? "active" : ""}`}
                onClick={() => setTab("override")}
                type="button"
              >
                <span>🎯 單房覆蓋</span>
                <span className="adminNavHint">{overrideCount}</span>
              </button>

              {/* 右下：重新載入 */}
              <button className="adminBtn secondary adminQuickReload" onClick={reload} type="button">
                重新載入
              </button>
            </div>

            {/* ✅ 超管：手機額外顯示「管理員」入口（不打破四格） */}
            {isSuper && (
              <button
                className={`adminNavBtn adminSuperOnly ${tab === "admins" ? "active" : ""}`}
                onClick={() => setTab("admins")}
                type="button"
              >
                <span>🛡️ 管理員</span>
                <span className="adminNavHint">{admins.filter((a) => a.role === "admin").length}</span>
              </button>
            )}

            {/* ✅ 桌機版：原本側邊直排（CSS 控制只在桌機顯示） */}
            <div className="adminNavStack">
              <button
                className={`adminNavBtn ${tab === "users" ? "active" : ""}`}
                onClick={() => setTab("users")}
                type="button"
              >
                <span>👤 使用者</span>
                <span className="adminNavHint">{users.length}</span>
              </button>

              <button
                className={`adminNavBtn ${tab === "override" ? "active" : ""}`}
                onClick={() => setTab("override")}
                type="button"
              >
                <span>🎯 單房覆蓋</span>
                <span className="adminNavHint">{overrideCount}</span>
              </button>

              {isSuper && (
                <button
                  className={`adminNavBtn ${tab === "admins" ? "active" : ""}`}
                  onClick={() => setTab("admins")}
                  type="button"
                >
                  <span>🛡️ 管理員</span>
                  <span className="adminNavHint">{admins.filter((a) => a.role === "admin").length}</span>
                </button>
              )}

              <div style={{ height: 8 }} />

              <button className="adminBtn secondary" onClick={reload} type="button">
                重新載入
              </button>

              <button className="adminBtn" onClick={doAdminLogout} type="button">
                登出後台
              </button>

              {msg && (
                <div style={{ marginTop: 12, fontSize: 12, color: "rgba(233,236,255,.85)" }}>
                  {msg}
                </div>
              )}
            </div>

            {/* ✅ 手機版訊息（避免被桌機 stack 的 msg 隱藏） */}
            {msg && <div className="adminMsgMobile">{msg}</div>}
          </div>
        </aside>

        {/* Main */}
        <section className="adminMain">
          <div className="adminTopbar">
            <div>
              <div className="adminTitle">
                {tab === "users" ? "使用者面板" : tab === "override" ? "選房數據（單房修改）" : "管理員管理"}
              </div>
              <div className="adminMeta">深色科技風後台 · 只改 UI 不改邏輯</div>
            </div>
          </div>

          <div className="adminContent">
            {/* USERS TAB */}
            {tab === "users" && (
              <div className="adminRow" style={{ alignItems: "start" }}>
                {/* Left: create user */}
                <div className="adminCard">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>新增使用者</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <div className="adminLabel">使用者帳號</div>
                      <input className="adminInput" placeholder="例如 user001" value={uId} onChange={(e) => setUId(e.target.value)} />
                    </div>
                    <div>
                      <div className="adminLabel">使用者密碼</div>
                      <input className="adminInput" placeholder="請輸入密碼" value={uPw} onChange={(e) => setUPw(e.target.value)} />
                    </div>
                    <div>
                      <div className="adminLabel">使用者名稱</div>
                      <input className="adminInput" placeholder="顯示名稱" value={uName} onChange={(e) => setUName(e.target.value)} />
                    </div>

                    <button className="adminBtn" onClick={createUser} type="button">
                      新增使用者
                    </button>
                  </div>

                  <div style={{ height: 14 }} />
                  <div style={{ fontSize: 12, color: "rgba(233,236,255,.55)" }}>
                    提醒：新增後到右側清單點選即可管理狀態/次數
                  </div>
                </div>

                {/* Right: user list + panel */}
                <div className="adminCard">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>使用者清單</div>

                  <div className="adminRow" style={{ gridTemplateColumns: "360px 1fr" }}>
                    {/* List */}
                    <div style={{ borderRight: "1px solid rgba(255,255,255,.10)", paddingRight: 12 }}>
                      <div style={{ fontSize: 12, color: "rgba(233,236,255,.55)", marginBottom: 10 }}>
                        點選一個使用者：
                      </div>

                      <div style={{ display: "grid", gap: 8, maxHeight: 520, overflow: "auto", paddingRight: 6 }}>
                        {users.map((u) => {
                          const active = selectedId === u.id;
                          const uses = u.unlimited ? "∞" : (Number.isFinite(u.usesLeft) ? u.usesLeft : 0);
                          const state = u.disabled ? "停用" : "正常";
                          return (
                            <button
                              key={u.id}
                              type="button"
                              className={`adminNavBtn ${active ? "active" : ""}`}
                              onClick={() => setSelectedId(u.id)}
                              style={{ justifyContent: "flex-start", gap: 10 }}
                            >
                              <div style={{ textAlign: "left" }}>
                                <div style={{ fontWeight: 900 }}>
                                  {u.displayName || u.id} <span style={{ opacity: 0.55, fontWeight: 600 }}>({u.id})</span>
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(233,236,255,.62)", marginTop: 3 }}>
                                  次數：{uses} ｜ 狀態：{state}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Panel */}
                    <div style={{ paddingLeft: 2 }}>
                      {!selected ? (
                        <div style={{ color: "rgba(233,236,255,.60)" }}>尚未選取使用者</div>
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontSize: 18, fontWeight: 900 }}>
                              {selected.displayName || selected.id}
                              <span style={{ opacity: 0.6, fontWeight: 700, fontSize: 12, marginLeft: 8 }}>
                                {selected.id}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "rgba(233,236,255,.62)" }}>
                              狀態：{selected.disabled ? "停用" : "正常"}　｜　次數：{selected.unlimited ? "∞" : (Number.isFinite(selected.usesLeft) ? selected.usesLeft : 0)}
                            </div>
                          </div>

                          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button className="adminBtn secondary" onClick={() => setDisabled(selected.id, false)} type="button">設為正常</button>
                            <button className="adminBtn secondary" onClick={() => setDisabled(selected.id, true)} type="button">設為停用</button>
                            <button className="adminBtn secondary" onClick={() => delUser(selected.id)} type="button">刪除使用者</button>
                          </div>

                          <div style={{ height: 14 }} />
                          <div className="adminCard" style={{ background: "rgba(0,0,0,.18)" }}>
                            <div style={{ fontWeight: 900, marginBottom: 10 }}>增加使用次數</div>

                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ minWidth: 200 }}>
                                <div className="adminLabel">可使用次數 X（1-100）</div>
                                <input className="adminInput" value={addCount} onChange={(e) => setAddCount(e.target.value)} />
                              </div>
                              <button className="adminBtn" onClick={() => doAddUses(selected.id, clampInt(addCount, 1, 100))} type="button">
                                新增
                              </button>
                            </div>

                            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button className="adminBtn secondary" onClick={() => doAddUses(selected.id, 1)} type="button">+1次</button>
                              <button className="adminBtn secondary" onClick={() => doAddUses(selected.id, 3)} type="button">+3次</button>
                              <button className="adminBtn secondary" onClick={() => doAddUses(selected.id, 5)} type="button">+5次</button>
                              <button className="adminBtn" onClick={() => doUnlimited(selected.id)} type="button">無限次</button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* OVERRIDE TAB */}
            {tab === "override" && (
              <div className="adminRow" style={{ alignItems: "start" }}>
                <div className="adminCard">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>選房數據（單房修改）</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <div className="adminLabel">系統</div>
                      <select
                        className="adminSelect"
                        value={cfgVendor}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCfgVendor(v);
                          if (v === "GR") setCfgGameId(GR_GAMES[0].id);
                          else setCfgGameId(ATG_GAMES[0].id);
                        }}
                      >
                        <option value="ATG">ATG</option>
                        <option value="GR">GR</option>
                      </select>
                    </div>

                    <div>
                      <div className="adminLabel">遊戲</div>
                      <select className="adminSelect" value={cfgGameId} onChange={(e) => setCfgGameId(e.target.value)}>
                        {games.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="adminRow">
                      <div>
                        <div className="adminLabel">第幾房（1-5000）</div>
                        <input className="adminInput" placeholder="例如 280" value={cfgRoomNo} onChange={(e) => setCfgRoomNo(e.target.value)} />
                      </div>
                      <div>
                        <div className="adminLabel">大獎中獎率（1-99）</div>
                        <input className="adminInput" placeholder="例如 93" value={cfgHotRate} onChange={(e) => setCfgHotRate(e.target.value)} />
                      </div>
                    </div>

                    <button className="adminBtn" onClick={applyRoomOverride} type="button">套用（只改這一房）</button>

                    <div style={{ fontSize: 12, color: "rgba(233,236,255,.60)" }}>
                      目前已套用（統計）：{overrideCount} 房（不顯示 JSON）
                    </div>
                  </div>
                </div>

                <div className="adminCard">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>快速提示</div>
                  <div style={{ fontSize: 13, color: "rgba(233,236,255,.70)", lineHeight: 1.65 }}>
                    <div>• 這裡只會修改「單一房號」的大獎中獎率。</div>
                    <div>• 套用後前台會透過你現有的 getRoomRateOverride() 即時反映。</div>
                    <div>• 若你要做「指定管理員只能看到自己建立的 users」，那是 users/admins 的 list 過濾邏輯（下個檔我再幫你補）。</div>
                  </div>
                </div>
              </div>
            )}

            {/* ADMINS TAB */}
            {tab === "admins" && isSuper && (
              <div className="adminRow" style={{ alignItems: "start" }}>
                <div className="adminCard">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>超管：新增管理員</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div>
                      <div className="adminLabel">管理員帳號</div>
                      <input className="adminInput" value={aId} onChange={(e) => setAId(e.target.value)} />
                    </div>
                    <div>
                      <div className="adminLabel">管理員密碼</div>
                      <input className="adminInput" value={aPw} onChange={(e) => setAPw(e.target.value)} />
                    </div>
                    <div>
                      <div className="adminLabel">管理員名稱</div>
                      <input className="adminInput" value={aName} onChange={(e) => setAName(e.target.value)} />
                    </div>

                    <button className="adminBtn" onClick={createAdmin} type="button">
                      新增管理員
                    </button>
                  </div>
                </div>

                <div className="adminCard">
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>管理員列表</div>

                  <div className="adminTableWrap">
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th style={{ width: 220 }}>帳號</th>
                          <th>名稱</th>
                          <th style={{ width: 120 }}>角色</th>
                          <th style={{ width: 140 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {admins.filter((a) => a.role === "admin").map((a) => (
                          <tr key={a.id}>
                            <td>{a.id}</td>
                            <td>{a.name || "-"}</td>
                            <td>{a.role}</td>
                            <td>
                              <button className="adminBtn secondary" onClick={() => delAdmin(a.id)} type="button">
                                刪除
                              </button>
                            </td>
                          </tr>
                        ))}
                        {admins.filter((a) => a.role === "admin").length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ color: "rgba(233,236,255,.55)" }}>
                              尚無管理員
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ height: 10 }} />
                  <div style={{ fontSize: 12, color: "rgba(233,236,255,.55)" }}>
                    只有 superadmin 可以新增/刪除管理員
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}