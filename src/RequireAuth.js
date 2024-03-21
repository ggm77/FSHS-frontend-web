import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const isAuthenticated = () => {
    // 로컬 스토리지에서 토큰을 검색합니다.
    const token = localStorage.getItem('accessToken');
    return !!token;
  };

const RequireAuth = ({ children }) => {
  let location = useLocation();

  if (!isAuthenticated()) {
    // 로그인 상태가 아니라면, /login 경로로 리다이렉트합니다.
    // 이 때, 현재 위치(location)을 상태로 전달하여 로그인 후 돌아올 수 있도록 합니다.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth;