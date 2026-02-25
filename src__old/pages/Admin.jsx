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

  async function reload() {
    setAdminSess(getAdminSession());
    try {
      setUsers(await listUsers());
    } catch {
      setUsers([]);
    }
    try {
      setAdmins(await listAdmins());
    } catch {
      setAdmins([]);
    }
    try {
      setOverrideAll(await getRoomRateOverrideAll());
    } catch {
      setOverrideAll({});
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 沒後台登入：直接導去 /admin-login
  if (!isAuthed) return <Navigate to="/admin-login" replace />;

  function doAdminLogout() {
    adminLogout();
    reload();
    location.href = "/admin-login";
  }

  async function createUser() {
    const id = uId.trim();
    const pw = uPw.trim();
    const name = uName.trim();
    if (!id || !pw || !name) return toast("❌ 請輸入：帳號 / 密碼 / 名稱");

    try {
      await upsertUser(id, {
        password: pw,
        displayName: name,
        role: "user",
        usesLeft: 0,
        disabled: false,
        unlimited: false,
      });
      setUId("");
      setUPw("");
      setUName("");
      await reload();
      toast("✅ 已新增使用者");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  async function setDisabled(id, disabled) {
    try {
      await upsertUser(id, { disabled: !!disabled });
      await reload();
      toast("✅ 已更新狀態");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  async function doAddUses(id, n) {
    try {
      await addUses(id, n);
      await reload();
      toast("✅ 已增加次數");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  async function doUnlimited(id) {
    try {
      await setUnlimited(id);
      await reload();
      toast("✅ 已設為無限次");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  async function delUser(id) {
    if (!confirm(`確定刪除：${id} ?`)) return;
    try {
      await removeUser(id);
      if (selectedId === id) setSelectedId("");
      await reload();
      toast("✅ 已刪除使用者");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  async function createAdmin() {
    if (!isSuper) return toast("❌ 只有超級管理員可新增管理員");

    const id = aId.trim();
    const pw = aPw.trim();
    const name = aName.trim();
    if (!id || !pw || !name) return toast("❌ 請輸入：帳號 / 密碼 / 名稱");

    try {
      await upsertAdmin(id, { password: pw, name, role: "admin" });
      setAId("");
      setAPw("");
      setAName("");
      await reload();
      toast("✅ 已新增管理員");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  async function delAdmin(id) {
    if (!isSuper) return toast("❌ 只有超級管理員可刪除管理員");
    if (!confirm(`確定刪除管理員：${id} ?`)) return;

    try {
      await removeAdmin(id);
      await reload();
      toast("✅ 已刪除管理員");
    } catch (e) {
      toast(`❌ ${e?.message || "失敗"}`);
    }
  }

  async function applyRoomOverride() {
    const roomNo = clampInt(cfgRoomNo, 1, 5000);
    const hotRate = clampInt(cfgHotRate, 1, 99);
    const gameId = String(cfgGameId || "").trim();
    const vendor = String(cfgVendor || "").trim();
    if (!vendor || !gameId) return toast("❌ 請先選系統/遊戲");

    try {
      await setRoomRateOverride(vendor, gameId, roomNo, hotRate);
      await reload();
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

            {/* ✅ 桌機版：原本列表 */}
            <div className="adminNavList">
              <button
                className={`adminNavBtn ${tab === "users" ? "active" : ""}`}
                onClick={() => setTab("users")}
                type="button"
              >
                👤 使用者管理 <span className="adminNavHint">{users.length}</span>
              </button>

              <button
                className={`adminNavBtn ${tab === "override" ? "active" : ""}`}
                onClick={() => setTab("override")}
                type="button"
              >
                🎯 單房覆蓋 <span className="adminNavHint">{overrideCount}</span>
              </button>

              {isSuper && (
                <button
                  className={`adminNavBtn ${tab === "admins" ? "active" : ""}`}
                  onClick={() => setTab("admins")}
                  type="button"
                >
                  🛡️ 管理員 <span className="adminNavHint">{admins.filter((a) => a.role === "admin").length}</span>
                </button>
              )}

              <div style={{ height: 10 }} />
              <button className="adminBtn secondary" onClick={reload} type="button">
                重新載入
              </button>
              <button className="adminBtn" onClick={doAdminLogout} type="button">
                登出後台
              </button>
            </div>
          </div>

          {msg && <div className="adminToast">{msg}</div>}
        </aside>

        {/* Main */}
        <section className="adminMain">
          <div className="adminHeader">
            <div className="adminHeaderTitle">
              {tab === "users" && "使用者管理"}
              {tab === "override" && "單房覆蓋"}
              {tab === "admins" && "管理員管理"}
            </div>
            <div className="adminHeaderSub">跨裝置版（Cloudflare Workers + D1）</div>
          </div>

          <div className="adminBody">
            {/* ---------------- USERS ---------------- */}
            {tab === "users" && (
              <div className="adminGrid">
                <div className="adminCard">
                  <div className="adminCardTitle">新增使用者</div>

                  <div className="adminForm">
                    <input className="adminInput" placeholder="帳號" value={uId} onChange={(e) => setUId(e.target.value)} />
                    <input className="adminInput" placeholder="密碼" value={uPw} onChange={(e) => setUPw(e.target.value)} />
                    <input className="adminInput" placeholder="名稱" value={uName} onChange={(e) => setUName(e.target.value)} />
                    <button className="adminBtn" onClick={createUser} type="button">
                      新增
                    </button>
                  </div>

                  <div style={{ height: 14 }} />
                  <div className="adminCardTitle">增加次數</div>
                  <div className="adminForm">
                    <input
                      className="adminInput"
                      placeholder="次數（1~100）"
                      value={addCount}
                      onChange={(e) => setAddCount(e.target.value)}
                    />
                    <button
                      className="adminBtn secondary"
                      onClick={() => {
                        if (!selected) return toast("請先點一個使用者");
                        doAddUses(selected.id, clampInt(addCount, 1, 100));
                      }}
                      type="button"
                    >
                      對選取者加次數
                    </button>
                    <button
                      className="adminBtn secondary"
                      onClick={() => {
                        if (!selected) return toast("請先點一個使用者");
                        doUnlimited(selected.id);
                      }}
                      type="button"
                    >
                      對選取者設無限次
                    </button>
                  </div>

                  <div style={{ height: 10 }} />
                  <div style={{ fontSize: 12, color: "rgba(233,236,255,.55)" }}>
                    admin 只能看到自己建立的使用者；superadmin 可看全部。
                  </div>
                </div>

                <div className="adminCard">
                  <div className="adminCardTitle">使用者列表</div>

                  <div className="adminTableWrap">
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th style={{ width: 180 }}>帳號</th>
                          <th style={{ width: 160 }}>名稱</th>
                          <th style={{ width: 120 }}>狀態</th>
                          <th style={{ width: 120 }}>次數</th>
                          <th style={{ width: 160 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr
                            key={u.id}
                            className={selectedId === u.id ? "active" : ""}
                            onClick={() => setSelectedId(u.id)}
                          >
                            <td>{u.id}</td>
                            <td>{u.displayName || "-"}</td>
                            <td>
                              {u.disabled ? (
                                <span className="badge red">停用</span>
                              ) : (
                                <span className="badge green">正常</span>
                              )}
                            </td>
                            <td>{u.unlimited ? "∞" : u.usesLeft}</td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                className="adminBtn secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDisabled(u.id, !u.disabled);
                                }}
                                type="button"
                              >
                                {u.disabled ? "啟用" : "停用"}
                              </button>
                              <button
                                className="adminBtn secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  delUser(u.id);
                                }}
                                type="button"
                              >
                                刪除
                              </button>
                            </td>
                          </tr>
                        ))}
                        {users.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ color: "rgba(233,236,255,.55)" }}>
                              尚無使用者
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {selected && (
                    <div className="adminHint">
                      已選取：<b>{selected.id}</b>（{selected.displayName || "-"}）
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---------------- OVERRIDE ---------------- */}
            {tab === "override" && (
              <div className="adminGrid">
                <div className="adminCard">
                  <div className="adminCardTitle">單房覆蓋（3分鐘到期）</div>

                  <div className="adminForm">
                    <select className="adminSelect" value={cfgVendor} onChange={(e) => {
                      setCfgVendor(e.target.value);
                      setCfgGameId(e.target.value === "GR" ? "GR-1" : "戰神賽特");
                    }}>
                      <option value="ATG">ATG</option>
                      <option value="GR">GR</option>
                    </select>

                    <select className="adminSelect" value={cfgGameId} onChange={(e) => setCfgGameId(e.target.value)}>
                      {games.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>

                    <input
                      className="adminInput"
                      placeholder="房號"
                      value={cfgRoomNo}
                      onChange={(e) => setCfgRoomNo(e.target.value)}
                    />

                    <input
                      className="adminInput"
                      placeholder="大獎率(1~99)"
                      value={cfgHotRate}
                      onChange={(e) => setCfgHotRate(e.target.value)}
                    />

                    <button className="adminBtn" onClick={applyRoomOverride} type="button">
                      套用
                    </button>
                  </div>

                  <div style={{ height: 10 }} />
                  <div style={{ fontSize: 12, color: "rgba(233,236,255,.55)" }}>
                    這裡只會改「指定房號」，3分鐘後自動失效。
                  </div>
                </div>

                <div className="adminCard">
                  <div className="adminCardTitle">目前覆蓋清單（{overrideCount}）</div>

                  <div className="adminTableWrap">
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th style={{ width: 140 }}>房號</th>
                          <th style={{ width: 140 }}>大獎率</th>
                          <th style={{ width: 200 }}>到期</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(overrideAll?.[cfgVendor]?.[cfgGameId] || {}).map(([roomNo, v]) => (
                          <tr key={roomNo}>
                            <td>{roomNo}</td>
                            <td>{v?.rate ?? "-"}%</td>
                            <td>{v?.expireAt ? new Date(v.expireAt).toLocaleString() : "-"}</td>
                          </tr>
                        ))}
                        {overrideCount === 0 && (
                          <tr>
                            <td colSpan={3} style={{ color: "rgba(233,236,255,.55)" }}>
                              尚無覆蓋
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- ADMINS ---------------- */}
            {tab === "admins" && (
              <div className="adminGrid">
                <div className="adminCard">
                  <div className="adminCardTitle">新增管理員（superadmin only）</div>

                  <div className="adminForm">
                    <input className="adminInput" placeholder="帳號" value={aId} onChange={(e) => setAId(e.target.value)} />
                    <input className="adminInput" placeholder="密碼" value={aPw} onChange={(e) => setAPw(e.target.value)} />
                    <input className="adminInput" placeholder="名稱" value={aName} onChange={(e) => setAName(e.target.value)} />
                    <button className="adminBtn" onClick={createAdmin} type="button">
                      新增
                    </button>
                  </div>

                  <div style={{ height: 10 }} />
                  <div style={{ fontSize: 12, color: "rgba(233,236,255,.55)" }}>
                    預設 seed：super/super123、admin1/admin123（部署後請馬上改密碼）
                  </div>
                </div>

                <div className="adminCard">
                  <div className="adminCardTitle">管理員列表</div>

                  <div className="adminTableWrap">
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th style={{ width: 220 }}>帳號</th>
                          <th style={{ width: 220 }}>名稱</th>
                          <th style={{ width: 140 }}>角色</th>
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
