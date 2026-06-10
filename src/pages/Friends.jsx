import { useEffect, useState } from 'react';
import { UserPlus, Check, X, MessageSquare, Search, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Friends() {
  const { user, onlineUsers } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]               = useState('friends');
  const [friends, setFriends]       = useState([]);
  const [requests, setRequests]     = useState([]);
  const [search, setSearch]         = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]     = useState('');
  const [pageError, setPageError]   = useState('');
  const [loading, setLoading]       = useState(true);
  const [sentIds, setSentIds]       = useState(new Set());
  const [friendIds, setFriendIds]   = useState(new Set());
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (user) loadAll().finally(() => setLoading(false));
  }, [user]);

  async function loadAll() {
    setPageError('');
    const [r1, r2, r3] = await Promise.all([
      loadFriends(), loadRequests(), loadSentRequests(),
    ]);
    const errs = [r1, r2, r3].filter(Boolean);
    if (errs.length) setPageError(errs[0]);
  }

  async function loadFriends() {
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id, requester_id, addressee_id,
        requester:profiles!requester_id(id, username, display_name, rank, platform, avatar_url),
        addressee:profiles!addressee_id(id, username, display_name, rank, platform, avatar_url)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (error) return error.message;
    const list = (data || []).map((f) => {
      const other = f.requester_id === user.id ? f.addressee : f.requester;
      return { friendshipId: f.id, ...other };
    });
    setFriends(list);
    setFriendIds(new Set(list.map((f) => f.id)));
  }

  async function loadRequests() {
    const { data, error } = await supabase
      .from('friendships')
      .select('id, requester:profiles!requester_id(id, username, display_name, rank, platform, avatar_url)')
      .eq('addressee_id', user.id)
      .eq('status', 'pending');

    if (error) return error.message;
    setRequests(data || []);
  }

  async function loadSentRequests() {
    const { data, error } = await supabase
      .from('friendships')
      .select('addressee_id')
      .eq('requester_id', user.id)
      .eq('status', 'pending');

    if (error) return error.message;
    setSentIds(new Set((data || []).map((r) => r.addressee_id)));
  }

  async function sendRequest(targetId) {
    setActionError('');
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: targetId });

    if (error) {
      if (error.code === '23505') {
        setActionError('You already sent a request to this player.');
      } else {
        setActionError(error.message);
      }
      return;
    }

    setSentIds((prev) => new Set([...prev, targetId]));
  }

  async function acceptRequest(friendshipId, fromId) {
    setActionError('');
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    if (error) { setActionError(error.message); return; }

    loadAll();
  }

  async function declineRequest(friendshipId) {
    setActionError('');
    const { error } = await supabase
      .from('friendships').delete().eq('id', friendshipId);
    if (error) { setActionError(error.message); return; }
    loadRequests();
  }

  async function removeFriend(friendshipId, friendId) {
    setActionError('');
    const { error } = await supabase
      .from('friendships').delete().eq('id', friendshipId);
    if (error) { setActionError(error.message); return; }
    setFriends((prev) => prev.filter((f) => f.friendshipId !== friendshipId));
    setFriendIds((prev) => { const s = new Set(prev); s.delete(friendId); return s; });
  }

  // Search both username AND display_name, deduplicated by id
  async function handleSearch(e) {
    const raw = e.target.value;
    setSearch(raw);
    setSearchError('');
    const q = raw.trim();
    if (!q) { setSearchResults([]); return; }

    setSearchLoading(true);
    try {
      // Run both searches in parallel — one by username, one by display_name
      const [byUsername, byDisplay] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, rank, platform, avatar_url')
          .neq('id', user.id)
          .ilike('username', `%${q}%`)
          .limit(10),
        supabase
          .from('profiles')
          .select('id, username, display_name, rank, platform, avatar_url')
          .neq('id', user.id)
          .ilike('display_name', `%${q}%`)
          .limit(10),
      ]);

      if (byUsername.error && byDisplay.error) {
        setSearchError(byUsername.error.message);
        setSearchResults([]);
        return;
      }

      // Merge, deduplicate by id
      const seen = new Set();
      const merged = [];
      for (const row of [...(byUsername.data || []), ...(byDisplay.data || [])]) {
        if (!seen.has(row.id)) { seen.add(row.id); merged.push(row); }
      }
      setSearchResults(merged);
    } finally {
      setSearchLoading(false);
    }
  }

  if (loading) return <LoadingSpinner fullScreen />;

  function PlayerRow({ p, children }) {
    const isOnline = onlineUsers.has(p?.id);
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
        <Avatar
          url={p?.avatar_url}
          name={p?.display_name || p?.username || '?'}
          size="md"
          online={isOnline}
          showOffline
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-medium text-sm">{p?.display_name || p?.username}</p>
            <span className={`text-xs font-medium ${isOnline ? 'text-green-400' : 'text-zinc-600'}`}>
              ● {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-zinc-500 text-xs">@{p?.username} · {p?.rank || 'Unranked'} · {p?.platform || 'PC'}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-lg font-bold text-white">Friends</h1>

        {/* Schema / page error */}
        {pageError && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-3">
            <p className="font-medium mb-0.5">Database error</p>
            <p className="text-xs">{pageError}</p>
            <p className="text-xs mt-1 text-red-400">Make sure you've run the schema in Supabase SQL Editor.</p>
          </div>
        )}

        {/* Action error (add/accept/decline) */}
        {actionError && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-3 flex justify-between items-center">
            {actionError}
            <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-200 ml-4">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {[
            ['friends', `My Friends (${friends.length})`],
            ['requests', `Requests${requests.length > 0 ? ` (${requests.length})` : ''}`],
            ['find', 'Find Players'],
          ].map(([key, label]) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`flex-1 text-sm py-1.5 rounded-lg transition-colors ${
                tab === key ? 'bg-orange-500 text-white font-medium' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Friends list */}
        {tab === 'friends' && (
          <div className="space-y-2">
            {friends.length === 0 ? (
              <div className="text-center text-zinc-600 py-16 text-sm">
                No friends yet — use Find Players to connect with operators.
              </div>
            ) : (
              friends.map((f) => (
                <PlayerRow key={f.id} p={f}>
                  <button
                    onClick={() => navigate(`/profile/${f.username}`)}
                    className="text-xs px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-lg transition-colors"
                  >Profile</button>
                  <button
                    onClick={() => navigate('/chats', { state: { openUser: { id: f.id, username: f.username, display_name: f.display_name } } })}
                    className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <MessageSquare size={12} />Message
                  </button>
                  <button
                    onClick={() => removeFriend(f.friendshipId, f.id)}
                    className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
                    title="Remove friend"
                  >
                    <X size={14} />
                  </button>
                </PlayerRow>
              ))
            )}
          </div>
        )}

        {/* Friend requests */}
        {tab === 'requests' && (
          <div className="space-y-2">
            {requests.length === 0 ? (
              <div className="text-center text-zinc-600 py-16 text-sm">No pending friend requests.</div>
            ) : (
              requests.map((r) => (
                <PlayerRow key={r.id} p={r.requester}>
                  <button
                    onClick={() => acceptRequest(r.id, r.requester.id)}
                    className="flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Check size={12} />Accept
                  </button>
                  <button
                    onClick={() => declineRequest(r.id)}
                    className="text-xs border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded-lg transition-colors"
                  >Decline</button>
                </PlayerRow>
              ))
            )}
          </div>
        )}

        {/* Find players */}
        {tab === 'find' && (
          <div className="space-y-3">
            <div className="relative">
              {searchLoading
                ? <Loader2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400 animate-spin pointer-events-none" />
                : <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              }
              <input
                value={search} onChange={handleSearch}
                placeholder="Search by username or display name…"
                className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
              />
            </div>

            {searchError && (
              <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-lg px-3 py-2">
                {searchError} — make sure the database schema is applied.
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((u) => (
                  <PlayerRow key={u.id} p={u}>
                    {friendIds.has(u.id) ? (
                      <span className="text-xs text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg">Friends</span>
                    ) : sentIds.has(u.id) ? (
                      <span className="text-xs text-zinc-500 bg-zinc-800 px-3 py-1.5 rounded-lg">Sent</span>
                    ) : (
                      <button
                        onClick={() => sendRequest(u.id)}
                        className="flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <UserPlus size={12} />Add
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/profile/${u.username}`)}
                      className="text-xs px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-lg transition-colors"
                    >View</button>
                  </PlayerRow>
                ))}
              </div>
            )}

            {!searchLoading && search && searchResults.length === 0 && !searchError && (
              <p className="text-zinc-600 text-sm text-center py-8">No players found for "{search}"</p>
            )}
            {!search && (
              <p className="text-zinc-600 text-sm text-center py-8">Type a username or display name to search</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
