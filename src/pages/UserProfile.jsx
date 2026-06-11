import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserPlus, UserCheck, MessageSquare, ArrowLeft, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';

const LOADOUT_FIELDS = [
  { key: 'primary',   label: 'Primary Weapon' },
  { key: 'secondary', label: 'Secondary Weapon' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'perk1',     label: 'Perk 1' },
  { key: 'perk2',     label: 'Perk 2' },
  { key: 'perk3',     label: 'Perk 3' },
];

function getCodStatsUrl(platform, gamertag) {
  if (!gamertag) return null;
  const tag = encodeURIComponent(gamertag);
  if (platform === 'PlayStation 5' || platform === 'PlayStation') return `https://codstats.net/profile/ps5/${tag}`;
  if (platform === 'PlayStation 4') return `https://codstats.net/profile/ps4/${tag}`;
  if (platform === 'Xbox')          return `https://codstats.net/profile/xbl/${tag}`;
  return `https://codstats.net/profile/atvi/${tag}`;
}

function getPsnUrl(gamertag) {
  return `https://psnprofiles.com/${encodeURIComponent(gamertag)}`;
}

function getXboxUrl(gamertag) {
  return `https://www.xbox.com/en-US/play/user/${encodeURIComponent(gamertag)}`;
}

export default function UserProfile() {
  const { username } = useParams();
  const { user, onlineUsers } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]         = useState(null);
  const [clan, setClan]               = useState(null);
  const [friendStatus, setFriendStatus] = useState(null); // null | 'pending_sent' | 'pending_received' | 'accepted'
  const [friendshipId, setFriendshipId] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);

  useEffect(() => { if (username) load(); }, [username, user]);

  async function load() {
    setLoading(true);
    setNotFound(false);

    const { data: p } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (!p) { setNotFound(true); setLoading(false); return; }
    setProfile(p);

    if (p.clan_id) {
      const { data: c } = await supabase
        .from('clans').select('name, tag').eq('id', p.clan_id).single();
      setClan(c);
    } else {
      setClan(null);
    }

    if (user && p.id !== user.id) {
      const { data: f } = await supabase
        .from('friendships')
        .select('id, status, requester_id')
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${p.id}),` +
          `and(requester_id.eq.${p.id},addressee_id.eq.${user.id})`
        )
        .maybeSingle();

      if (f) {
        setFriendshipId(f.id);
        if (f.status === 'accepted') setFriendStatus('accepted');
        else if (f.status === 'pending')
          setFriendStatus(f.requester_id === user.id ? 'pending_sent' : 'pending_received');
      } else {
        setFriendStatus(null);
        setFriendshipId(null);
      }
    }

    setLoading(false);
  }

  async function sendRequest() {
    const { data } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: profile.id })
      .select().single();
    setFriendStatus('pending_sent');
    if (data) setFriendshipId(data.id);
  }

  async function cancelRequest() {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    setFriendStatus(null);
    setFriendshipId(null);
  }

  async function acceptRequest() {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    setFriendStatus('accepted');
  }

  async function removeFriend() {
    await supabase.from('friendships').delete().eq('id', friendshipId);
    setFriendStatus(null);
    setFriendshipId(null);
  }

  function openChat() {
    navigate('/chats', {
      state: { openUser: { id: profile.id, username: profile.username, display_name: profile.display_name } },
    });
  }

  if (loading) return <LoadingSpinner fullScreen />;

  if (notFound) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-semibold text-white mb-2">Player not found</p>
        <p className="text-zinc-500 text-sm">No operator with username @{username}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-orange-400 hover:text-orange-300 text-sm transition-colors">
          ← Go back
        </button>
      </div>
    </div>
  );

  const isOwn = user?.id === profile.id;

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={16} />Back
        </button>

        {/* Header card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar
                url={profile.avatar_url}
                name={profile.display_name || profile.username}
                size="xl"
                online={onlineUsers.has(profile.id)}
                showOffline
              />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white">{profile.display_name || profile.username}</h1>
                  <span className={`text-xs font-medium ${onlineUsers.has(profile.id) ? 'text-green-400' : 'text-zinc-500'}`}>
                    ● {onlineUsers.has(profile.id) ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-zinc-500 text-sm">@{profile.username}</p>
                {clan && (
                  <p className="text-orange-400 text-xs mt-0.5 font-mono">[{clan.tag}] {clan.name}</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {isOwn ? (
              <button
                onClick={() => navigate('/profile')}
                className="shrink-0 text-sm border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Edit Profile
              </button>
            ) : user && (
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                {friendStatus === 'accepted' && (
                  <button
                    onClick={openChat}
                    className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <MessageSquare size={14} />Message
                  </button>
                )}
                {friendStatus === 'accepted' && (
                  <button
                    onClick={removeFriend}
                    className="flex items-center gap-1.5 border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-400 text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <UserCheck size={14} />Friends
                  </button>
                )}
                {friendStatus === 'pending_sent' && (
                  <button
                    onClick={cancelRequest}
                    className="text-sm border border-zinc-700 text-zinc-400 px-3 py-1.5 rounded-lg"
                  >
                    Request Sent
                  </button>
                )}
                {friendStatus === 'pending_received' && (
                  <button
                    onClick={acceptRequest}
                    className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <UserPlus size={14} />Accept Request
                  </button>
                )}
                {!friendStatus && (
                  <button
                    onClick={sendRequest}
                    className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <UserPlus size={14} />Add Friend
                  </button>
                )}
              </div>
            )}
          </div>

          {profile.bio && (
            <p className="text-zinc-400 text-sm mt-4 leading-relaxed">{profile.bio}</p>
          )}
        </div>

        {/* Stats + Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Operator Info</h3>
            {[
              { label: 'Platform', value: profile.platform },
              { label: 'Rank',     value: profile.rank },
              { label: 'Timezone', value: profile.timezone },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-zinc-500 text-xs">{label}</p>
                <p className="text-white text-sm">{value || '—'}</p>
              </div>
            ))}
            {profile.gamertag && (
              <div>
                <p className="text-zinc-500 text-xs">
                  {profile.platform === 'Xbox' ? 'Xbox Gamertag' : (profile.platform?.startsWith('PlayStation')) ? 'PSN ID' : 'Activision ID'}
                </p>
                <p className="text-white text-sm font-mono">{profile.gamertag}</p>
              </div>
            )}
            {profile.loadout?.server && (
              <div>
                <p className="text-zinc-500 text-xs">Preferred Server</p>
                <p className="text-white text-sm">{profile.loadout.server}</p>
              </div>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Combat Stats</h3>
            <div>
              <p className="text-zinc-500 text-xs">K/D Ratio</p>
              <p className="text-orange-400 text-3xl font-bold">{profile.kd_ratio ?? '—'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Wins</p>
              <p className="text-orange-400 text-3xl font-bold">{profile.wins ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Gaming account links → stats */}
        {profile.gamertag && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Warzone Stats</h3>
            <div className="flex flex-wrap gap-2">
              {getCodStatsUrl(profile.platform, profile.gamertag) && (
                <a
                  href={getCodStatsUrl(profile.platform, profile.gamertag)}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <ExternalLink size={14} />
                  CODStats
                </a>
              )}
              {profile.platform?.startsWith('PlayStation') && (
                <a
                  href={getPsnUrl(profile.gamertag)}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  <ExternalLink size={14} />
                  PSN Profile
                </a>
              )}
              {profile.platform === 'Xbox' && (
                <a
                  href={getXboxUrl(profile.gamertag)}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  <ExternalLink size={14} />
                  Xbox Profile
                </a>
              )}
            </div>
          </div>
        )}

        {/* Loadout */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Loadout</h3>
          <div className="grid grid-cols-2 gap-3">
            {LOADOUT_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <p className="text-zinc-500 text-xs">{label}</p>
                <p className="text-white text-sm">{profile.loadout?.[key] || '—'}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
