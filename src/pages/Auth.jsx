import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Cross-Play'];

export default function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [form, setForm] = useState({
    email: '', password: '', username: '', display_name: '', platform: 'PC',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email, password: form.password,
        });
        if (error) throw error;
      } else {
        if (!form.username.trim()) throw new Error('Username is required.');
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              username: form.username.trim().toLowerCase().replace(/\s+/g, '_'),
              display_name: form.display_name.trim() || form.username.trim(),
            },
          },
        });
        if (error) throw error;

        // Set platform immediately after signup
        if (data.user) {
          await supabase
            .from('profiles')
            .update({ platform: form.platform })
            .eq('id', data.user.id);
        }
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600 transition-colors';

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Shield size={40} className="text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-white leading-none">WZ Social</h1>
            <p className="text-zinc-500 text-xs">Warzone Community Hub</p>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-5">
            {isLogin ? 'Welcome back, Operator' : 'Enlist Now'}
          </h2>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Username</label>
                  <input
                    type="text" required value={form.username} onChange={set('username')}
                    placeholder="your_callsign" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Display Name (optional)</label>
                  <input
                    type="text" value={form.display_name} onChange={set('display_name')}
                    placeholder="Ghost" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Platform</label>
                  <select value={form.platform} onChange={set('platform')} className={inputCls}>
                    {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email</label>
              <input
                type="email" required value={form.email} onChange={set('email')}
                placeholder="operator@email.com" className={inputCls}
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Password</label>
              <input
                type="password" required value={form.password} onChange={set('password')}
                placeholder="••••••••" minLength={6} className={inputCls}
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors mt-2"
            >
              {loading ? 'Loading…' : isLogin ? 'Deploy' : 'Enlist'}
            </button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-6">
            {isLogin ? 'New here?' : 'Already enlisted?'}{' '}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-orange-400 hover:text-orange-300 transition-colors"
            >
              {isLogin ? 'Create account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
