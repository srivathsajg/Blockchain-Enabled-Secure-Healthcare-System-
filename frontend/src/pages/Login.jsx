import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';
import api from '../services/axiosInstance';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.identifier || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/login', {
        identifier: formData.identifier,
        password: formData.password
      });

      if (response.data.success) {
        console.log('=== LOGIN SUCCESS DEBUG ===');
        console.log('User:', response.data.user);
        console.log('Role:', response.data.user.role);
        console.log('Token exists:', !!response.data.token);

        login(response.data.user, response.data.token);

        // Redirect to dashboard based on role or to previous location
        if (from !== '/') {
          console.log('Redirecting to previous location:', from);
          navigate(from, { replace: true });
        } else {
          // Default redirects based on role
          const role = response.data.user.role;
          console.log('Determining redirect for role:', role);

          if (role === 'patient') {
            console.log('→ Redirecting to /patient-dashboard');
            navigate('/patient-dashboard');
          }
          else if (role === 'doctor') {
            console.log('→ Redirecting to /doctor-dashboard');
            navigate('/doctor-dashboard');
          }
          else if (role === 'pharmacist') {
            console.log('→ Redirecting to /pharmacy-dashboard');
            navigate('/pharmacy-dashboard');
          }
          else if (role === 'delivery') {
            console.log('→ Redirecting to /delivery-dashboard');
            navigate('/delivery-dashboard');
          }
          else if (role === 'lab_technician') {
            console.log('→ Redirecting to /lab-dashboard');
            navigate('/lab-dashboard');
          }
          else if (role === 'admin') {
            console.log('→ Redirecting to /admin-dashboard');
            navigate('/admin-dashboard');
          }
          else if (role === 'ambulance') {
            console.log('→ Redirecting to /ambulance-dashboard');
            navigate('/ambulance-dashboard');
          }
          else {
            console.log('→ No matching role, redirecting to Home');
            navigate('/');
          }
        }
      }
    } catch (err) {
      console.error("Login failed", err);
      setError(err.response?.data?.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0a0a0a] rounded-3xl shadow-2xl border border-gray-800 overflow-hidden">
        <div className="p-8 sm:p-10">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-gray-400">Sign in to access your healthcare dashboard</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Email or Phone</label>
              <div className="relative">
                <input
                  type="text"
                  name="identifier"
                  value={formData.identifier}
                  onChange={handleInputChange}
                  placeholder="e.g. sarah@example.com"
                  className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-3 pl-11 text-white placeholder-gray-600 focus:outline-none focus:border-green-500 transition-colors"
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail size={18} className="text-gray-500" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-sm font-medium text-gray-300">Password</label>
                <a href="#" className="text-xs text-green-500 hover:text-green-400">Forgot password?</a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter your password"
                  className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-3 pl-11 pr-11 text-white placeholder-gray-600 focus:outline-none focus:border-green-500 transition-colors"
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-500" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  Sign In <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-400 text-sm">
              Don't have an account?{' '}
              <Link to="/" className="text-green-500 hover:text-green-400 font-medium">
                Register on Home Page
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
