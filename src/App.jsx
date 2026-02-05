import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import vendorATG from "./assets/logo.png";
import vendorGR from "./assets/gr_logo.png";

import game1 from "./assets/game1.png";
import game2 from "./assets/game2.png";
import game3 from "./assets/game3.png";
import game4 from "./assets/game4.png";
import game5 from "./assets/game5.png";

import gr1 from "./assets/gr1.png";
import gr2 from "./assets/gr2.png";
import gr3 from "./assets/gr3.png";

import intro1 from "./assets/intro_1.png";
import intro2 from "./assets/intro_2.png";
import intro3 from "./assets/intro_3.png";
import intro4 from "./assets/intro_4.png";
import intro5 from "./assets/intro_5.png";
import intro6 from "./assets/intro_6.png";
import intro7 from "./assets/intro_7.png";

import bgVideo from "./assets/bg.mp4";
import sethGameplay from "./assets/seth_gameplay.mp4";

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

function rateLevel(rate) {
  if (rate >= 90) return "red";
  if (rate >= 70) return "yellow";
  return "gray";
}

const ATG_AMOUNTS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40, 42, 48, 54, 56, 60, 64, 72, 80
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

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
  const pairs = [
    [40, 50],
    [50, 60],
    [60, 70],
    [70, 80],
    [80, 90],
  ];
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
 * 資料
 * ========================= */
