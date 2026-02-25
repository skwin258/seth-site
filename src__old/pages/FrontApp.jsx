// src/pages/FrontApp.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import "../App.css";
import { Navigate } from "react-router-dom";
import { useSite } from "../store/SiteStore";

import {
  getCurrentUser as getUserSession,
  consumeOneUseAndRenew,
  getRoomConfig,
  getRoomRateOverrideAll,
  refreshCurrentUserSession, // ✅ 新增
} from "../services/authService";

import vendorATG from "../assets/logo.png";
import vendorGR from "../assets/gr_logo.png";

import game1 from "../assets/game1.png";
import game2 from "../assets/game2.png";
import game3 from "../assets/game3.png";
import game4 from "../assets/game4.png";
import game5 from "../assets/game5.png";

import gr1 from "../assets/gr1.png";
import gr2 from "../assets/gr2.png";
import gr3 from "../assets/gr3.png";

import intro1 from "../assets/intro_1.png";
import intro2 from "../assets/intro_2.png";
import intro3 from "../assets/intro_3.png";
import intro4 from "../assets/intro_4.png";
import intro5 from "../assets/intro_5.png";
import intro6 from "../assets/intro_6.png";
import intro7 from "../assets/intro_7.png";

import bgVideo from "../assets/bg.mp4";
import sethGameplay from "../assets/seth_gameplay.mp4";

/* =========================
 * 工具
 * ========================= */
function randCode(len = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function hashStrToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function rateLevel(rate) {
  if (rate >= 90) return "red";
  if (rate >= 70) return "yellow";
  return "gray";
}

/* =========================
 * 推薦用（ATG 金額邏輯保留）
 * ========================= */
const ATG_AMOUNTS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40, 42, 48, 54, 56, 60, 64, 72, 80
];
function nextAllowedAmountCeil(n) {
  for (const v of ATG_AMOUNTS) if (v >= n) return v;
  return ATG_AMOUNTS[ATG_AMOUNTS.length - 1];
}
function pickFlatByRate(rate, rng) {
  const candidates = ATG_AMOUNTS.filter((v) => v >= 40 && v <= 80);
  const t = clamp((rate - 40) / 56, 0, 1);
  const baseIdx = Math.floor(t * (candidates.length - 1));
  const jitter = rng() < 0.7 ? 0 : (rng() < 0.85 ? 1 : -1);
  let idx = baseIdx + jitter;
  idx = clamp(idx, 0, candidates.length - 1);
  return candidates[idx];
}
function pickSpinPairByRate(rate, rng) {
  const pairs = [[40, 50],[50, 60],[60, 70],[70, 80],[80, 90]];
  const t = clamp((rate - 40) / 56, 0, 1);
  const baseIdx = Math.floor(t * (pairs.length - 1));
  const jitter = rng() < 0.7 ? 0 : (rng() < 0.85 ? 1 : -1);
  let idx = baseIdx + jitter;
  idx = clamp(idx, 0, pairs.length - 1);
  return { spinFrom: pairs[idx][0], spinTo: pairs[idx][1] };
}
function makeRecoATG({ gameId, roomNo, bucket3Min, rate }) {
  const rng = mulberry32(hashStrToInt(`${gameId}|RECO|${roomNo}|${bucket3Min}`));
  const flat = pickFlatByRate(rate, rng);
  const rawBuy = Math.ceil(flat / 3);
  const buy = nextAllowedAmountCeil(rawBuy);
  const { spinFrom, spinTo } = pickSpinPairByRate(rate, rng);
  return { flat, buy, spinFrom, spinTo };
}

/* =========================
 * 熱門房集合（保留你的原算法）
 * ========================= */
