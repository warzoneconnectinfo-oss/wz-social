import { useEffect, useRef, useState } from 'react';
import { Edit2, Save, X, Camera, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';

const RANKS     = ['Bronze','Silver','Gold','Platinum','Diamond','Crimson','Iridescent','Top 250'];
const PLATFORMS = ['PC','PlayStation 4','PlayStation 5','Xbox','Cross-Play'];
const TIMEZONES = [
  'UTC-8 (PST)','UTC-7 (MST)','UTC-6 (CST)','UTC-5 (EST)',
  'UTC+0 (GMT)','UTC+1 (CET)','UTC+3 (MSK)','UTC+5:30 (IST)',
  'UTC+8 (SGT)','UTC+9 (JST)','UTC+10 (AEST)',
];
const LOADOUT_FIELDS = [
  { key: 'primary',   label: 'Primary Weapon' },
  { key: 'secondary', label: 'Secondary Weapon' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'perk1',     label: 'Perk 1' },
  { key: 'perk2',     label: 'Perk 2' },
];

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600 transition-colors';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [form, setForm]             = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [localAvatarUrl, setLocalAvatarUrl]   = useState(null);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (profile) { resetForm(); setLocalAvatarUrl(null); }
  }, [profile]);

  function resetForm() {
    setForm({
      display_name: profile.display_name || '',
      bio:          profile.bio           || '',
      platform:     profile.platform      || 'PC',
      gamertag:     profile.gamertag      || '',
      rank:         profile.rank          || '',
      timezone:     profile.timezone      || '',
      kd_ratio:     profile.kd_ratio      ?? '',
      wins:         profile.wins          ?? 0,
      loadout: {
        primary:   profile.loadout?.primary   || '',
        secondary: profile.loadout?.secondary || '',
        equipment: profile.loadout?.equipment || '',
        perk1:     profile.loadout?.perk1     || '',
        perk2:     profile.loadout?.perk2     || '',
      },
    });
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setError('');
    try {
      const ext  = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const cacheBusted = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: cacheBusted }).eq('id', user.id);
      setLocalAvatarUrl(cacheBusted);
      await refreshProfile();
    } catch (err) {
      setError(err.message || 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setLoadout = (k) => (e) =>
    setForm((f) => ({ ...f, loadout: { ...f.loadout, [k]: e.target.value } }));

  async function handleSave() {
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('profiles').update({
      display_name: form.display_name || null,
      bio:          form.bio          || null,
      platform:     form.platform     || null,
      gamertag:     form.gamertag     || null,
      rank:         form.rank         || null,
      timezone:     form.timezone     || null,
      kd_ratio:     form.kd_ratio !== '' ? parseFloat(form.kd_ratio) : null,
      wins:         parseInt(form.wins) || 0,
      loadout:      form.loadout,
    }).eq('id', user.id);

    if (err) { setError(err.message); }
    else { await refreshProfile(); setEditing(false); }
    setSaving(false);
  }

  if (!profile) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 text-2xl font-bold mx-auto">?</div>
        <h2 className="text-white font-bold text-lg">Profile not set up</h2>
        <p className="text-zinc-400 text-sm">Your profile couldn't be loaded.</p>
        <button onClick={() => window.location.reload()} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
          Retry
        </button>
      </div>
    </div>
  );

  if (!form) return <LoadingSpinner fullScreen />;

  const p = editing ? form : profile;
  const displayAvatarUrl = localAvatarUrl || profile.avatar_url;

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">

              {/* Avatar with upload overlay */}
              <div className="relative group">
                <Avatar
                  url={displayAvatarUrl}
                  name={profile.display_name || profile.username}
                  size="xl"
                />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-wait"
                  title="Change photo"
                >
                  {avatarUploading
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera size={20} className="text-white" />
                  }
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>

              <div>
                {editing ? (
                  <input
                    value={form.display_name} onChange={set('display_name')}
                    placeholder="Display name"
                    className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-1.5 text-lg font-bold focus:outline-none focus:border-orange-500"
                  />
                ) : (
                  <h1 className="text-xl font-bold text-white">
                    {profile.display_name || profile.username}
                  </h1>
                )}
                <p className="text-zinc-500 text-sm">@{profile.username}</p>
                <p className="text-zinc-600 text-xs mt-0.5">Click photo to change</p>
              </div>
            </div>

            <div className="flex gap-2">
              {editing ? (
                <>
                  <button
                    onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Save size={14} />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { resetForm(); setEditing(false); setError(''); }}
                    className="p-1.5 text-zinc-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Edit2 size={14} />
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-2 mb-4">
              {error}
            </div>
          )}

          {/* Bio */}
          {editing ? (
            <textarea
              value={form.bio} onChange={set('bio')}
              placeholder="Tell operators about yourself…"
              rows={3} maxLength={300}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600 resize-none"
            />
          ) : (
            <p className="text-zinc-400 text-sm">{profile.bio || 'No bio yet.'}</p>
          )}
        </div>

        {/* Operator info + Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Operator Info</h3>

            {[
              { label: 'Platform', key: 'platform', opts: PLATFORMS },
              { label: 'Rank',     key: 'rank',     opts: RANKS },
              { label: 'Timezone', key: 'timezone', opts: TIMEZONES },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <p className="text-zinc-500 text-xs">{label}</p>
                {editing ? (
                  <select value={form[key]} onChange={set(key)} className={inputCls + ' mt-0.5'}>
                    <option value="">— Select —</option>
                    {opts.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <p className="text-white text-sm">{profile[key] || '—'}</p>
                )}
              </div>
            ))}

            <div>
              <p className="text-zinc-500 text-xs">
                {profile.platform === 'Xbox' ? 'Xbox Gamertag' : (profile.platform === 'PlayStation 4' || profile.platform === 'PlayStation 5' || profile.platform === 'PlayStation') ? 'PSN ID' : 'Activision ID'}
              </p>
              {editing ? (
                <input
                  value={form.gamertag} onChange={set('gamertag')}
                  placeholder={form.platform === 'Xbox' ? 'Your Xbox Gamertag' : (form.platform === 'PlayStation 4' || form.platform === 'PlayStation 5' || form.platform === 'PlayStation') ? 'Your PSN username' : 'Name#1234'}
                  className={inputCls + ' mt-0.5'}
                />
              ) : profile.gamertag ? (
                <p className="text-white text-sm font-mono">{profile.gamertag}</p>
              ) : (
                <p className="text-zinc-600 text-sm italic">Not set — click Edit Profile</p>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Combat Stats</h3>

            <div>
              <p className="text-zinc-500 text-xs">K/D Ratio</p>
              {editing ? (
                <input type="number" step="0.01" min="0" value={form.kd_ratio} onChange={set('kd_ratio')} className={inputCls + ' mt-0.5'} />
              ) : (
                <p className="text-orange-400 text-3xl font-bold">{profile.kd_ratio ?? '—'}</p>
              )}
            </div>

            <div>
              <p className="text-zinc-500 text-xs">Wins</p>
              {editing ? (
                <input type="number" min="0" value={form.wins} onChange={set('wins')} className={inputCls + ' mt-0.5'} />
              ) : (
                <p className="text-orange-400 text-3xl font-bold">{profile.wins ?? 0}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats links */}
        {!editing && profile.gamertag && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">Warzone Stats</h3>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const tag = encodeURIComponent(profile.gamertag);
                const plat = profile.platform;
                const isPsn = plat === 'PlayStation 4' || plat === 'PlayStation 5' || plat === 'PlayStation';
                const codSlug = plat === 'PlayStation 5' ? 'ps5' : plat === 'PlayStation 4' ? 'ps4' : isPsn ? 'ps5' : plat === 'Xbox' ? 'xbl' : 'atvi';
                return (
                  <>
                    <a href={`https://codstats.net/profile/${codSlug}/${tag}`}
                       target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                      <ExternalLink size={14} />CODStats
                    </a>
                    {isPsn && (
                      <a href={`https://psnprofiles.com/${tag}`} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors">
                        <ExternalLink size={14} />PSN Profile
                      </a>
                    )}
                    {plat === 'Xbox' && (
                      <a href={`https://www.xbox.com/en-US/play/user/${tag}`} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors">
                        <ExternalLink size={14} />Xbox Profile
                      </a>
                    )}
                  </>
                );
              })()}
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
                {editing ? (
                  <input
                    value={form.loadout[key]} onChange={setLoadout(key)}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    className={inputCls + ' mt-0.5'}
                  />
                ) : (
                  <p className="text-white text-sm">{profile.loadout?.[key] || '—'}</p>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
