import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Cross-Play'];
const RANKS     = ['Bronze','Silver','Gold','Platinum','Diamond','Crimson','Iridescent','Top 250'];
const TIMEZONES = [
  'Honolulu','Anchorage','Los Angeles','Vancouver','Denver','Phoenix',
  'Chicago','Mexico City','New York','Toronto','Caracas',
  'Bogotá','Lima','São Paulo','Buenos Aires','Santiago',
  'London','Lisbon','Paris','Berlin','Madrid','Rome','Amsterdam',
  'Stockholm','Warsaw','Helsinki','Athens','Cairo',
  'Istanbul','Riyadh','Dubai','Moscow','Johannesburg','Lagos',
  'Karachi','Mumbai','Kolkata','Dhaka','Bangkok','Jakarta',
  'Singapore','Kuala Lumpur','Ho Chi Minh City','Hong Kong',
  'Beijing','Shanghai','Taipei','Seoul','Tokyo',
  'Brisbane','Sydney','Melbourne','Auckland',
];
const SERVERS = [
  'NA East','NA West','NA Central',
  'South America',
  'EU West','EU Central','EU East',
  'Middle East','Africa',
  'Asia Pacific','Southeast Asia','Japan','Korea','South Asia',
  'Oceania',
];

export default function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin]                   = useState(true);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState('');
  const [showPassword, setShowPassword]         = useState(false);
  const [showConfirm, setShowConfirm]           = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    username: '', display_name: '',
    platform: 'PC', rank: '', timezone: '', server: '',
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
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.');

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

        if (data.user) {
          await supabase.from('profiles').update({
            platform: form.platform || null,
            rank:     form.rank     || null,
            timezone: form.timezone || null,
            loadout: {
              primary: '', secondary: '', equipment: '', perk1: '', perk2: '',
              server: form.server || '',
            },
          }).eq('id', data.user.id);
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

  const selectCls = inputCls + ' appearance-none cursor-pointer';

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

            {/* ── Sign-up only fields ── */}
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Username <span className="text-orange-500">*</span></label>
                    <input
                      type="text" required value={form.username} onChange={set('username')}
                      placeholder="your_callsign" className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Display Name</label>
                    <input
                      type="text" value={form.display_name} onChange={set('display_name')}
                      placeholder="Ghost" className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Platform</label>
                    <select value={form.platform} onChange={set('platform')} className={selectCls}>
                      {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Rank</label>
                    <select value={form.rank} onChange={set('rank')} className={selectCls}>
                      <option value="">Select rank…</option>
                      {RANKS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Timezone</label>
                    <select value={form.timezone} onChange={set('timezone')} className={selectCls}>
                      <option value="">Select timezone…</option>
                      {TIMEZONES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Server Region</label>
                    <select value={form.server} onChange={set('server')} className={selectCls}>
                      <option value="">Select server…</option>
                      {SERVERS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* ── Email ── */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email</label>
              <input
                type="email" required value={form.email} onChange={set('email')}
                placeholder="operator@email.com" className={inputCls}
              />
            </div>

            {/* ── Password ── */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required value={form.password} onChange={set('password')}
                  placeholder="••••••••" minLength={6}
                  className={inputCls + ' pr-10'}
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ── Confirm password (signup only) ── */}
            {!isLogin && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required value={form.confirmPassword} onChange={set('confirmPassword')}
                    placeholder="••••••••" minLength={6}
                    className={inputCls + ' pr-10'}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

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
              onClick={() => { setIsLogin(!isLogin); setError(''); setShowPassword(false); setShowConfirm(false); }}
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