function hotCountRange(totalRooms) {
  if (totalRooms >= 3000) return [5, 10];
  if (totalRooms >= 1000) return [1, 3];
  return [1, 2];
}
function buildHotSet({ gameId, totalRooms, bucket3Min }) {
  const [minC, maxC] = hotCountRange(totalRooms);
  const rng = mulberry32(hashStrToInt(`${gameId}|HOT|${bucket3Min}`));
  const hotCount = minC + Math.floor(rng() * (maxC - minC + 1));
  const set = new Set();
  while (set.size < hotCount) {
    const roomNo = 1 + Math.floor(rng() * totalRooms);
    set.add(roomNo);
  }
  return set;
}
function genRate(rng, isHot) {
  if (isHot) return 92 + Math.floor(rng() * 5);
  return 10 + Math.floor(rng() * 82);
}

/* =========================
 * UI
 * ========================= */
function MainWithVideo({ className = "", src = bgVideo, children }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.load();
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }, [src]);

  return (
    <main className={`main ${className}`}>
      <video
        ref={videoRef}
        className="mainVideo"
        src={src}
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
      <div className="mainContent">{children}</div>
    </main>
  );
}

/* =========================
 * Data
 * ========================= */
const ATG_GAMES = [
  { id: "戰神賽特", name: "戰神賽特", img: game1, totalRooms: 3000, pages: 6 },
  { id: "覺醒之力", name: "覺醒之力", img: game2, totalRooms: 3000, pages: 6 },
  { id: "赤三國", name: "赤三國", img: game3, totalRooms: 1000, pages: 2 },
  { id: "孫行者", name: "孫行者", img: game4, totalRooms: 500, pages: 1 },
  { id: "武俠", name: "武俠", img: game5, totalRooms: 500, pages: 1 },
];
const GR_GAMES = [
  { id: "GR-1", name: "雷神", img: gr1, totalRooms: 25, pages: 1 },
  { id: "GR-2", name: "戰神呂布", img: gr2, totalRooms: 25, pages: 1 },
  { id: "GR-3", name: "魔龍傳奇", img: gr3, totalRooms: 25, pages: 1 },
];
const VENDORS = [
  { id: "ATG", name: "ATG電子", logo: vendorATG, hasCode: true },
  { id: "GR", name: "GR電子", logo: vendorGR || vendorATG, hasCode: true },
];

