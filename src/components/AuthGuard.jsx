// seth-site/src/components/AuthGuard.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { getAdminSession } from "../services/authService";

export default function AuthGuard({ children }) {
  const sess = getAdminSession();
  if (!sess?.id) return <Navigate to="/admin-login" replace />;
  return children;
}