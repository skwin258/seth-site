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
      if (
        e.key === "sk_current_user" ||
        e.key === "sk_users" ||
        e.key === "sk_room_config" ||
        e.key === "sk_last_bucket"
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