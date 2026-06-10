import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Newspaper, MessageSquare, Radio, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';

const QUICK_LINKS = [
  { to: '/feed',  Icon: Newspaper,     label: 'Community Feed', desc: 'See what operators are posting' },
  { to: '/chats', Icon: MessageSquare, label: 'Direct Messages', desc: 'Chat with your squad' },
  { to: '/rooms', Icon: Radio,         label: 'Chat Rooms',      desc: 'Join a public channel' },
  { to: '/clans', Icon: Users,         label: 'Clans',           desc: 'Find or manage your team' },
];

export default function Home() {
  const { user, profile } = useAuth();
  const [recentPosts, setRecentPosts] = useState([]);
  const [stats, setStats] = useState({ friends: 0, clanCount: 0 });
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchPosts(), fetchStats()]).finally(() => setFetching(false));
  }, [user]);

  async function fetchPosts() {
    try {
      const { data } = await supabase
        .from('posts')
        .select('id, content, created_at, profiles(display_name, username)')
        .eq('is_removed', false)
        .order('created_at', { ascending: false })
        .limit(3);
      setRecentPosts(data || []);
    } catch { /* no-op if Supabase not configured yet */ }
  }

  async function fetchStats() {
    try {
      const [r1, r2] = await Promise.all([
        supabase
          .from('friendships')
          .select('*', { count: 'exact', head: true })
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
          .eq('status', 'accepted'),
        supabase
          .from('clan_members')
          .select('*', { count: 'exact', head: true })
          .eq('profile_id', user.id),
      ]);
      setStats({ friends: r1.count || 0, clanCount: r2.count || 0 });
    } catch { /* no-op */ }
  }

  if (fetching) return <LoadingSpinner fullScreen />;

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-orange-950/60 to-zinc-900 border border-orange-900/40 rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <Link to="/profile">
              <Avatar
                url={profile?.avatar_url}
                name={profile?.display_name || profile?.username || 'U'}
                size="xl"
                online
              />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">
                Welcome back, {profile?.display_name || profile?.username || 'Operator'}
              </h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                {profile?.rank || 'Unranked'} · {profile?.platform || 'Unknown Platform'}
                {profile?.timezone ? ` · ${profile.timezone}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Friends',  value: stats.friends },
            { label: 'K/D',      value: profile?.kd_ratio ?? '—' },
            { label: 'Wins',     value: profile?.wins ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">{value}</div>
              <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div>
          <h2 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Navigate</h2>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_LINKS.map(({ to, Icon, label, desc }) => (
              <Link
                key={to} to={to}
                className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-all group"
              >
                <Icon size={22} className="text-orange-500 mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-white text-sm font-medium">{label}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{desc}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent posts */}
        {recentPosts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Recent Activity</h2>
              <Link to="/feed" className="text-orange-400 hover:text-orange-300 text-xs transition-colors">
                View all →
              </Link>
            </div>
            <div className="space-y-2">
              {recentPosts.map((post) => (
                <div key={post.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-zinc-300 text-sm font-medium">
                      {post.profiles?.display_name || post.profiles?.username}
                    </span>
                    <span className="text-zinc-600 text-xs">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm line-clamp-2">{post.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
