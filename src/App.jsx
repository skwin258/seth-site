// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSite } from "./store/SiteStore";

import FrontApp from "./pages/FrontApp.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";

// ✅ 新增：後台用 authService 的 session
import { getAdminSession } from "./services/authService";

/* =========================
   🔐 前台登入保護
========================= */
function UserGuard({ children }) {
  const { currentUser } = useSite();

  // 等待初始化（避免刷新黑畫面）
  if (currentUser === undefined) return null;

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/* =========================
   🔐 後台登入保護（✅ 改成讀 sk_admin_session_v1）
========================= */
function AdminGuard({ children }) {
  const sess = getAdminSession(); // 讀 localStorage: sk_admin_session_v1
  if (!sess?.id) return <Navigate to="/admin-login" replace />;
  return children;
}

/* =========================
   APP
========================= */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ===== 前台登入 ===== */}
        <Route path="/login" element={<Login />} />

        {/* ===== 前台首頁（需登入）===== */}
        <Route
          path="/"
          element={
            <UserGuard>
              <FrontApp />
            </UserGuard>
          }
        />

        {/* ===== 後台登入 ===== */}
        <Route path="/admin-login" element={<AdminLogin />} />

        {/* ===== 後台頁面（需登入）===== */}
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <Admin />
            </AdminGuard>
          }
        />

        {/* ⭐ 任何未知路徑導回首頁 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}