import { createContext, useContext, useState, useEffect } from "react";

const SiteContext = createContext();

export function SiteProvider({ children }) {
  // ✅ 初始化直接從 localStorage 讀（避免 F5 被登出）
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("user"); // ⭐ 統一用 user
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // ✅ 當 currentUser 變化時同步到 localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("user");
    }
  }, [currentUser]);

  // ✅ 登出用
  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem("user");
  };

  return (
    <SiteContext.Provider value={{ currentUser, setCurrentUser, logout }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}