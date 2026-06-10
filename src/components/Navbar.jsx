import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, Home, Newspaper, MessageSquare, Radio, Users, UserPlus, LogOut, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

const NAV = [
  { to: '/',        label: 'Home',    Icon: Home },
  { to: '/feed',    label: 'Feed',    Icon: Newspaper },
  { to: '/chats',   label: 'Chats',   Icon: MessageSquare },
  { to: '/rooms',   label: 'Rooms',   Icon: Radio },
  { to: '/clans',   label: 'Clans',   Icon: Users },
  { to: '/friends', label: 'Friends', Icon: UserPlus },
];

function Badge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-orange-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-0.5 leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Navbar() {
  const { user, profile } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();

  const [notifs, setNotifs]           = useState([]);
  const [showNotifs, setShowNotifs]   = useState(false);
  const [pendingReqs, setPendingReqs] = useState(0);
  const [unreadDMs, setUnreadDMs]     = useState(0);
  const bellRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    loadNotifs();
    loadPendingReqs();
    loadUnreadDMs();

    // Realtime: new notification inserted for this user
    const notifCh = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { loadNotifs(); loadPendingReqs(); })
      .subscribe();

    // Realtime: messages inserted/updated for this user
    const msgCh = supabase
      .channel(`navbar-msgs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${user.id}`,
      }, () => loadUnreadDMs())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${user.id}`,
      }, () => loadUnreadDMs())
      .subscribe();

    return () => {
      notifCh.unsubscribe();
      msgCh.unsubscribe();
    };
  }, [user]);

  // Reset DM badge when user navigates to /chats
  useEffect(() => {
    if (location.pathname === '/chats') setUnreadDMs(0);
  }, [location.pathname]);

  useEffect(() => {
    function handleClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setShowNotifs(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadNotifs() {
    const { data } = await supabase
      .from('notifications')
      .select('*, from:profiles!from_id(username, display_name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifs(data || []);
  }

  async function loadPendingReqs() {
    const { count } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('addressee_id', user.id)
      .eq('status', 'pending');
    setPendingReqs(count || 0);
  }

  async function loadUnreadDMs() {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .is('room_id', null)
      .eq('is_read', false);
    setUnreadDMs(count || 0);
  }

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  function handleBellClick() {
    setShowNotifs((v) => {
      if (!v) markAllRead();
      return !v;
    });
  }

  function handleNotifClick(notif) {
    setShowNotifs(false);
    if (notif.type === 'friend_request' || notif.type === 'friend_accepted') navigate('/friends');
    else if (notif.type === 'message') navigate('/chats');
    else if (notif.type === 'post_like' || notif.type === 'system') {
      if (notif.reference_id) navigate(`/feed?post=${notif.reference_id}`);
      else navigate('/feed');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/auth');
  }

  if (!user) return null;

  const unreadNotifs = notifs.filter((n) => !n.is_read).length;

  return (
    <nav className="sticky top-0 z-50 bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <Shield size={24} className="text-orange-500" />
          <span className="font-bold text-white hidden sm:block">WZ Social</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-0.5">
          {NAV.map(({ to, label, Icon }) => {
            const active = location.pathname === to;
            let badge = null;
            if (to === '/friends' && pendingReqs > 0) badge = pendingReqs > 99 ? '99+' : pendingReqs;
            if (to === '/chats'   && unreadDMs > 0)   badge = unreadDMs > 99 ? '99+' : unreadDMs;
            return (
              <Link
                key={to} to={to}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-orange-500/15 text-orange-400'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Icon size={16} />
                <span className="hidden md:block">{label}</span>
                {badge && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-orange-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-0.5 leading-none">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side: bell + avatar + sign out */}
        <div className="flex items-center gap-1">

          {/* Notification bell with number badge */}
          <div ref={bellRef} className="relative">
            <button
              onClick={handleBellClick}
              className="relative p-2 text-zinc-400 hover:text-white transition-colors"
              title="Notifications"
            >
              <Bell size={17} />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-orange-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-0.5 leading-none">
                  {unreadNotifs > 99 ? '99+' : unreadNotifs}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-white font-semibold text-sm">
                    Notifications {unreadNotifs > 0 && <span className="text-orange-400">({unreadNotifs})</span>}
                  </span>
                  {notifs.some(n => !n.is_read) && (
                    <button onClick={markAllRead} className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="text-zinc-600 text-sm text-center py-8">No notifications</p>
                  ) : (
                    notifs.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`w-full text-left px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800 transition-colors ${
                          !n.is_read ? 'bg-orange-500/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                          )}
                          <div className={!n.is_read ? '' : 'ml-3.5'}>
                            <p className="text-white text-xs font-medium">
                              {n.from?.display_name || n.from?.username || 'System'}
                            </p>
                            <p className="text-zinc-400 text-xs">{n.message}</p>
                            <p className="text-zinc-600 text-xs mt-0.5">
                              {new Date(n.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Avatar / profile link */}
          <Link
            to="/profile"
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Avatar url={profile?.avatar_url} name={profile?.display_name || profile?.username || 'U'} size="sm" />
            <span className="text-sm hidden sm:block">{profile?.display_name || profile?.username}</span>
          </Link>

          {/* Sign out */}
          <button
            onClick={signOut}
            title="Sign out"
            className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>

      </div>
    </nav>
  );
}
