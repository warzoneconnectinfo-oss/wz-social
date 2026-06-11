import { useEffect, useRef, useState } from 'react';
import { Upload as TusUpload } from 'tus-js-client';
import {
  Users, Plus, Send, Crown, UserX, Clock, UserPlus,
  Globe, Lock, Image, Video, X, Check, CheckCheck, Trash2, MessageSquare,
  Reply, Forward, Download, Search, Bell, BellOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';

const inputCls =
  'w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600 transition-colors';

function fmt(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function downloadMedia(url, type) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${type}_${Date.now()}.${type === 'image' ? 'jpg' : 'mp4'}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
}

function fmtTimeout(expiresAt) {
  const secs = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Clans() {
  const { user, profile, refreshProfile, onlineUsers } = useAuth();

  const [clans, setClans]                   = useState([]);
  const [hiddenClans, setHiddenClans]       = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`hiddenClans_${user?.id}`) || '[]')); }
    catch { return new Set(); }
  });
  const [selected, setSelected]             = useState(null);
  const [members, setMembers]               = useState([]);
  const [messages, setMessages]             = useState([]);
  const [timeouts, setTimeouts]             = useState([]);
  const [activeTab, setActiveTab]           = useState('chat');
  const [pendingInvites, setPendingInvites] = useState([]);

  const [clanSearch, setClanSearch] = useState('');

  // create form
  const [showForm, setShowForm]   = useState(false);
  const [creating, setCreating]   = useState(false);
  const [newClan, setNewClan]     = useState({ name: '', tag: '', description: '', is_recruiting: true });

  // chat
  const [msgText, setMsgText]           = useState('');
  const [sending, setSending]           = useState(false);
  const [uploadingMedia, setUploadMedia] = useState(false);

  // reply / forward / bulk-select (clan chat)
  const [clanReplyTo,      setClanReplyTo]      = useState(null);
  const [clanForwardMsg,   setClanForwardMsg]   = useState(null);
  const [bulkClanFwdMsgs,  setBulkClanFwdMsgs]  = useState([]);
  const [showClanFwd,      setShowClanFwd]      = useState(false);
  const [clanSelectMode,   setClanSelectMode]   = useState(false);
  const [clanSelected,     setClanSelected]     = useState(new Set());
  const [mutedClans,       setMutedClans]       = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`mutedClans_${user?.id}`) || '[]')); }
    catch { return new Set(); }
  });
  const mutedClansRef = useRef(new Set());
  const [unreadClans,    setUnreadClans]    = useState(new Set());
  const [showClanSearch, setShowClanSearch] = useState(false);
  const [clanMsgSearch,  setClanMsgSearch]  = useState('');

  // invite
  const [inviteSearch, setInviteSearch]   = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviting, setInviting]           = useState(false);

  // join requests (owner sees these; user tracks their own)
  const [joinRequests,   setJoinRequests]   = useState([]);
  const [myRequest,      setMyRequest]      = useState(null);
  const [requestingJoin, setRequestingJoin] = useState(false);
  const [togglingLock,   setTogglingLock]   = useState(false);

  // transfer / leave modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget]       = useState(null);

  // timeout countdown
  const [, forceRender] = useState(0);

  const [clanReadStatus, setClanReadStatus] = useState({}); // { userId: ISOString }

  // @mention autocomplete for clan chat
  const [clanMentionQuery,   setClanMentionQuery]   = useState(null);
  const [clanMentionStart,   setClanMentionStart]   = useState(-1);
  const [clanMentionResults, setClanMentionResults] = useState([]);
  const clanInputRef      = useRef(null);
  const clanMentionTimer  = useRef(null);

  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);

  const msgEndRef    = useRef(null);
  const imgInputRef  = useRef(null);
  const vidInputRef  = useRef(null);
  const chatSubRef   = useRef(null);

  const userClanId  = profile?.clan_id || null;
  const myMember    = members.find(m => m.profile_id === user?.id);
  const isOwner     = myMember?.role === 'owner';
  const isMember    = !!myMember;
  const myTimeout   = timeouts.find(t => t.user_id === user?.id && new Date(t.expires_at) > new Date());
  const isTimedOut  = !!myTimeout;

  // tick timeout countdown every second
  useEffect(() => {
    if (!isTimedOut) return;
    const t = setInterval(() => forceRender(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [isTimedOut]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => { mutedClansRef.current = mutedClans; }, [mutedClans]);

  function toggleMuteClan(clanId) {
    setMutedClans(prev => {
      const next = new Set(prev);
      next.has(clanId) ? next.delete(clanId) : next.add(clanId);
      localStorage.setItem(`mutedClans_${user.id}`, JSON.stringify([...next]));
      return next;
    });
  }

  useEffect(() => {
    if (user) Promise.all([loadClans(), loadMyInvites()]).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!selected) return;
    setUnreadClans(prev => { const n = new Set(prev); n.delete(selected.id); return n; });
    setJoinRequests([]);
    setMyRequest(null);
    loadMembers(selected.id);
    loadMessages(selected.id);
    loadTimeouts(selected.id);
    loadClanReadStatus(selected.id);
    upsertClanReadStatus(selected.id);
    loadMyRequest(selected.id);
    subscribeChat(selected.id, selected.name);
    return () => chatSubRef.current?.unsubscribe();
  }, [selected?.id]);

  // load join requests once we know the user is owner (members loaded asynchronously)
  useEffect(() => {
    if (isOwner && selected?.id) loadJoinRequests(selected.id);
  }, [isOwner, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadClanReadStatus(clanId) {
    const { data } = await supabase
      .from('clan_last_read')
      .select('user_id, last_seen_at')
      .eq('clan_id', clanId);
    if (!data) return;
    const map = {};
    data.forEach(r => { map[r.user_id] = r.last_seen_at; });
    setClanReadStatus(map);
  }

  async function upsertClanReadStatus(clanId) {
    const now = new Date().toISOString();
    await supabase.from('clan_last_read').upsert(
      { clan_id: clanId, user_id: user.id, last_seen_at: now },
      { onConflict: 'clan_id,user_id' }
    );
    setClanReadStatus(prev => ({ ...prev, [user.id]: now }));
  }

  async function loadClans() {
    const { data } = await supabase
      .from('clans')
      .select('*, owner:profiles!owner_id(username, display_name)')
      .order('created_at', { ascending: false });
    setClans(data || []);
  }

  async function loadMyInvites() {
    const { data } = await supabase
      .from('clan_invites')
      .select('*, clan:clans(id, name, tag, owner_id), inviter:profiles!inviter_id(username, display_name)')
      .eq('invitee_id', user.id)
      .eq('status', 'pending');
    // Only show real owner-sent invites; exclude join requests others sent to this user as owner
    setPendingInvites((data || []).filter(inv => inv.inviter_id === inv.clan?.owner_id));
  }

  async function loadMembers(clanId) {
    const { data } = await supabase
      .from('clan_members')
      .select('*, profiles(id, username, display_name, avatar_url, rank, platform)')
      .eq('clan_id', clanId)
      .order('joined_at', { ascending: true });
    setMembers(data || []);
  }

  async function loadMessages(clanId) {
    const { data } = await supabase
      .from('clan_messages')
      .select('*, sender:profiles!sender_id(username, display_name)')
      .eq('clan_id', clanId)
      .order('created_at', { ascending: true })
      .limit(150);
    const msgs = data || [];
    const replyIds = [...new Set(msgs.filter(m => m.reply_to_id).map(m => m.reply_to_id))];
    if (replyIds.length > 0) {
      const { data: rms } = await supabase
        .from('clan_messages')
        .select('id, content, attachment_type, sender_id, sender:profiles!sender_id(username, display_name)')
        .in('id', replyIds);
      const map = Object.fromEntries((rms || []).map(m => [m.id, m]));
      setMessages(msgs.map(m => m.reply_to_id ? { ...m, reply_msg: map[m.reply_to_id] } : m));
    } else {
      setMessages(msgs);
    }
  }

  async function loadTimeouts(clanId) {
    const { data } = await supabase
      .from('clan_timeouts')
      .select('*')
      .eq('clan_id', clanId)
      .gt('expires_at', new Date().toISOString());
    setTimeouts(data || []);
  }

  function subscribeChat(clanId, clanName) {
    chatSubRef.current?.unsubscribe();
    chatSubRef.current = supabase
      .channel(`clan-chat-${clanId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clan_messages', filter: `clan_id=eq.${clanId}` },
        async ({ new: msg }) => {
          const { data: sender } = await supabase.from('profiles').select('username, display_name').eq('id', msg.sender_id).single();
          setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, { ...msg, sender }]);
          if (msg.sender_id !== user?.id) {
            setUnreadClans(prev => { const n = new Set(prev); n.add(clanId); return n; });
            if (document.hidden && !mutedClansRef.current.has(clanId) && Notification.permission === 'granted') {
              const sName = sender?.display_name || sender?.username || 'Member';
              new Notification(clanName || 'Clan Chat', {
                body: `${sName}: ${msg.content || '📎 Attachment'}`,
                icon: '/favicon.ico',
              });
            }
          }
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clan_messages', filter: `clan_id=eq.${clanId}` },
        ({ old: msg }) => setMessages(prev => prev.filter(m => m.id !== msg.id)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clan_timeouts', filter: `clan_id=eq.${clanId}` },
        ({ new: t }) => setTimeouts(prev => [...prev.filter(x => x.user_id !== t.user_id), t]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clan_timeouts', filter: `clan_id=eq.${clanId}` },
        ({ old: t }) => setTimeouts(prev => prev.filter(x => x.id !== t.id)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_members', filter: `clan_id=eq.${clanId}` },
        () => loadMembers(clanId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clan_last_read', filter: `clan_id=eq.${clanId}` },
        ({ new: row }) => {
          if (row) setClanReadStatus(prev => ({ ...prev, [row.user_id]: row.last_seen_at }));
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clan_invites', filter: `clan_id=eq.${clanId}` },
        async ({ new: req }) => {
          // New join request directed at this owner
          if (req.invitee_id !== user?.id || req.inviter_id === user?.id) return;
          const { data: p } = await supabase.from('profiles').select('id, username, display_name').eq('id', req.inviter_id).single();
          setJoinRequests(prev => prev.find(r => r.id === req.id) ? prev : [...prev, { ...req, requester: p }]);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clan_invites', filter: `clan_id=eq.${clanId}` },
        ({ new: req }) => {
          if (req.status !== 'pending') {
            setJoinRequests(prev => prev.filter(r => r.id !== req.id));
            // Clear the requester's own pending request display when accepted/declined
            if (req.inviter_id === user?.id) setMyRequest(null);
          }
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clan_invites' },
        ({ old: req }) => {
          if (req.id) setJoinRequests(prev => prev.filter(r => r.id !== req.id));
        })
      .subscribe();
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    const { data: clan, error: err } = await supabase.from('clans').insert({
      name: newClan.name.trim(),
      tag: newClan.tag.trim().toUpperCase(),
      description: newClan.description.trim() || null,
      owner_id: user.id,
      is_recruiting: newClan.is_recruiting,
    }).select().single();
    if (err) {
      if (err.code === '23505') {
        setError(err.message.includes('clans_tag_key')
          ? 'That clan tag is already taken. Choose a different tag.'
          : 'A clan with that name already exists. Choose a different name.');
      } else {
        setError(err.message);
      }
      setCreating(false);
      return;
    }
    await supabase.from('clan_members').insert({ clan_id: clan.id, profile_id: user.id, role: 'owner' });
    await supabase.from('profiles').update({ clan_id: clan.id }).eq('id', user.id);
    await refreshProfile();
    setNewClan({ name: '', tag: '', description: '', is_recruiting: true });
    setShowForm(false);
    await loadClans();
    setSelected(clan);
    setCreating(false);
  }

  async function joinClan(clanId) {
    if (userClanId) { setError('Leave your current clan first.'); return; }
    setError('');
    const { error: err } = await supabase.from('clan_members').insert({ clan_id: clanId, profile_id: user.id, role: 'member' });
    if (err) { setError(err.message); return; }
    await supabase.from('profiles').update({ clan_id: clanId }).eq('id', user.id);
    await refreshProfile();
    await loadClans();
    loadMembers(clanId);
  }

  // ── Join-request helpers ──────────────────────────────────────────────────

  async function loadJoinRequests(clanId) {
    const { data } = await supabase
      .from('clan_invites')
      .select('*, requester:profiles!inviter_id(id, username, display_name)')
      .eq('clan_id', clanId)
      .eq('invitee_id', user.id)   // directed at the current owner
      .neq('inviter_id', user.id)  // not from the owner themselves
      .eq('status', 'pending');
    setJoinRequests(data || []);
  }

  async function loadMyRequest(clanId) {
    if (userClanId) { setMyRequest(null); return; }
    const { data } = await supabase
      .from('clan_invites')
      .select('id, status')
      .eq('clan_id', clanId)
      .eq('inviter_id', user.id)
      .in('status', ['pending'])
      .maybeSingle();
    setMyRequest(data || null);
  }

  async function requestJoin(clanId) {
    if (userClanId) { setError('Leave your current clan first.'); return; }
    setRequestingJoin(true);
    setError('');
    const clan = clans.find(c => c.id === clanId) || selected;
    if (!clan?.owner_id) { setRequestingJoin(false); return; }
    const { error: err } = await supabase.from('clan_invites').insert({
      clan_id: clanId,
      inviter_id: user.id,      // the person requesting
      invitee_id: clan.owner_id, // the leader who approves
    });
    if (err) { setError(err.message); }
    else {
      setMyRequest({ status: 'pending' });
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: clan.owner_id,
        type: 'clan_invite',
        from_id: user.id,
        reference_id: clanId,
        message: `${profile?.display_name || profile?.username || 'Someone'} wants to join ${clan.name}`,
      });
      if (notifErr) console.error('join-request notif failed:', notifErr.message);
    }
    setRequestingJoin(false);
  }

  async function cancelRequest(clanId) {
    if (!myRequest) return;
    setRequestingJoin(true);
    setError('');
    const clan = clans.find(c => c.id === clanId) || selected;
    const { error: err } = await supabase.from('clan_invites').delete()
      .eq('inviter_id', user.id).eq('clan_id', clanId).eq('status', 'pending');
    if (err) { setError(err.message); setRequestingJoin(false); return; }
    if (clan?.owner_id) {
      await supabase.from('notifications').insert({
        user_id: clan.owner_id,
        type: 'clan_invite',
        from_id: user.id,
        reference_id: clanId,
        message: `${profile?.display_name || profile?.username || 'Someone'} cancelled their join request for ${clan.name}`,
      });
    }
    setMyRequest(null);
    setRequestingJoin(false);
  }

  async function approveRequest(requestId, requesterId) {
    if (!selected) return;
    await supabase.from('clan_invites').update({ status: 'accepted' }).eq('id', requestId);
    const { error: err } = await supabase.from('clan_members').insert({
      clan_id: selected.id, profile_id: requesterId, role: 'member',
    });
    if (err) { setError(err.message); return; }
    await supabase.from('profiles').update({ clan_id: selected.id }).eq('id', requesterId);
    await supabase.from('notifications').insert({
      user_id: requesterId, type: 'clan_invite', from_id: user.id,
      reference_id: selected.id,
      message: `Your request to join [${selected.tag}] ${selected.name} was approved!`,
    }).catch(() => {});
    setJoinRequests(prev => prev.filter(r => r.id !== requestId));
    loadMembers(selected.id);
  }

  async function declineRequest(requestId) {
    await supabase.from('clan_invites').update({ status: 'declined' }).eq('id', requestId);
    setJoinRequests(prev => prev.filter(r => r.id !== requestId));
  }

  async function toggleClanLock() {
    if (!selected || !isOwner || togglingLock) return;
    setTogglingLock(true);
    setError('');
    const newRecruiting = !selected.is_recruiting;
    const { data: ok, error: err } = await supabase.rpc('set_clan_lock', {
      p_clan_id: selected.id,
      p_is_recruiting: newRecruiting,
    });
    if (err) { setError('Could not update clan: ' + err.message); setTogglingLock(false); return; }
    if (!ok) { setError('Could not update clan — permission denied.'); setTogglingLock(false); return; }
    const updated = { ...selected, is_recruiting: newRecruiting };
    setSelected(updated);
    setClans(prev => prev.map(c => c.id === selected.id ? { ...c, is_recruiting: newRecruiting } : c));
    setTogglingLock(false);
  }

  async function leaveClan() {
    if (!selected) return;
    setError('');
    if (isOwner) {
      const others = members.filter(m => m.profile_id !== user.id);
      if (others.length === 0) {
        // sole member — delete the clan
        await supabase.from('clans').delete().eq('id', selected.id);
        await supabase.from('profiles').update({ clan_id: null }).eq('id', user.id);
        await refreshProfile();
        await loadClans();
        setSelected(null);
        return;
      }
      setShowTransferModal(true);
      return;
    }
    await supabase.from('clan_members').delete().eq('clan_id', selected.id).eq('profile_id', user.id);
    await supabase.from('profiles').update({ clan_id: null }).eq('id', user.id);
    await refreshProfile();
    await loadClans();
    loadMembers(selected.id);
  }

  async function transferAndLeave() {
    if (!transferTarget || !selected) return;
    await supabase.from('clan_members').update({ role: 'owner' }).eq('clan_id', selected.id).eq('profile_id', transferTarget);
    await supabase.from('clan_members').update({ role: 'member' }).eq('clan_id', selected.id).eq('profile_id', user.id);
    await supabase.from('clans').update({ owner_id: transferTarget }).eq('id', selected.id);
    await supabase.from('clan_members').delete().eq('clan_id', selected.id).eq('profile_id', user.id);
    await supabase.from('profiles').update({ clan_id: null }).eq('id', user.id);
    await refreshProfile();
    setShowTransferModal(false);
    setTransferTarget(null);
    await loadClans();
    setSelected(null);
  }

  async function transferLeadership(memberId) {
    if (!selected || !isOwner) return;
    const { error: err } = await supabase.from('clan_members').update({ role: 'owner' }).eq('clan_id', selected.id).eq('profile_id', memberId);
    if (err) { setError('Could not transfer leadership: ' + err.message); return; }
    await supabase.from('clan_members').update({ role: 'member' }).eq('clan_id', selected.id).eq('profile_id', user.id);
    await supabase.from('clans').update({ owner_id: memberId }).eq('id', selected.id);
    await loadClans();
    loadMembers(selected.id);
  }

  async function kickMember(memberId) {
    if (!selected || !isOwner) return;
    const { error: err } = await supabase
      .from('clan_members').delete()
      .eq('clan_id', selected.id).eq('profile_id', memberId);
    if (err) { setError('Could not remove member: ' + err.message); return; }
    // profiles.clan_id is cleared by the on_clan_member_removed trigger
    loadMembers(selected.id);
  }

  async function timeoutMember(memberId) {
    if (!selected || !isOwner) return;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await supabase.from('clan_timeouts').upsert(
      { clan_id: selected.id, user_id: memberId, expires_at: expiresAt },
      { onConflict: 'clan_id,user_id' }
    );
    loadTimeouts(selected.id);
  }

  async function searchInvite(q) {
    setInviteSearch(q);
    if (q.length < 2) { setInviteResults([]); return; }
    const { data } = await supabase
      .from('profiles').select('id, username, display_name')
      .ilike('username', `%${q}%`).neq('id', user.id).limit(6);
    const memberIds = new Set(members.map(m => m.profile_id));
    setInviteResults((data || []).filter(p => !memberIds.has(p.id)));
  }

  async function sendInvite(inviteeId) {
    if (!selected || !isOwner) return;
    setInviting(true);
    const { error: err } = await supabase.from('clan_invites').insert({
      clan_id: selected.id, inviter_id: user.id, invitee_id: inviteeId,
    });
    if (err) setError(err.message);
    setInviteSearch(''); setInviteResults([]);
    setInviting(false);
  }

  async function respondInvite(inviteId, accept) {
    const invite = pendingInvites.find(i => i.id === inviteId);
    if (!invite) return;
    if (accept) {
      if (userClanId) { setError('Leave your current clan first.'); return; }
      await supabase.from('clan_invites').update({ status: 'accepted' }).eq('id', inviteId);
      const { error: err } = await supabase.from('clan_members').insert({ clan_id: invite.clan.id, profile_id: user.id, role: 'member' });
      if (err) { setError(err.message); return; }
      await supabase.from('profiles').update({ clan_id: invite.clan.id }).eq('id', user.id);
      await refreshProfile();
      await loadClans();
    } else {
      await supabase.from('clan_invites').update({ status: 'declined' }).eq('id', inviteId);
    }
    setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
  }

  function handleClanMsgChange(e) {
    const val = e.target.value;
    setMsgText(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match  = before.match(/@(\w*)$/);
    if (match) {
      setClanMentionStart(cursor - match[0].length);
      setClanMentionQuery(match[1]);
      clearTimeout(clanMentionTimer.current);
      clanMentionTimer.current = setTimeout(async () => {
        const { data } = await supabase
          .from('profiles').select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${match[1]}%,display_name.ilike.%${match[1]}%`)
          .limit(5);
        setClanMentionResults(data || []);
      }, 150);
    } else {
      setClanMentionQuery(null);
      setClanMentionResults([]);
    }
  }

  function insertClanMention(p) {
    const endPos   = clanMentionStart + 1 + (clanMentionQuery?.length || 0);
    const inserted = `@${p.username} `;
    const newVal   = msgText.slice(0, clanMentionStart) + inserted + msgText.slice(endPos);
    setMsgText(newVal);
    setClanMentionQuery(null);
    setClanMentionResults([]);
    const newCur = clanMentionStart + inserted.length;
    requestAnimationFrame(() => {
      clanInputRef.current?.focus();
      clanInputRef.current?.setSelectionRange(newCur, newCur);
    });
  }

  async function notifyClanMentions(text) {
    const raw = text.match(/@(\w+)/g) || [];
    const usernames = [...new Set(raw.map(m => m.slice(1)))];
    if (!usernames.length) return;
    const { data } = await supabase
      .from('profiles').select('id').in('username', usernames).neq('id', user.id);
    const fromName = profile?.display_name || profile?.username || 'Someone';
    for (const p of (data || [])) {
      supabase.from('notifications').insert({
        user_id: p.id, type: 'system', from_id: user.id,
        reference_id: selected?.id,
        message: `${fromName} mentioned you in ${selected?.name || 'clan chat'}`,
      });
    }
  }

  async function sendMessage() {
    const text = msgText.trim();
    if (!text || !selected || isTimedOut || sending) return;
    setSending(true);
    await supabase.from('clan_messages').insert({
      clan_id: selected.id, sender_id: user.id, content: text,
      reply_to_id: clanReplyTo?.id || null,
    });
    notifyClanMentions(text);
    setMsgText('');
    setClanReplyTo(null);
    setSending(false);
    upsertClanReadStatus(selected.id);
  }

  async function deleteClanSelected() {
    const ids = [...clanSelected];
    await Promise.all(ids.map(id => supabase.from('clan_messages').delete().eq('id', id)));
    setMessages(prev => prev.filter(m => !clanSelected.has(m.id)));
    setClanSelected(new Set());
    setClanSelectMode(false);
  }

  async function handleClanForward(toUserId) {
    if (bulkClanFwdMsgs.length > 0) {
      for (const msg of bulkClanFwdMsgs) {
        await supabase.from('messages').insert({
          sender_id: user.id, receiver_id: toUserId,
          content: msg.content || '',
          attachment_url: msg.attachment_url || null,
          attachment_type: msg.attachment_type || null,
          is_forwarded: true,
        });
      }
      setBulkClanFwdMsgs([]);
      setShowClanFwd(false);
      setClanSelected(new Set());
      setClanSelectMode(false);
      return;
    }
    if (!clanForwardMsg || !user) return;
    await supabase.from('messages').insert({
      sender_id: user.id, receiver_id: toUserId,
      content: clanForwardMsg.content || '',
      attachment_url: clanForwardMsg.attachment_url || null,
      attachment_type: clanForwardMsg.attachment_type || null,
      is_forwarded: true,
    });
    setShowClanFwd(false);
    setClanForwardMsg(null);
  }

  function handleBulkClanForward() {
    const msgsToForward = messages
      .filter(m => clanSelected.has(m.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    setBulkClanFwdMsgs(msgsToForward);
    setShowClanFwd(true);
  }

  async function uploadVideoTUS(file, objectName) {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    return new Promise((resolve, reject) => {
      const upload = new TusUpload(file, {
        endpoint: 'https://ucyrciribqaxhutjlfpj.supabase.co/storage/v1/upload/resumable',
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${accessToken}`, 'x-upsert': 'true' },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: 'chat-media', objectName, contentType: file.type, cacheControl: '3600' },
        chunkSize: 6 * 1024 * 1024,
        onError: (err) => reject(new Error(err.message || 'Upload failed')),
        onSuccess: () => {
          const { data } = supabase.storage.from('chat-media').getPublicUrl(objectName);
          resolve(data.publicUrl);
        },
      });
      upload.start();
    });
  }

  async function uploadMedia(file, type) {
    if (!file || !selected) return;
    setUploadMedia(true);
    setError('');
    const ext = file.name.split('.').pop();
    const objectName = `clan-media/${selected.id}/${Date.now()}.${ext}`;
    try {
      let publicUrl;
      if (type === 'video') {
        publicUrl = await uploadVideoTUS(file, objectName);
      } else {
        const { error: upErr } = await supabase.storage.from('chat-media').upload(objectName, file);
        if (upErr) throw new Error(upErr.message);
        const { data } = supabase.storage.from('chat-media').getPublicUrl(objectName);
        publicUrl = data.publicUrl;
      }
      await supabase.from('clan_messages').insert({
        clan_id: selected.id, sender_id: user.id,
        attachment_url: publicUrl,
        attachment_type: type,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadMedia(false);
    }
  }

  function handleImgFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) uploadMedia(f, 'image');
  }

  function handleVidFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) uploadMedia(f, 'video');
  }

  async function deleteMessage(msgId) {
    await supabase.from('clan_messages').delete().eq('id', msgId);
  }

  function hideClan(clanId, e) {
    e.stopPropagation();
    const next = new Set(hiddenClans);
    next.add(clanId);
    setHiddenClans(next);
    localStorage.setItem(`hiddenClans_${user.id}`, JSON.stringify([...next]));
    setClans(prev => prev.filter(c => c.id !== clanId));
    if (selected?.id === clanId) setSelected(null);
  }

  if (loading) return <LoadingSpinner fullScreen />;

  const otherMembers = members.filter(m => m.profile_id !== user?.id);

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* Pending invites banner */}
        {pendingInvites.length > 0 && (
          <div className="mb-4 space-y-2">
            {pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-zinc-900 border border-orange-500/30 rounded-xl px-4 py-3">
                <p className="text-sm text-zinc-300">
                  <span className="text-orange-400 font-medium">{inv.inviter?.display_name || inv.inviter?.username}</span>
                  {' '}invited you to join{' '}
                  <span className="text-white font-medium">[{inv.clan?.tag}] {inv.clan?.name}</span>
                </p>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button onClick={() => respondInvite(inv.id, true)}
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                    <Check size={12} /> Accept
                  </button>
                  <button onClick={() => respondInvite(inv.id, false)}
                    className="flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                    <X size={12} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-bold text-white">Clans</h1>
          {!userClanId && (
            <button onClick={() => { setShowForm(!showForm); setError(''); }}
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Plus size={15} /> Create Clan
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-2 mb-4 flex items-center justify-between">
            {error}
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
            <h2 className="text-white font-semibold mb-4">Create a Clan</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-500 text-xs mb-1">Clan Name</label>
                  <input value={newClan.name} required
                    onChange={e => setNewClan({ ...newClan, name: e.target.value })}
                    placeholder="e.g. Ghost Squad" className={inputCls} />
                </div>
                <div>
                  <label className="block text-zinc-500 text-xs mb-1">Tag (2–5 chars)</label>
                  <input value={newClan.tag} required maxLength={5}
                    onChange={e => setNewClan({ ...newClan, tag: e.target.value })}
                    placeholder="GHOST" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-zinc-500 text-xs mb-1">Description</label>
                <textarea value={newClan.description} rows={2}
                  onChange={e => setNewClan({ ...newClan, description: e.target.value })}
                  placeholder="What's your clan about?" className={inputCls + ' resize-none'} />
              </div>
              {/* Public / Closed toggle */}
              <div>
                <label className="block text-zinc-500 text-xs mb-2">Visibility</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setNewClan({ ...newClan, is_recruiting: true })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      newClan.is_recruiting
                        ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}>
                    <Globe size={14} /> Open
                  </button>
                  <button type="button" onClick={() => setNewClan({ ...newClan, is_recruiting: false })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      !newClan.is_recruiting
                        ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}>
                    <Lock size={14} /> Locked
                  </button>
                </div>
                <p className="text-zinc-600 text-xs mt-1">
                  {newClan.is_recruiting
                    ? 'Anyone can join this clan directly.'
                    : 'Players must request to join. You approve or deny each request.'}
                </p>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={creating}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
                  {creating ? 'Creating…' : 'Create Clan'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError(''); }}
                  className="text-zinc-400 hover:text-white text-sm px-4 py-2 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ── Clan list ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                value={clanSearch}
                onChange={e => setClanSearch(e.target.value)}
                placeholder="Search clans…"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600 transition-colors"
              />
            </div>
            {(() => {
              const q = clanSearch.toLowerCase().trim();
              const filtered = q
                ? clans.filter(c => c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q))
                : clans.filter(c => !hiddenClans.has(c.id));
              if (filtered.length === 0) return (
                <p className="text-zinc-600 text-sm text-center py-12">{q ? 'No clans match your search.' : 'No clans yet.'}</p>
              );
              return filtered.map(clan => (
              <div key={clan.id} className={`group relative bg-zinc-900 border rounded-xl transition-all ${
                selected?.id === clan.id ? 'border-orange-500/50 bg-orange-500/5' : 'border-zinc-800 hover:border-zinc-700'
              }`}>
                <button onClick={() => { setSelected(clan); setActiveTab('chat'); setError(''); }}
                  className="w-full text-left p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 font-bold text-xs">
                        [{clan.tag}]
                      </div>
                      {unreadClans.has(clan.id) && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500 border-2 border-zinc-900" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${unreadClans.has(clan.id) ? 'text-white' : 'text-zinc-200'}`}>{clan.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {clan.is_recruiting
                          ? <><Globe size={10} className="text-green-400" /><span className="text-green-400 text-xs">Open</span></>
                          : <><Lock size={10} className="text-orange-400" /><span className="text-orange-400 text-xs">Locked</span></>
                        }
                      </div>
                    </div>
                  </div>
                </button>
                <button onClick={(e) => hideClan(clan.id, e)} title="Remove from list"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all rounded">
                  <X size={13} />
                </button>
              </div>
            ));
          })()}
          </div>

          {/* ── Clan detail ───────────────────────────────────────────── */}
          <div className="md:col-span-2">
            {selected ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col" style={{ minHeight: '520px' }}>

                {/* Clan header */}
                <div className="flex items-start justify-between p-5 border-b border-zinc-800 shrink-0">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-orange-400 font-mono font-bold text-sm">[{selected.tag}]</span>
                      <h2 className="text-white text-lg font-bold">{selected.name}</h2>
                      {userClanId === selected.id && (
                        <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Your Clan</span>
                      )}
                      {selected.is_recruiting
                        ? <span className="text-xs flex items-center gap-1 text-green-400"><Globe size={11} />Open</span>
                        : <span className="text-xs flex items-center gap-1 text-orange-400"><Lock size={11} />Locked</span>
                      }
                      {/* Owner: toggle open / locked */}
                      {isOwner && (
                        <button
                          onClick={toggleClanLock}
                          disabled={togglingLock}
                          title={selected.is_recruiting ? 'Lock clan — players must request to join' : 'Open clan — anyone can join directly'}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                            selected.is_recruiting
                              ? 'border-zinc-600 text-zinc-400 hover:border-orange-500 hover:text-orange-400'
                              : 'border-orange-500/50 text-orange-400 hover:border-green-600 hover:text-green-400'
                          }`}>
                          {selected.is_recruiting ? <><Lock size={11} />Lock</> : <><Globe size={11} />Open</>}
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-400 text-xs">{selected.description || 'No description.'}</p>
                    <p className="text-zinc-600 text-xs mt-0.5">
                      {members.length}/100 members · Founded by {selected.owner?.display_name || selected.owner?.username || 'Unknown'}
                    </p>
                  </div>

                  <div className="shrink-0 ml-4">
                    {userClanId === selected.id ? (
                      <button onClick={leaveClan}
                        className="text-xs border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-400 px-4 py-1.5 rounded-lg transition-colors">
                        {isOwner ? 'Transfer & Leave' : 'Leave'}
                      </button>
                    ) : userClanId ? (
                      <span className="text-zinc-600 text-xs">In another clan</span>
                    ) : selected.is_recruiting ? (
                      <button onClick={() => joinClan(selected.id)}
                        className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
                        Join
                      </button>
                    ) : !isMember && myRequest ? (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs flex items-center gap-1.5">
                          <Clock size={11} className="text-orange-400" />
                          <span>Request sent</span>
                        </span>
                        <button onClick={() => cancelRequest(selected.id)} disabled={requestingJoin}
                          className="text-xs border border-zinc-700 hover:border-red-700 text-zinc-500 hover:text-red-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                          Cancel
                        </button>
                      </div>
                    ) : !isMember ? (
                      <button onClick={() => requestJoin(selected.id)} disabled={requestingJoin}
                        className="flex items-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
                        <UserPlus size={12} />
                        {requestingJoin ? 'Sending…' : 'Request to Join'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Tabs — only show if member */}
                {isMember && (
                  <div className="flex border-b border-zinc-800 shrink-0">
                    {[['chat', 'Chat', MessageSquare], ['members', 'Members', Users]].map(([tab, label, Icon]) => (
                      <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                          activeTab === tab
                            ? 'border-orange-500 text-orange-400'
                            : 'border-transparent text-zinc-500 hover:text-zinc-300'
                        }`}>
                        <Icon size={14} /> {label}
                        {tab === 'members' && isOwner && joinRequests.length > 0 && (
                          <span className="ml-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                            {joinRequests.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Chat tab ──────────────────────────────────────────── */}
                {(!isMember || activeTab === 'chat') && (
                  <div className="flex flex-col flex-1 overflow-hidden">
                    {!isMember ? (
                      <div className="flex items-center justify-center flex-1 text-zinc-600 text-sm p-6 text-center">
                        <div>
                          <MessageSquare size={36} className="mx-auto mb-3 opacity-30" />
                          <p>Join the clan to access the chat.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Mute + Search toolbar */}
                        {!clanSelectMode && (
                          <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-zinc-800 shrink-0">
                            <button onClick={() => { setShowClanSearch(p => !p); setClanMsgSearch(''); }}
                              className="p-1.5 text-zinc-500 hover:text-orange-400 rounded-lg transition-colors"
                              title="Search messages">
                              <Search size={14} />
                            </button>
                            <button onClick={() => toggleMuteClan(selected.id)}
                              className="p-1.5 text-zinc-500 hover:text-orange-400 rounded-lg transition-colors"
                              title={mutedClans.has(selected.id) ? 'Unmute notifications' : 'Mute notifications'}>
                              {mutedClans.has(selected.id) ? <BellOff size={14} /> : <Bell size={14} />}
                            </button>
                            <button onClick={() => setClanSelectMode(true)}
                              className="p-1.5 text-zinc-500 hover:text-orange-400 rounded-lg transition-colors"
                              title="Select messages">
                              <Check size={14} />
                            </button>
                          </div>
                        )}

                        {/* Clan search bar */}
                        {showClanSearch && !clanSelectMode && (
                          <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 shrink-0">
                            <Search size={13} className="text-zinc-500 shrink-0" />
                            <input
                              autoFocus
                              value={clanMsgSearch}
                              onChange={e => setClanMsgSearch(e.target.value)}
                              placeholder="Search messages…"
                              className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-zinc-600"
                            />
                            {clanMsgSearch && (
                              <span className="text-zinc-600 text-xs shrink-0">
                                {messages.filter(m => m.content?.toLowerCase().includes(clanMsgSearch.toLowerCase())).length}
                              </span>
                            )}
                            <button onClick={() => { setShowClanSearch(false); setClanMsgSearch(''); }}
                              className="text-zinc-600 hover:text-white shrink-0">
                              <X size={13} />
                            </button>
                          </div>
                        )}

                        {/* Select toolbar */}
                        {clanSelectMode && (
                          <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700 shrink-0">
                            <p className="text-white text-sm">{clanSelected.size} selected</p>
                            <div className="flex gap-2">
                              {clanSelected.size > 0 && (
                                <>
                                  <button onClick={handleBulkClanForward}
                                    className="flex items-center gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                    <Forward size={11} /> Forward
                                  </button>
                                  <button onClick={deleteClanSelected}
                                    className="flex items-center gap-1 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                    <Trash2 size={11} /> Delete
                                  </button>
                                </>
                              )}
                              <button onClick={() => { setClanSelectMode(false); setClanSelected(new Set()); }}
                                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '360px' }}>
                          {messages.length === 0 && (
                            <p className="text-zinc-600 text-sm text-center py-8">No messages yet. Say hi!</p>
                          )}
                          {(() => {
                            const displayMsgs = clanMsgSearch
                              ? messages.filter(m => m.content?.toLowerCase().includes(clanMsgSearch.toLowerCase()))
                              : messages;
                            // Instagram-style "Seen": last own message seen by any other member
                            let lastSeenClanId = null;
                            for (let i = displayMsgs.length - 1; i >= 0; i--) {
                              const m = displayMsgs[i];
                              if (m.sender_id !== user.id) continue;
                              const seen = Object.entries(clanReadStatus).some(
                                ([uid, ts]) => uid !== user.id && new Date(ts) >= new Date(m.created_at)
                              );
                              if (seen) { lastSeenClanId = m.id; break; }
                            }
                            return displayMsgs.map(msg => {
                            const isMine = msg.sender_id === user.id;
                            const senderName = msg.sender?.display_name || msg.sender?.username || 'Unknown';
                            const canDel = isMine || isOwner;
                            const isSelMine = isMine || isOwner;
                            return (
                              <div key={msg.id}>
                              <div
                                className={`flex gap-2 group ${isMine ? 'flex-row-reverse' : ''} ${clanSelectMode ? 'cursor-pointer' : ''}`}
                                onClick={clanSelectMode ? () => setClanSelected(prev => { const n = new Set(prev); n.has(msg.id) ? n.delete(msg.id) : n.add(msg.id); return n; }) : undefined}>
                                {/* Checkbox */}
                                {clanSelectMode && isSelMine && (
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 self-center transition-colors ${
                                    clanSelected.has(msg.id) ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'
                                  }`}>
                                    {clanSelected.has(msg.id) && <Check size={11} className="text-white" />}
                                  </div>
                                )}
                                <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold shrink-0 mt-0.5">
                                  {senderName[0].toUpperCase()}
                                </div>
                                <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[70%]`}>
                                  {/* Reply quote */}
                                  {msg.reply_msg && (
                                    <div className={`text-xs px-3 py-1.5 mb-1 rounded-xl w-full border-l-2 ${
                                      isMine ? 'bg-orange-600/30 border-orange-300 text-orange-100' : 'bg-zinc-700 border-zinc-500 text-zinc-400'
                                    }`}>
                                      <p className="font-semibold truncate">{msg.reply_msg.sender?.display_name || msg.reply_msg.sender?.username || 'Unknown'}</p>
                                      <p className="truncate opacity-80">{msg.reply_msg.content || (msg.reply_msg.attachment_type === 'image' ? '📷 Image' : '🎥 Video')}</p>
                                    </div>
                                  )}
                                  {/* Forwarded label */}
                                  {msg.is_forwarded && (
                                    <p className={`text-xs mb-0.5 flex items-center gap-1 ${isMine ? 'text-orange-200' : 'text-zinc-500'}`}>
                                      <Forward size={10} /> Forwarded
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-zinc-500 text-xs">{senderName}</span>
                                    <span className="text-zinc-700 text-xs">{fmt(msg.created_at)}</span>
                                    {!clanSelectMode && (
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setClanReplyTo(msg)} title="Reply" className="p-0.5 text-zinc-600 hover:text-zinc-300"><Reply size={11} /></button>
                                        <button onClick={() => { setClanForwardMsg(msg); setShowClanFwd(true); }} title="Forward" className="p-0.5 text-zinc-600 hover:text-zinc-300"><Forward size={11} /></button>
                                        {canDel && <button onClick={() => deleteMessage(msg.id)} className="p-0.5 text-zinc-600 hover:text-red-400"><Trash2 size={11} /></button>}
                                        {!clanSelectMode && isSelMine && <button onClick={() => { setClanSelectMode(true); setClanSelected(new Set([msg.id])); }} className="p-0.5 text-zinc-600 hover:text-zinc-300"><Check size={11} /></button>}
                                      </div>
                                    )}
                                  </div>
                                  {msg.content && (
                                    <div className={`rounded-2xl px-3 py-2 text-sm ${isMine ? 'bg-orange-500 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'}`}>
                                      {msg.content}
                                    </div>
                                  )}
                                  {msg.attachment_type === 'image' && (
                                    <div className="relative group/media mt-1">
                                      <img src={msg.attachment_url} alt="" className="rounded-xl max-w-xs max-h-48 object-cover cursor-pointer"
                                        onClick={() => window.open(msg.attachment_url, '_blank')} />
                                      <button onClick={(e) => { e.stopPropagation(); downloadMedia(msg.attachment_url, 'image'); }}
                                        className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover/media:opacity-100 transition-opacity"
                                        title="Download"><Download size={13} /></button>
                                    </div>
                                  )}
                                  {msg.attachment_type === 'video' && (
                                    <div className="relative group/media mt-1">
                                      <video src={msg.attachment_url} controls className="rounded-xl max-w-xs max-h-48" />
                                      <button onClick={() => downloadMedia(msg.attachment_url, 'video')}
                                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover/media:opacity-100 transition-opacity"
                                        title="Download"><Download size={13} /></button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Instagram-style "Seen" below last seen own message */}
                              {lastSeenClanId === msg.id && isMine && (
                                <div className="flex justify-end pr-2 mt-0.5">
                                  <span className="text-zinc-500 text-[10px]">Seen</span>
                                </div>
                              )}
                              </div>
                            );
                          });
                          })()}
                          <div ref={msgEndRef} />
                        </div>

                        {/* Timeout notice or input */}
                        <div className="p-3 border-t border-zinc-800 shrink-0">
                          {isTimedOut ? (
                            <div className="flex items-center justify-center gap-2 bg-red-950/50 border border-red-800/50 rounded-xl py-3 text-sm text-red-400">
                              <Clock size={14} />
                              You are timed out — {fmtTimeout(myTimeout.expires_at)} remaining
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {/* Reply preview */}
                              {clanReplyTo && (
                                <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2">
                                  <div className="flex-1 border-l-2 border-orange-500 pl-2 min-w-0">
                                    <p className="text-orange-400 text-xs font-semibold truncate">
                                      Replying to {clanReplyTo.sender?.display_name || clanReplyTo.sender?.username}
                                    </p>
                                    <p className="text-zinc-400 text-xs truncate">
                                      {clanReplyTo.content || (clanReplyTo.attachment_type === 'image' ? '📷 Image' : '🎥 Video')}
                                    </p>
                                  </div>
                                  <button onClick={() => setClanReplyTo(null)} className="text-zinc-500 hover:text-white shrink-0"><X size={13} /></button>
                                </div>
                              )}
                              {/* @mention dropdown */}
                              {clanMentionResults.length > 0 && clanMentionQuery !== null && (
                                <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden mb-1 shadow-xl">
                                  {clanMentionResults.map(p => (
                                    <button key={p.id} type="button"
                                      onMouseDown={e => { e.preventDefault(); insertClanMention(p); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700 text-left transition-colors">
                                      <Avatar url={p.avatar_url} name={p.display_name || p.username} size="xs" />
                                      <div className="min-w-0">
                                        <p className="text-white text-xs font-medium truncate">{p.display_name || p.username}</p>
                                        <p className="text-zinc-500 text-[10px] truncate">@{p.username}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImgFile} />
                              <input ref={vidInputRef} type="file" accept="video/*" className="hidden" onChange={handleVidFile} />
                              <button onClick={() => imgInputRef.current?.click()} disabled={uploadingMedia}
                                title="Send image"
                                className="text-zinc-500 hover:text-orange-400 transition-colors shrink-0 disabled:opacity-50">
                                <Image size={18} />
                              </button>
                              <button onClick={() => vidInputRef.current?.click()} disabled={uploadingMedia}
                                title="Send video"
                                className="text-zinc-500 hover:text-orange-400 transition-colors shrink-0 disabled:opacity-50">
                                {uploadingMedia ? <Clock size={16} className="animate-spin" /> : <Video size={18} />}
                              </button>
                              <input
                                ref={clanInputRef}
                                value={msgText}
                                onChange={handleClanMsgChange}
                                onKeyDown={e => {
                                  if (e.key === 'Escape') { setClanMentionQuery(null); setClanMentionResults([]); return; }
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                                }}
                                placeholder="Message clan… use @ to tag"
                                className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                              />
                              <button onClick={sendMessage} disabled={!msgText.trim() || sending}
                                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl p-2 transition-colors shrink-0">
                                <Send size={16} />
                              </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── Members tab ───────────────────────────────────────── */}
                {isMember && activeTab === 'members' && (
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* Join Requests (owner only, locked clan) */}
                    {isOwner && !selected.is_recruiting && (
                      <div>
                        <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
                          Join Requests
                          {joinRequests.length > 0 && (
                            <span className="ml-2 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                              {joinRequests.length}
                            </span>
                          )}
                        </p>
                        {joinRequests.length === 0 ? (
                          <p className="text-zinc-600 text-xs py-2">No pending requests.</p>
                        ) : (
                          <div className="space-y-2 mb-2">
                            {joinRequests.map(req => {
                              const name = req.requester?.display_name || req.requester?.username || '?';
                              return (
                                <div key={req.id} className="flex items-center gap-3 bg-zinc-800/80 border border-orange-500/20 rounded-lg px-3 py-2">
                                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold shrink-0">
                                    {name[0].toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm truncate">{name}</p>
                                    <p className="text-zinc-500 text-xs truncate">@{req.requester?.username} · wants to join</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button onClick={() => approveRequest(req.id, req.inviter_id)}
                                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                                      <Check size={11} /> Approve
                                    </button>
                                    <button onClick={() => declineRequest(req.id)}
                                      className="flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                                      <X size={11} /> Decline
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Invite (owner only) */}
                    {isOwner && (
                      <div>
                        <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">Invite Player</p>
                        <div className="relative">
                          <div className="flex items-center gap-2">
                            <input value={inviteSearch}
                              onChange={e => searchInvite(e.target.value)}
                              placeholder="Search by username…"
                              className={inputCls} />
                          </div>
                          {inviteResults.length > 0 && (
                            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl">
                              {inviteResults.map(p => (
                                <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-700 transition-colors">
                                  <div>
                                    <p className="text-white text-sm">{p.display_name || p.username}</p>
                                    <p className="text-zinc-500 text-xs">@{p.username}</p>
                                  </div>
                                  <button onClick={() => sendInvite(p.id)} disabled={inviting}
                                    className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50">
                                    <UserPlus size={11} /> Invite
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Member list */}
                    <div>
                      <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">
                        Members ({members.length}/100)
                      </p>
                      <div className="space-y-2">
                        {members.map(m => {
                          const name = m.profiles?.display_name || m.profiles?.username || '?';
                          const memberId = m.profile_id;
                          const isSelf = memberId === user.id;
                          const memberTimeout = timeouts.find(t => t.user_id === memberId && new Date(t.expires_at) > new Date());
                          return (
                            <div key={m.id} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-3 py-2">
                              <Avatar
                                url={m.profiles?.avatar_url}
                                name={name}
                                size="sm"
                                online={onlineUsers.has(memberId)}
                                showOffline
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm truncate">{name}</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-zinc-500 text-xs">{m.profiles?.rank || 'Unranked'} · {m.profiles?.platform || 'PC'}</p>
                                  {memberTimeout && (
                                    <span className="text-xs text-red-400 flex items-center gap-1">
                                      <Clock size={10} /> {fmtTimeout(memberTimeout.expires_at)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                                m.role === 'owner' ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-700 text-zinc-400'
                              }`}>
                                {m.role === 'owner' ? '👑 Leader' : 'Member'}
                              </span>

                              {/* Leader controls */}
                              {isOwner && !isSelf && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => timeoutMember(memberId)} title="Timeout 5 min"
                                    className="w-7 h-7 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 flex items-center justify-center transition-colors">
                                    <Clock size={13} />
                                  </button>
                                  <button onClick={() => transferLeadership(memberId)} title="Make Leader"
                                    className="w-7 h-7 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 flex items-center justify-center transition-colors">
                                    <Crown size={13} />
                                  </button>
                                  <button onClick={() => kickMember(memberId)} title="Remove from clan"
                                    className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors">
                                    <UserX size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl" style={{ minHeight: '520px' }}>
                <div className="text-center text-zinc-600">
                  <Users size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a clan to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Clan forward modal */}
      {showClanFwd && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-white font-bold mb-1">Forward to…</h3>
            <p className="text-zinc-500 text-xs mb-3 truncate">
              {bulkClanFwdMsgs.length > 0
                ? `${bulkClanFwdMsgs.length} message${bulkClanFwdMsgs.length > 1 ? 's' : ''}`
                : `"${clanForwardMsg?.content || (clanForwardMsg?.attachment_type === 'image' ? '📷 Image' : '🎥 Video')}"`}
            </p>
            <p className="text-zinc-600 text-xs mb-2">Select a clan member to DM</p>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {members.filter(m => m.profile_id !== user.id).map(m => {
                const name = m.profiles?.display_name || m.profiles?.username || '?';
                return (
                  <button key={m.id} onClick={() => handleClanForward(m.profile_id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors text-left">
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs shrink-0">
                      {name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-sm">{name}</p>
                      <p className="text-zinc-500 text-xs">@{m.profiles?.username}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setShowClanFwd(false); setClanForwardMsg(null); setBulkClanFwdMsgs([]); }}
              className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2.5 rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transfer & Leave modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">Transfer Leadership</h3>
            <p className="text-zinc-400 text-sm mb-4">Choose a new leader before leaving. This cannot be undone.</p>
            <div className="space-y-2 max-h-52 overflow-y-auto mb-4">
              {otherMembers.map(m => {
                const name = m.profiles?.display_name || m.profiles?.username || '?';
                return (
                  <button key={m.id} onClick={() => setTransferTarget(m.profile_id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${
                      transferTarget === m.profile_id
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-700 hover:border-zinc-600'
                    }`}>
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold shrink-0">
                      {name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-sm">{name}</p>
                      <p className="text-zinc-500 text-xs">@{m.profiles?.username}</p>
                    </div>
                    {transferTarget === m.profile_id && <Check size={16} className="text-orange-400 ml-auto" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={transferAndLeave} disabled={!transferTarget}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                Transfer & Leave
              </button>
              <button onClick={() => { setShowTransferModal(false); setTransferTarget(null); }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2.5 rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
