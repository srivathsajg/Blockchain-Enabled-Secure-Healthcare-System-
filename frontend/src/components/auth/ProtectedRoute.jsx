import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, token, loading } = useAuth();
  const location = useLocation();

  console.log('=== PROTECTED ROUTE DEBUG ===');
  console.log('Path:', location.pathname);
  console.log('Loading:', loading);
  console.log('Token exists:', !!token);
  console.log('User:', user);
  console.log('User role:', user?.role);
  console.log('Allowed roles:', allowedRoles);

  if (loading) {
    console.log('→ Still loading auth...');
    // Return a loading spinner or null while auth is initializing
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b0d11] text-white">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-emerald-500/20 rounded-full mb-4"></div>
          <div className="h-4 w-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    console.log('→ No token or user, redirecting to /login');
    // Redirect to login but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.log('→ Role not allowed, redirecting to /unauthorized');
    return <Navigate to="/unauthorized" replace />;
  }

  console.log('→ Access granted, rendering children');
  return children;
};

export default ProtectedRoute;