export default function FrontApp() {
  const { currentUser, setCurrentUser } = useSite();

  // 沒登入 → 強制去 /login
  if (!currentUser) return <Navigate to="/login" replace />;

  // ✅ 進頁面時同步一次 session
  useEffect(() => {
    const fresh = getUserSession();
    if (fresh?.id && fresh.id === currentUser.id) setCurrentUser(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 3 分鐘刷新（房間生成用）
  const [bucket3Min, setBucket3Min] = useState(() => Math.floor(Date.now() / 180000));
  useEffect(() => {
    const id = setInterval(() => setBucket3Min(Math.floor(Date.now() / 180000)), 180000);
    return () => clearInterval(id);
  }, []);

  // ✅ 5 分鐘（代碼跳一次）
  const [bucket5Min, setBucket5Min] = useState(() => Math.floor(Date.now() / 300000));
  useEffect(() => {
    const id = setInterval(() => setBucket5Min(Math.floor(Date.now() / 300000)), 300000);
    return () => clearInterval(id);
  }, []);

  /* =========================
   * State
   * ========================= */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [page, setPage] = useState("menuVendorPick"); // menuVendorPick/rooms/introGames
  const [menu, setMenu] = useState("外掛選房程式");

  const [activeVendorId, setActiveVendorId] = useState("ATG");
  const [activeGameId, setActiveGameId] = useState("戰神賽特");
  const [roomPage, setRoomPage] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState(null);

  const [introOpen, setIntroOpen] = useState(false);
  const [introPage, setIntroPage] = useState(0);
  const [introExpandedVendorId, setIntroExpandedVendorId] = useState(null);

  const [mainVideoSrc, setMainVideoSrc] = useState(bgVideo);

  // ✅ 倒數更新（每秒）— 只用來讓倒數刷新，不要拿去重算 rooms
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ✅ 後台停用/刪除：強制彈窗（立即登出）
  const [forceModal, setForceModal] = useState(null);

  useEffect(() => {
    if (!currentUser?.id) return;

    const id = setInterval(() => {
      (async () => {
        const r = await refreshCurrentUserSession();
        if (!r.ok) {
          setForceModal({
            open: true,
            title: r.reason === "disabled" ? "帳號已停用" : "帳號已被刪除",
            desc: "請重新登入或聯絡客服。",
            cta: "我知道了",
          });
        }
      })();
    }, 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // ✅ 是否鎖住（停用/次數不足/本輪已到期）
  const usesLeft = Number.isFinite(currentUser.usesLeft) ? currentUser.usesLeft : 0;
  const isUnlimited = !!currentUser.unlimited;
  const isDisabled = !!currentUser.disabled;
  const noUses = !isUnlimited && usesLeft <= 0;

  const cycleEndAt = Number.isFinite(currentUser.cycleEndAt) ? currentUser.cycleEndAt : 0;
  const msLeft = Math.max(0, cycleEndAt - Date.now());
  const totalSec = Math.floor(msLeft / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  const cycleExpired = msLeft <= 0;

  const locked = isDisabled || noUses || cycleExpired;

  const [showUsePrompt, setShowUsePrompt] = useState(false);
  const [dismissedUsePrompt, setDismissedUsePrompt] = useState(false);

  useEffect(() => {
    if (forceModal) return;
    if (cycleExpired && !isDisabled && !dismissedUsePrompt) {
      setShowUsePrompt(true);
    }
  }, [cycleExpired, isDisabled, dismissedUsePrompt, forceModal, clockTick]);

  /* =========================
   * Derived
   * ========================= */
  const gamesForRooms = useMemo(
    () => (activeVendorId === "GR" ? GR_GAMES : ATG_GAMES),
    [activeVendorId]
  );

  const activeGameBase = useMemo(() => {
    return gamesForRooms.find((g) => g.id === activeGameId) || gamesForRooms[0];
  }, [gamesForRooms, activeGameId]);

  // ✅ 不要用每秒 tick 來重算，改用 bucket3Min（比較合理）
  const [gameCfg, setGameCfg] = useState(null);

  // ✅ 每 3 分鐘（bucket3Min）與切換遊戲時，同步 server 的 pages/totalRooms
  useEffect(() => {
    let alive = true;
    (async () => {
      const cfg = await getRoomConfig(activeVendorId, activeGameBase?.id);
      if (!alive) return;
      setGameCfg(cfg || null);
    })().catch(() => {
      if (alive) setGameCfg(null);
    });
    return () => {
      alive = false;
    };
  }, [activeVendorId, activeGameBase?.id, bucket3Min]);

  // ✅ 每 3 分鐘同步單房覆蓋（3 分鐘到期）
  const [overrideAll, setOverrideAll] = useState({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await getRoomRateOverrideAll();
      if (!alive) return;
      setOverrideAll(all || {});
    })().catch(() => {
      if (alive) setOverrideAll({});
    });
    return () => {
      alive = false;
    };
  }, [bucket3Min]);

  const activeGame = useMemo(() => {
    if (!activeGameBase) return null;
    return {
      ...activeGameBase,
      pages: gameCfg?.pages ?? activeGameBase.pages,
      totalRooms: gameCfg?.totalRooms ?? activeGameBase.totalRooms,
    };
  }, [activeGameBase, gameCfg]);

  const hotSet = useMemo(() => {
    return buildHotSet({
      gameId: activeGame?.id || "",
      totalRooms: activeGame?.totalRooms || 1,
      bucket3Min,
    });
  }, [activeGame?.id, activeGame?.totalRooms, bucket3Min]);

  const VISIBLE_PER_PAGE = 500;
  const startIndex = (roomPage - 1) * VISIBLE_PER_PAGE + 1;

  const rooms = useMemo(() => {
    return Array.from({ length: VISIBLE_PER_PAGE }).map((_, i) => {
      const no = startIndex + i;

      const isHot = hotSet.has(no);
      const roomRng = mulberry32(hashStrToInt(`${activeGameId}|ROOM|${no}|${bucket3Min}`));
      let rate = genRate(roomRng, isHot);

      const override = overrideAll?.[activeVendorId]?.[activeGameId]?.[String(no)] || null;
      if (override?.rate != null && (!override.expireAt || Date.now() < override.expireAt)) {
        rate = override.rate;
      }

      const level = rateLevel(rate);
      const hot = rate >= 92;
      return { no, rate, level, hot };
    });
  }, [activeVendorId, activeGameId, roomPage, bucket3Min, startIndex, hotSet]);

  const vendorCode = useMemo(() => randCode(10), [activeVendorId, bucket5Min]);

  /* =========================
   * ✅ 手機版：下拉選擇（只在 menuVendorPick 顯示）
   * ========================= */
  const [mVendor, setMVendor] = useState("ATG");
  const [mGame, setMGame] = useState("");

  const mGames = useMemo(() => (mVendor === "GR" ? GR_GAMES : ATG_GAMES), [mVendor]);

  useEffect(() => {
    setMGame("");
  }, [mVendor]);

  /* =========================
   * Handlers
   * ========================= */
  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  function handleLogout() {
    try { authLogout(); } catch {}
    setCurrentUser(null);
    setPage("login");
    setActiveVendorId("ATG");
    setActiveGameId("戰神賽特");
    setRoomPage(1);
    setSelectedRoom(null);
    setIntroOpen(false);
    setIntroPage(0);
    setIntroExpandedVendorId(null);
    setMainVideoSrc(bgVideo);

    setMVendor("ATG");
    setMGame("");
    closeMobileMenu();
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setSelectedRoom(null);
        setIntroOpen(false);
        setMainVideoSrc(bgVideo);
        closeMobileMenu();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (page === "introGames") {
      if (!introOpen) setMainVideoSrc(bgVideo);
      setIntroOpen(false);
      setIntroPage(0);
      setIntroExpandedVendorId(null);
      return;
    }
    setMainVideoSrc(bgVideo);
    setIntroOpen(false);
  }, [page, introOpen]);

  async function onUseOne() {
    try {
      const updated = await consumeOneUseAndRenew(currentUser.id);
      setCurrentUser(updated);
      setShowUsePrompt(false);
      setDismissedUsePrompt(false);
    } catch (e) {
      alert(e?.message || "使用失敗");
    }
  }
  function onNotUse() {
    setShowUsePrompt(false);
    setSelectedRoom(null);
    setDismissedUsePrompt(true);
  }
  function reopenUsePrompt() {
    setDismissedUsePrompt(false);
    setShowUsePrompt(true);
  }

  /* =========================
   * Sidebar (桌機) / Drawer (手機)
   * ========================= */
  const SidebarInner = () => (
    <>
      <div
        className={menu === "外掛選房程式" ? "menuBtnActive" : "menuBtn"}
        onClick={() => {
          setMenu("外掛選房程式");
          setPage("menuVendorPick");
          closeMobileMenu();
        }}
      >
        ⚙️ 外掛選房程式
      </div>

      <div
        className={menu === "遊戲介紹" ? "menuBtnActive" : "menuBtn"}
        onClick={() => {
          setMenu("遊戲介紹");
          setPage("introGames");
          setIntroExpandedVendorId(null);
          setIntroOpen(false);
          setIntroPage(0);
          closeMobileMenu();
        }}
      >
        📚 遊戲介紹
      </div>

      <div className="divider" />

      <button className="logoutBtn" onClick={handleLogout}>
        登出
      </button>

      <div className="userBoxMobile">
        <div className="userLine">
          使用者名稱：{currentUser.displayName || currentUser.id}
        </div>
        <div className="userLine">
          剩餘使用次數：{isUnlimited ? "無限" : `${usesLeft} 使用`}
        </div>
        <div className="userLine">
          當前次數剩餘時間：{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </div>

        {locked && (
          <div className="userWarn">
            {isDisabled ? "帳號已停用" : noUses ? "次數不足，已鎖定" : "本次使用時間已到"}
          </div>
        )}

        {cycleExpired && !isDisabled && dismissedUsePrompt && (
          <button
            type="button"
            onClick={() => {
              reopenUsePrompt();
              closeMobileMenu();
            }}
            className="userContinueBtn"
          >
            繼續使用
          </button>
        )}
      </div>
    </>
  );

  const Sidebar = () => (
    <aside className="sidebar">
      <SidebarInner />
    </aside>
  );

  if (page === "login") return <Navigate to="/login" replace />;

  const ForceModalUI = forceModal ? (
    <div className="modalMask" onClick={(e) => e.stopPropagation()}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">{forceModal.title}</div>
        <div className="modalSub">{forceModal.sub}</div>

        <button
          className="modalBackBtn"
          onClick={() => {
            setForceModal(null);
            handleLogout();
          }}
          style={{ marginTop: 14, width: "100%" }}
        >
          好的
        </button>
      </div>
    </div>
  ) : null;

  const MobileTopbar = (
    <div className="mobileTopbar">
      <div className="mobileTopLeft">
        <button
          className="hamburgerBtn"
          type="button"
          aria-label="Menu"
          onClick={() => setMobileMenuOpen(true)}
        >
          ≡
        </button>
        <div className="mobileTopTitle">
          {menu === "外掛選房程式" ? "外掛選房程式" : "遊戲介紹"}
        </div>
      </div>

      {page !== "menuVendorPick" && (
        <button
          className="topBackBtn"
          type="button"
          onClick={() => {
            setSelectedRoom(null);
            setIntroOpen(false);
            setIntroPage(0);
            setIntroExpandedVendorId(null);
            setMainVideoSrc(bgVideo);
            setPage("menuVendorPick");
            closeMobileMenu();
          }}
        >
          返回
        </button>
      )}
    </div>
  );

  const MobileDrawer = mobileMenuOpen ? (
    <div className="mobileDrawerMask" onClick={closeMobileMenu}>
      <div className="mobileDrawer" onClick={(e) => e.stopPropagation()}>
        <div className="mobileDrawerHeader">
          <div className="mobileDrawerTitle">選單</div>
          <button className="mobileDrawerClose" type="button" onClick={closeMobileMenu}>
            ×
          </button>
        </div>
        <div className="mobileDrawerInner">
          <SidebarInner />
        </div>
      </div>
    </div>
  ) : null;

  /* =========================
   * Views
   * ========================= */

  // ✅ menuVendorPick：手機用下拉
  if (page === "menuVendorPick") {
    return (
      <div className="app">
        {MobileTopbar}
        {MobileDrawer}

        <div className="desktopOnly">
          <Sidebar />
        </div>

        <MainWithVideo src={mainVideoSrc}>
          {/* ✅ 手機版 */}
          <div className="mobileOnly">
            <div className="mobileCenterWrap">
              <div className={`mControls ${mVendor ? "pickedVendor" : ""} ${mGame ? "pickedGame" : ""}`}>
                <div className="mControlBox systemBox">
                  <div className="mControlLabel">系統</div>
                  <select className="mSelect" value={mVendor} onChange={(e) => setMVendor(e.target.value)}>
                    {VENDORS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                {mVendor && (
                  <div className="mControlBox gameBox">
                    <div className="mControlLabel">遊戲類別</div>
                    <select className="mSelect" value={mGame} onChange={(e) => setMGame(e.target.value)}>
                      <option value="">請選擇遊戲</option>
                      {mGames.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mEnterRow">
                <div className="vendorCode mCodeCenter">代碼：{vendorCode}</div>

                <button
                  className="vendorPickBtn"
                  disabled={!mVendor || !mGame}
                  style={!mVendor || !mGame ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                  onClick={() => {
                    setActiveVendorId(mVendor);
                    setActiveGameId(mGame || (mVendor === "GR" ? "GR-1" : "戰神賽特"));
                    setRoomPage(1);
                    setSelectedRoom(null);
                    setPage("rooms");
                  }}
                >
                  進入
                </button>
              </div>
            </div>
          </div>

          {/* ✅ 桌機版：維持兩張卡片 */}
          <div className="desktopOnly">
            <div className="vendorGrid2">
              {VENDORS.map((v) => (
                <div key={v.id} className="vendorCard">
                  <div className="vendorImgWrap">
                    <img className="vendorImg" src={v.logo} alt={v.name} />
                  </div>
                  <div className="vendorName">{v.name}</div>
                  <div className="vendorCode">代碼：{vendorCode}</div>

                  <button
                    className="vendorPickBtn"
                    onClick={() => {
                      setActiveVendorId(v.id);
                      setActiveGameId(v.id === "GR" ? "GR-1" : "戰神賽特");
                      setRoomPage(1);
                      setSelectedRoom(null);
                      setPage("rooms");
                    }}
                  >
                    進入
                  </button>
                </div>
              ))}
            </div>
          </div>
        </MainWithVideo>

        {showUsePrompt && !isDisabled && !forceModal && (
          <div className="modalMask" onClick={onNotUse}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">提示</div>
              <div className="modalSub">當前次數時間已到</div>
              <div className="modalLine">剩餘次數：{isUnlimited ? "無限" : `${usesLeft} 次`}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="modalBackBtn" onClick={onUseOne}>
                  使用
                </button>
                <button className="modalBackBtn" onClick={onNotUse}>
                  不使用
                </button>
              </div>
            </div>
          </div>
        )}

        {ForceModalUI}
      </div>
    );
  }

// ✅ rooms
if (page === "rooms") {
  return (
    <div className="app">
      {MobileTopbar}
      {MobileDrawer}

      <div className="desktopOnly">
        <Sidebar />
      </div>

      <MainWithVideo src={mainVideoSrc}>
        {/* 桌機：左側遊戲列表 */}
        <div className="gamesDockLeft desktopOnly">
          <div className="gamesTopBar">
            <div className="gamesTitle">遊戲</div>
            <button className="backBtn" onClick={() => setPage("menuVendorPick")}>
              返回
            </button>
          </div>

          <div className="gamesList">
            {gamesForRooms.map((g) => {
              const active = g.id === activeGameId;
              return (
                <div key={g.id} className={active ? "gameRow active" : "gameRow"}>
                  <div className="gameThumbWrap">
                    <img className="gameThumb" src={g.img} alt={g.name} />
                  </div>
                  <div className="gameInfo">
                    <div className="gameName">{g.name}</div>
                    <div className="gameMeta">
                      {g.id}（共 {activeGame?.totalRooms ?? g.totalRooms} 房）
                    </div>
                  </div>
                  <button
                    className="gamePickBtnSmall"
                    onClick={() => {
                      setActiveGameId(g.id);
                      setRoomPage(1);
                      setSelectedRoom(null);
                    }}
                  >
                    選擇
                  </button>
                </div>
              );
            })}
          </div>

          <div className="refreshHint">實時更新（區段：{bucket3Min}）</div>
        </div>

        <div className="rightShell">
          <div className="roomsHeader">
            <div className="roomsTitle">
              {activeGame?.id} 選房（共 {activeGame?.totalRooms} 房）
            </div>

            <div className="pageBtns">
              {Array.from({ length: activeGame?.pages ?? 1 }).map((_, idx) => {
                const n = idx + 1;
                const active = n === roomPage;
                return (
                  <button
                    key={n}
                    className={active ? "pageBtnActive" : "pageBtn"}
                    onClick={() => {
                      setRoomPage(n);
                      setSelectedRoom(null);
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rightScroll">
            {/* ✅ 桌機 roomsGrid */}
            <div className="desktopOnly">
              <div className="roomsGrid">
                {rooms.map((r) => {
                  const isSelected = !locked && selectedRoom?.no === r.no;

                  return (
                    <button
                      key={r.no}
                      className={`room-card room-card-btn
                        ${locked ? "gray" : r.level}
                        ${!locked && r.hot ? "redHot" : ""}
                        ${isSelected ? "selected" : ""}
                      `}
                      onClick={() => {
                        if (locked) return;
                        const reco = makeRecoATG({
                          gameId: activeGameId,
                          roomNo: r.no,
                          bucket3Min,
                          rate: r.rate,
                        });
                        setSelectedRoom({ ...r, reco });
                      }}
                      disabled={locked}
                      style={locked ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                    >
                      <span className="roomNoRow">
                        <span className="roomNoPrefix">第</span>
                        <span className="roomNoNum">{String(r.no).padStart(3, "0")}</span>
                        <span className="roomNoSuffix">台</span>
                      </span>

                      {!locked && (
                        <span className="roomRateRow">
                          <span className="roomRateLabel">大獎中獎率</span>
                          <span className="roomRateValue">{r.rate}%</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ✅ 手機 roomsGrid */}
            <div className="mobileOnly">
              <div className="roomsGrid">
                {rooms.map((r) => {
                  const isSelected = !locked && selectedRoom?.no === r.no;

                  return (
                    <button
                      key={r.no}
                      className={`room-card room-card-btn
                        ${locked ? "gray" : r.level}
                        ${!locked && r.hot ? "redHot" : ""}
                        ${isSelected ? "selected" : ""}
                      `}
                      onClick={() => {
                        if (locked) return;
                        const reco = makeRecoATG({
                          gameId: activeGameId,
                          roomNo: r.no,
                          bucket3Min,
                          rate: r.rate,
                        });
                        setSelectedRoom({ ...r, reco });
                      }}
                      disabled={locked}
                      style={locked ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                    >
                      <span className="roomNoRow">
                        <span className="roomNoPrefix">第</span>
                        <span className="roomNoNum">{String(r.no).padStart(3, "0")}</span>
                        <span className="roomNoSuffix">台</span>
                      </span>

                      {!locked && (
                        <span className="roomRateRow">
                          <span className="roomRateLabel">大獎中獎率</span>
                          <span className="roomRateValue">{r.rate}%</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </MainWithVideo>

      {selectedRoom && !locked && !forceModal && (
        <div className="modalMask" onClick={() => setSelectedRoom(null)}>
          <div
  className={`modalCard ${
    selectedRoom?.hot
      ? "modalRedHot"
      : selectedRoom?.level === "red"
      ? "modalRed"
      : selectedRoom?.level === "yellow"
      ? "modalYellow"
      : ""
  }`}
  onClick={(e) => e.stopPropagation()}
>
            <div className="modalTitle">第{String(selectedRoom.no).padStart(3, "0")}台</div>
            <div className="modalSub">大獎中獎率{selectedRoom.rate}%</div>

            <div className="modalLine">建議平轉金額{selectedRoom.reco.flat}元</div>
            <div className="modalLine">
              平轉{selectedRoom.reco.spinFrom}轉-{selectedRoom.reco.spinTo}轉
            </div>
            <div className="modalLine">建議購買免費遊戲{selectedRoom.reco.buy}元</div>

            <button className="modalBackBtn" onClick={() => setSelectedRoom(null)}>
              返回
            </button>
          </div>
        </div>
      )}

      {showUsePrompt && !isDisabled && !forceModal && (
        <div className="modalMask" onClick={onNotUse}>
          <div
  className={`modalCard ${selectedRoom?.level || ""} ${selectedRoom?.hot ? "redHot" : ""}`}
  onClick={(e) => e.stopPropagation()}
>
            <div className="modalTitle">提示</div>
            <div className="modalSub">當前次數時間已到</div>
            <div className="modalLine">剩餘次數：{isUnlimited ? "無限" : `${usesLeft} 次`}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="modalBackBtn" onClick={onUseOne}>
                使用
              </button>
              <button className="modalBackBtn" onClick={onNotUse}>
                不使用
              </button>
            </div>
          </div>
        </div>
      )}

      {ForceModalUI}
    </div>
  );
}

  // introGames（維持原本）
  const vendorsForIntro = [
    { id: "ATG", name: "ATG電子", logo: vendorATG, games: ATG_GAMES },
    { id: "GR", name: "GR電子", logo: vendorGR || vendorATG, games: GR_GAMES },
  ];

  const INTRO_PAGES = [
    { title: "遊戲玩法" },
    { title: "免費遊戲" },
    { title: "購買免費遊戲" },
    { title: "倍數特色" },
    { title: "免費遊戲符號" },
    { title: "JACKPOT說明" },
    { title: "神秘寶箱" },
  ];
  const INTRO_IMAGES = [intro1, intro2, intro3, intro4, intro5, intro6, intro7];
  const INTRO_TOTAL = INTRO_PAGES.length;

  const toggleVendor = (vid) => {
    setIntroOpen(false);
    setIntroPage(0);
    setIntroExpandedVendorId((cur) => (cur === vid ? null : vid));
  };

  return (
    <div className="app">
      {MobileTopbar}
      {MobileDrawer}

      <div className="desktopOnly">
        {!introOpen && <Sidebar />}
      </div>

      <MainWithVideo src={mainVideoSrc}>
        {!introOpen && (
          <div className="gamesDockLeft">
            <div className="gamesTopBar">
              <div className="gamesTitle">遊戲</div>
              <button
                className="backBtn"
                onClick={() => {
                  setIntroExpandedVendorId(null);
                  setIntroOpen(false);
                  setIntroPage(0);
                  setPage("menuVendorPick");
                }}
              >
                返回
              </button>
            </div>

            <div className="gamesList">
              {vendorsForIntro.map((v) => {
                const expanded = introExpandedVendorId === v.id;
                return (
                  <div key={v.id}>
                    <div
                      className="gameRow"
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleVendor(v.id)}
                    >
                      <div className="gameThumbWrap">
                        <img className="gameThumb" src={v.logo} alt={v.name} />
                      </div>
                      <div className="gameInfo">
                        <div className="gameName">{v.name}</div>
                        <div className="gameMeta">{expanded ? "點此收回 ▲" : "點此展開 ▼"}</div>
                      </div>
                      <button
                        className="gamePickBtnSmall"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVendor(v.id);
                        }}
                      >
                        {expanded ? "收回" : "展開"}
                      </button>
                    </div>

                    {expanded && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                        {v.games.map((g, idx) => {
                          const isFirstATG = v.id === "ATG" && idx === 0;
                          return (
                            <div key={g.id} className="gameRow">
                              <div className="gameThumbWrap">
                                <img className="gameThumb" src={g.img} alt={g.name} />
                              </div>
                              <div className="gameInfo">
                                <div className="gameName">{g.name}</div>
                                <div className="gameMeta">{g.id}</div>
                              </div>
                              <button
                                className="gamePickBtnSmall"
                                onClick={() => {
                                  if (isFirstATG) {
                                    setIntroPage(0);
                                    setMainVideoSrc(sethGameplay);
                                    setIntroOpen(true);
                                  } else {
                                    alert("尚未開放。");
                                  }
                                }}
                              >
                                介紹
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="refreshHint">（更多系統正在開發中）</div>
          </div>
        )}
      </MainWithVideo>

      {introOpen && !forceModal && (
        <div
          className="introFullMask"
          onClick={() => {
            setIntroOpen(false);
            setMainVideoSrc(bgVideo);
          }}
        >
          <button
            className="introX"
            onClick={(e) => {
              e.stopPropagation();
              setIntroOpen(false);
              setMainVideoSrc(bgVideo);
            }}
            aria-label="Close"
            type="button"
          >
            ×
          </button>

          <div className="introCard" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
            <div className="introCardHeader">
              <div className="introCardTitle big48">
                {INTRO_PAGES[introPage]?.title || "遊戲玩法"}
              </div>
            </div>

            <div className="introCardBody">
              <div className="introImgWrap">
                <img
                  className="introImg"
                  src={INTRO_IMAGES[introPage] || INTRO_IMAGES[0]}
                  alt={INTRO_PAGES[introPage]?.title || "intro"}
                  draggable={false}
                />
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                right: 18,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {Array.from({ length: INTRO_TOTAL }).map((_, idx) => {
                const active = idx === introPage;
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Page ${idx + 1}`}
                    onClick={() => setIntroPage(idx)}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.55)",
                      background: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.15)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {ForceModalUI}
    </div>
  );
}