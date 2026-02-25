// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import FrontApp from "./pages/FrontApp.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";

function AppShell() {
  const loc = useLocation();
  const isLogin =
    loc.pathname === "/login" || loc.pathname === "/admin-login";

  // ✅ 保留你 CSS 依賴的 .app / .app.loginOnly
  return (
    <div className={`app ${isLogin ? "loginOnly" : ""}`}>
      <Routes>
        <Route path="/" element={<FrontApp />} />
        <Route path="/login" element={<Login />} />

        <Route path="/admin" element={<Admin />} />
        <Route path="/admin-login" element={<AdminLogin />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}