const ATG_GAMES = [
  { id: "戰神賽特", name: "戰神賽特", img: game1, totalRooms: 3000, pages: 6 },
  { id: "G-2", name: "武俠", img: game2, totalRooms: 3000, pages: 6 },
  { id: "G-3", name: "赤三國", img: game3, totalRooms: 1000, pages: 2 },
  { id: "G-4", name: "孫行者", img: game4, totalRooms: 500, pages: 1 },
  { id: "G-5", name: "覺醒之力", img: game5, totalRooms: 500, pages: 1 },
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

function MainWithVideo({ className = "", src = bgVideo, children }) {
  const videoRef = React.useRef(null);

  // ✅ src 變更時，強制重新載入影片並播放
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // 這三行是關鍵：確保切換 src 一定生效
    try {
      v.pause();
      v.load(); // 讓瀏覽器重新讀 src
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

export default function App() {
  /* =========================
   * State
   * ========================= */
  const [authed, setAuthed] = useState(true);
  const [page, setPage] = useState("menuVendorPick"); // login/menuVendorPick/rooms/introVendorPick/introGames

  const [account, setAccount] = useState("");
  const [pin, setPin] = useState("");

  const [menu, setMenu] = useState("外掛選房程式");
  const [activeVendorId, setActiveVendorId] = useState("ATG");

  const [activeGameId, setActiveGameId] = useState("G-1");
  const [roomPage, setRoomPage] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState(null);

  // ✅ 遊戲介紹
  const [introOpen, setIntroOpen] = useState(false);
  const [introGameId, setIntroGameId] = useState("G-1");

  // ✅ 介紹頁：目前第幾頁（0~6）
  const [introPage, setIntroPage] = useState(0);

  // ✅ 新增：介紹頁「展開中的系統商」(ATG/GR/null)
  const [introExpandedVendorId, setIntroExpandedVendorId] = useState(null);

  // ✅ 背景影片來源（各頁自己控制；避免被介紹頁汙染）
  const [mainVideoSrc, setMainVideoSrc] = useState(bgVideo);

  // ✅ 3 分鐘刷新一次（避免每秒 re-render 造成 video 重掛載）
  const [bucket3Min, setBucket3Min] = useState(() => Math.floor(Date.now() / 180000));
  useEffect(() => {
    const id = setInterval(() => setBucket3Min(Math.floor(Date.now() / 180000)), 180000);
    return () => clearInterval(id);
  }, []);

  /* =========================
   * Derived
   * ========================= */
  const vendorCode = useMemo(() => randCode(10), [activeVendorId]);

  // ✅ rooms 用的遊戲列表（不動）
  const gamesForRooms = useMemo(() => {
    return activeVendorId === "GR" ? GR_GAMES : ATG_GAMES;
  }, [activeVendorId]);

  const activeGame = useMemo(
    () => gamesForRooms.find((g) => g.id === activeGameId) || gamesForRooms[0],
    [gamesForRooms, activeGameId]
  );

  const hotSet = useMemo(() => {
    return buildHotSet({
      gameId: activeGame.id,
      totalRooms: activeGame.totalRooms,
      bucket3Min,
    });
  }, [activeGame.id, activeGame.totalRooms, bucket3Min]);

  const VISIBLE_PER_PAGE = 500;
  const startIndex = (roomPage - 1) * 500 + 1;

  const rooms = useMemo(() => {
    return Array.from({ length: VISIBLE_PER_PAGE }).map((_, i) => {
      const no = startIndex + i;
      const isHot = hotSet.has(no);
      const roomRng = mulberry32(hashStrToInt(`${activeGameId}|ROOM|${no}|${bucket3Min}`));
      const rate = genRate(roomRng, isHot);
      const level = rateLevel(rate);
      const hot = rate >= 92;
      return { no, rate, level, hot };
    });
  }, [activeGameId, roomPage, bucket3Min, startIndex, hotSet]);

  // ✅ 介紹內容（7頁 title；文字不顯示，但保留資料結構不動）
  const INTRO_PAGES = useMemo(() => {
    return [
      { title: "遊戲玩法", lines: [] },
      { title: "免費遊戲", lines: [] },
      { title: "購買免費遊戲", lines: [] },
      { title: "倍數特色", lines: [] },
      { title: "免費遊戲符號", lines: [] },
      { title: "JACKPOT說明", lines: [] },
      { title: "神秘寶箱", lines: [] },
    ];
  }, []);

  // ✅ 7 張圖片（依 introPage 切換）
  const INTRO_IMAGES = useMemo(() => {
    return [intro1, intro2, intro3, intro4, intro5, intro6, intro7];
  }, []);

  const INTRO_TOTAL = INTRO_PAGES.length;
  const isIntroFullScreen = introOpen === true;

  /* =========================
   * Handlers
   * ========================= */
  function handleLogout() {
    setAuthed(false);
    setPage("login");
    setAccount("");
    setPin("");
    setActiveVendorId("ATG");
    setActiveGameId("G-1");
    setRoomPage(1);
    setSelectedRoom(null);

    setIntroOpen(false);
    setIntroGameId("G-1");
    setIntroPage(0);
    setIntroExpandedVendorId(null);

    setMainVideoSrc(bgVideo);
  }

  function handleLogin() {
    setAuthed(true);
    setPage("menuVendorPick");
  }

  /* =========================
   * Global effects
   * ========================= */

  // ✅ ESC：關閉 modal（選房 modal + 介紹 modal）
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setSelectedRoom(null);
        setIntroOpen(false);

        // ✅ 關閉回 bg
        setMainVideoSrc(bgVideo);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ✅ 修正「介紹頁汙染影片」：
useEffect(() => {
  // ✅ 只在「切換到 introGames 頁面」時，確保背景是 bgVideo
  // ✅ 但不要在這裡動 sethGameplay（sethGameplay 只在按「介紹」時才切）
  if (page === "introGames") {
    if (!introOpen) setMainVideoSrc(bgVideo);

    setIntroOpen(false);
    setIntroPage(0);
    setIntroExpandedVendorId(null);
    setIntroGameId("G-1");
    return;
  }

  // ✅ 其他頁面：背景都回 bg，且關閉介紹
  setMainVideoSrc(bgVideo);
  setIntroOpen(false);
}, [page]); 

  // ✅ 滾輪切頁（節流）
  useEffect(() => {
    if (!introOpen) return;

    let last = 0;
    const onWheel = (e) => {
      e.preventDefault();

      const now = Date.now();
      if (now - last < 220) return;
      last = now;

      const dy = e.deltaY || 0;
      if (Math.abs(dy) < 5) return;

      setIntroPage((p) => {
        const next = dy > 0 ? p + 1 : p - 1;
        return clamp(next, 0, INTRO_TOTAL - 1);
      });
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [introOpen, INTRO_TOTAL]);

  /* =========================
   * Sidebar（共用）
   * ========================= */
  const Sidebar = () => (
    <aside className="sidebar">
      <div
        className={menu === "外掛選房程式" ? "menuBtnActive" : "menuBtn"}
        onClick={() => {
          setMenu("外掛選房程式");
          setPage("menuVendorPick");
        }}
      >
        ⚙️ 外掛選房程式
      </div>

      <div
        className={menu === "遊戲介紹" ? "menuBtnActive" : "menuBtn"}
        onClick={() => {
          // ✅ 改這裡：不再去 introVendorPick，直接到 introGames
          setMenu("遊戲介紹");
          setPage("introGames");
          setIntroExpandedVendorId(null);
          setIntroOpen(false);
          setIntroPage(0);
        }}
      >
        📚 遊戲介紹
      </div>

      <div className="divider" />

      <button className="logoutBtn" onClick={handleLogout}>
        登出
      </button>
    </aside>
  );

  /* =========================
   * Views
   * ========================= */

  // 1) 登入
  if (!authed || page === "login") {
    return (
      <div className="app loginOnly">
        <MainWithVideo className="single" src={mainVideoSrc}>
          <div className="panel loginPanel">
            <div className="title">SK-電子外掛程式</div>
            <div className="version">版本：v3.4.26</div>

            <input
              className="input"
              placeholder="請輸入會員帳號"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
            <input
              className="input"
              placeholder="請輸入PIN 碼"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />

            <button className="button" onClick={handleLogin}>
              登入
            </button>
          </div>
        </MainWithVideo>
      </div>
    );
  }

  // 其餘頁面用 switch 統一回傳
  switch (page) {
    /* =========================
     * 2) 外掛選房程式：選系統
     * ========================= */
    case "menuVendorPick":
      return (
        <div className="app">
          <Sidebar />
          <MainWithVideo src={mainVideoSrc}>
            <div className="vendorGrid2">
              {VENDORS.map((v) => {
                const code = v.hasCode ? randCode(10) : "";
                return (
                  <div key={v.id} className="vendorCard">
                    <div className="vendorImgWrap">
                      <img className="vendorImg" src={v.logo} alt={v.name} />
                    </div>
                    <div className="vendorName">{v.name}</div>
                    <div className="vendorCode">代碼：{code}</div>

                    <button
                      className="vendorPickBtn"
                      onClick={() => {
                        setActiveVendorId(v.id);
                        setActiveGameId(v.id === "GR" ? "GR-1" : "G-1");
                        setRoomPage(1);
                        setSelectedRoom(null);
                        setPage("rooms");
                      }}
                    >
                      進入
                    </button>
                  </div>
                );
              })}
            </div>
          </MainWithVideo>
        </div>
      );

    /* =========================
     * 3) 外掛選房程式：選房
     * ========================= */
    case "rooms":
      return (
        <div className="app">
          <Sidebar />

          <MainWithVideo src={mainVideoSrc}>
            <div className="gamesDockLeft">
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
                          {g.id}（共 {g.totalRooms} 房）
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

              <div className="refreshHint">3 分鐘刷新一次（區段：{bucket3Min}）</div>
            </div>

            <div className="rightShell">
              <div className="roomsHeader">
                <div className="roomsTitle">
                  {activeGame.id} 選房（共 {activeGame.totalRooms} 房）
                </div>

                <div className="pageBtns">
                  {Array.from({ length: activeGame.pages }).map((_, idx) => {
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
                <div className="roomsGrid">
                  {rooms.map((r) => (
                    <button
                      key={r.no}
                      className={`room-card room-card-btn ${r.level} ${r.hot ? "redHot" : ""}`}
                      onClick={() => {
                        const reco = makeRecoATG({
                          gameId: activeGameId,
                          roomNo: r.no,
                          bucket3Min,
                          rate: r.rate,
                        });
                        setSelectedRoom({ ...r, reco });
                      }}
                    >
                      <span className="room-id">第{String(r.no).padStart(3, "0")}台</span>
                      <span className="room-rate">大獎中獎率{r.rate}%</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </MainWithVideo>

          {selectedRoom && (
            <div className="modalMask" onClick={() => setSelectedRoom(null)}>
              <div
                className={`modalCard ${selectedRoom.level === "yellow" ? "modalYellow" : ""} ${
                  selectedRoom.level === "red"
                    ? selectedRoom.rate >= 92
                      ? "modalRedHot"
                      : "modalRed"
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
        </div>
      );

    /* =========================
     * 4) 遊戲介紹主頁（✅ 直接進來；兩個系統商可展開/收合）
     * ========================= */
    case "introGames":
    default: {
      // ✅ 介紹頁：兩個系統商 + 遊戲列表（展開才顯示）
      const vendorsForIntro = [
        { id: "ATG", name: "ATG電子", logo: vendorATG, games: ATG_GAMES },
        { id: "GR", name: "GR電子", logo: vendorGR || vendorATG, games: GR_GAMES },
      ];

      const toggleVendor = (vid) => {
        setIntroOpen(false);
        setIntroPage(0);
        setIntroExpandedVendorId((cur) => (cur === vid ? null : vid));
      };

      return (
        <div className="app">
          {/* ✅ 介紹開啟時：Sidebar 消失 */}
          {!isIntroFullScreen && <Sidebar />}

          <MainWithVideo src={mainVideoSrc}>
            {/* ✅ 介紹開啟時：左側列表也消失 */}
            {!isIntroFullScreen && (
              <div className="gamesDockLeft">
                <div className="gamesTopBar">
                  <div className="gamesTitle">遊戲</div>

                  {/* ✅ 返回：改成「收合」(不離開頁面) */}
                  <button
                    className="backBtn"
                    onClick={() => {
                      setIntroExpandedVendorId(null);
                      setIntroOpen(false);
                      setIntroPage(0);
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
                        {/* ✅ 系統商列：點一下展開/收合 */}
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

                        {/* ✅ 展開區：遊戲列表 */}
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
                                      // ✅ 目前只做 ATG 第一個（戰神賽特）的介紹效果
                                      if (isFirstATG) {
                                        setIntroGameId(g.id);
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

                <div className="refreshHint">（展示框架用）</div>
              </div>
            )}
          </MainWithVideo>

          {/* ✅ 全屏暗底（沒有框線） */}
          {introOpen && (
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
                  setMainVideoSrc(bgVideo); // ✅ 關閉回 bg
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

                {/* ✅ 下面只放 PNG，不放任何文字 */}
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

                {/* ✅ 右側 7 個點（取代底部 1/7 與 dots；不顯示滾動標誌） */}
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
        </div>
      );
    }
  }
}
