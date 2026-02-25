// src/store/SiteStore.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser, logout as authLogout } from "../services/authService";

const SiteContext = createContext();

export function SiteProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());

  const [siteData, setSiteData] = useState({
    title: "電子AI選房系統",
    announcement: "歡迎使用系統",
    maintenance: false,
  });

  useEffect(() => {
    if (!currentUser) authLogout();
  }, [currentUser]);

  // ✅ 同步 storage（同頁/跨頁都會更新）
  useEffect(() => {
    const onStorage = (e) => {
      const key = e?.key || "";

      // ✅ 新版 keys（Workers + D1 相容）
      if (
        key === "sk_current_user" ||
        key === "sk_user_token_v1" ||
        key === "sk_game_cfg_v1" ||
        key === "sk_room_rate_all_v1" ||
        key === "sk_last_bucket" // 你舊邏輯有用就保留
      ) {
        setCurrentUser(getCurrentUser());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <SiteContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        siteData,
        setSiteData,
      }}
    >
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}