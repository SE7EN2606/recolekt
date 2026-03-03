import { API_BASE } from "../utils/api";
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useData } from '../context/DataContext';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useData();
  const location = useLocation();

  if (!user) {
    // Redirect to /auth, saving the current location they tried to access
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
