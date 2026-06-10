import { useEffect, useRef, useState } from 'react';
import { Upload as TusUpload } from 'tus-js-client';
import {
  MessageSquare, Send, Smile, Paperclip, Mic, MicOff,
  Image as ImageIcon, Video, Ban, X, Volume2, Phone, Pencil, Trash2,
  Reply, Forward, Check, CheckCheck, Download, Search, Bell, BellOff,
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { supabase } from '../lib/supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';

const MAX_IMAGE_BYTES = 100 * 1024 * 1024;  // 100 MB for images
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;  // 500 MB for videos

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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

// ─── message renderer ────────────────────────────────────────────────────────

function MsgBubble({ msg, own, onEdit, onDelete, onReply, onForward, selectMode, isSelected, onSelect }) {
  const [editing,  setEditing]  = useState(false);
  const [editText, setEditText] = useState(msg.content || '');

  const bubble = own
    ? 'bg-orange-500 text-white rounded-br-sm'
    : 'bg-zinc-800 text-zinc-200 rounded-bl-sm';
  const ts = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  function startEdit() { setEditText(msg.content || ''); setEditing(true); }

  async function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed) { setEditing(false); return; }
    await onEdit(msg.id, trimmed);
    setEditing(false);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') setEditing(false);
  }

  const canEdit = own && !msg.attachment_type && !!msg.content;

  const actionBtn = 'p-1 text-zinc-600 hover:text-zinc-300 rounded transition-colors';

  return (
    <div
      className={`flex ${own ? 'justify-end' : 'justify-start'} group items-end gap-1 ${selectMode ? 'cursor-pointer' : ''}`}
      onClick={selectMode ? () => onSelect(msg.id) : undefined}
    >
      {/* Checkbox in select mode */}
      {selectMode && (
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mb-1 transition-colors ${
          isSelected ? 'bg-orange-500 border-orange-500' : 'border-zinc-600 bg-transparent'
        }`}>
          {isSelected && <Check size={11} className="text-white" />}
        </div>
      )}

      {/* Hover actions — left of bubble for own messages */}
      {own && !editing && !selectMode && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pb-1 shrink-0">
          <button onClick={() => onReply(msg)} className={actionBtn} title="Reply"><Reply size={13} /></button>
          <button onClick={() => onForward(msg)} className={actionBtn} title="Forward"><Forward size={13} /></button>
          {canEdit && <button onClick={startEdit} className={actionBtn} title="Edit"><Pencil size={13} /></button>}
          <button onClick={() => onDelete(msg.id)} className="p-1 text-zinc-600 hover:text-red-400 rounded transition-colors" title="Delete"><Trash2 size={13} /></button>
        </div>
      )}

      <div className={`flex flex-col ${own ? 'items-end' : 'items-start'} max-w-xs lg:max-w-sm`}>
        {/* Reply quote */}
        {msg.reply_msg && (
          <div className={`text-xs px-3 py-1.5 mb-1 rounded-xl w-full border-l-2 ${
            own ? 'bg-orange-600/30 border-orange-300 text-orange-100' : 'bg-zinc-700 border-zinc-500 text-zinc-400'
          }`}>
            <p className="font-semibold truncate">{msg.reply_msg.sender?.display_name || msg.reply_msg.sender?.username || 'Unknown'}</p>
            <p className="truncate opacity-80">{msg.reply_msg.content || (msg.reply_msg.attachment_type === 'image' ? '📷 Image' : msg.reply_msg.attachment_type === 'video' ? '🎥 Video' : '🎵 Voice')}</p>
          </div>
        )}

        {/* Forwarded label */}
        {msg.is_forwarded && (
          <p className={`text-xs mb-0.5 flex items-center gap-1 ${own ? 'text-orange-200' : 'text-zinc-500'}`}>
            <Forward size={10} /> Forwarded
          </p>
        )}

        <div className={`rounded-2xl overflow-hidden w-full ${bubble}`}>
          {msg.attachment_type === 'image' && (
            <div className="relative group/media">
              <img
                src={msg.attachment_url} alt="image"
                className="w-full object-cover max-h-60 block"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <button
                onClick={() => downloadMedia(msg.attachment_url, 'image')}
                className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover/media:opacity-100 transition-opacity"
                title="Download"
              ><Download size={13} /></button>
            </div>
          )}
          {msg.attachment_type === 'video' && (
            <div className="relative group/media">
              <video src={msg.attachment_url} controls className="w-full max-h-60 block bg-black" />
              <button
                onClick={() => downloadMedia(msg.attachment_url, 'video')}
                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover/media:opacity-100 transition-opacity"
                title="Download"
              ><Download size={13} /></button>
            </div>
          )}
          {msg.attachment_type === 'audio' && (
            <div className="px-3 py-2 flex items-center gap-2">
              <Volume2 size={16} className="shrink-0" />
              <audio src={msg.attachment_url} controls className="h-8 w-44" />
            </div>
          )}

          {editing ? (
            <div className="px-3 py-2 space-y-1.5">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={handleKey}
                className="w-full bg-orange-600/70 text-white text-sm rounded px-2 py-1 focus:outline-none resize-none placeholder:text-orange-200"
                autoFocus maxLength={1000} rows={2}
              />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="text-xs bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded transition-colors">Save</button>
                <button onClick={() => setEditing(false)} className="text-xs text-orange-200 hover:text-white transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            msg.content && <div className="px-4 py-2 text-sm">{msg.content}</div>
          )}

          <div className={`text-xs px-4 pb-2 ${own ? 'text-orange-200' : 'text-zinc-500'}`}>{ts}</div>
        </div>
      </div>

      {/* Hover actions — right of bubble for others' messages */}
      {!own && !selectMode && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pb-1 shrink-0">
          <button onClick={() => onReply(msg)} className={actionBtn} title="Reply"><Reply size={13} /></button>
          <button onClick={() => onForward(msg)} className={actionBtn} title="Forward"><Forward size={13} /></button>
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Chats() {
  const { user, profile, onlineUsers } = useAuth();
  const { initiateCall } = useCall();
  const location = useLocation();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [hiddenChats, setHiddenChats]     = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`hiddenChats_${user?.id}`) || '[]')); }
    catch { return new Set(); }
  });
  const [selected, setSelected]           = useState(null);

  // reply / forward / bulk-select
  const [replyTo,           setReplyTo]           = useState(null);
  const [forwardMsg,        setForwardMsg]        = useState(null);
  const [bulkForwardMsgs,   setBulkForwardMsgs]   = useState([]);
  const [showForwardModal,  setShowForwardModal]  = useState(false);
  const [selectMode,        setSelectMode]        = useState(false);
  const [selectedMsgs,      setSelectedMsgs]      = useState(new Set());
  const [mutedChats,        setMutedChats]        = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`mutedChats_${user?.id}`) || '[]')); }
    catch { return new Set(); }
  });
  const mutedChatsRef = useRef(new Set());
  const [unreadChats,   setUnreadChats]   = useState(new Map()); // userId → unread count
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearch,     setMsgSearch]     = useState('');
  const [messages, setMessages]           = useState([]);
  const [text, setText]                   = useState('');
  const [search, setSearch]               = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [sending, setSending]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');

  // block status: null | 'blocked_them' | 'blocked_by_them'
  const [blockStatus, setBlockStatus] = useState(null);

  // emoji picker
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef  = useRef(null);

  // attachment menu
  const [showAttach, setShowAttach] = useState(false);
  const attachRef = useRef(null);

  // file inputs
  const imgInputRef   = useRef(null);
  const vidInputRef   = useRef(null);
  const [uploading, setUploading] = useState(false);

  // voice recording
  const mediaRecRef   = useRef(null);
  const audioChunks   = useRef([]);
  const timerRef      = useRef(null);
  const [recording, setRecording]     = useState(false);
  const [recSeconds, setRecSeconds]   = useState(0);

  const bottomRef = useRef(null);
  const chanRef   = useRef(null);

  // ── initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (user) {
      loadConversations().finally(() => setLoading(false));
      loadInitialUnreadCounts();
    }
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // auto-open user passed via navigation state (from Friends / UserProfile)
  useEffect(() => {
    const openUser = location.state?.openUser;
    if (openUser && !loading) pickUser(openUser);
  }, [loading, location.state]);

  // close emoji / attach pickers on outside click
  useEffect(() => {
    function handler(e) {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
      if (attachRef.current && !attachRef.current.contains(e.target)) setShowAttach(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── notification permission + mute ref sync ─────────────────────────────────

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => { mutedChatsRef.current = mutedChats; }, [mutedChats]);

  function toggleMuteChat(userId) {
    setMutedChats(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      localStorage.setItem(`mutedChats_${user.id}`, JSON.stringify([...next]));
      return next;
    });
  }

  // ── subscribe to DMs when conversation changes ───────────────────────────────

  useEffect(() => {
    chanRef.current?.unsubscribe();
    if (!selected) return;
    setUnreadChats(prev => { const n = new Map(prev); n.delete(selected.id); return n; });

    loadMessages(selected.id);
    markMessagesRead(selected.id);
    checkBlock(selected.id);

    const isMine = (msg) =>
      !msg.room_id &&
      ((msg.sender_id === user.id && msg.receiver_id === selected.id) ||
       (msg.sender_id === selected.id && msg.receiver_id === user.id));

    chanRef.current = supabase
      .channel(`dm-${[user.id, selected.id].sort().join('-')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: msg }) => {
        if (!isMine(msg)) return;
        let enriched = msg;
        if (msg.reply_to_id) {
          const { data: rm } = await supabase
            .from('messages')
            .select('id, content, attachment_type, sender_id, sender:profiles!sender_id(username, display_name)')
            .eq('id', msg.reply_to_id).single();
          if (rm) enriched = { ...msg, reply_msg: rm };
        }
        setMessages(prev => [...prev, enriched]);
        if (msg.sender_id !== user.id) {
          setUnreadChats(prev => { const n = new Map(prev); n.set(msg.sender_id, (n.get(msg.sender_id) || 0) + 1); return n; });
          if (!document.hidden) {
            // Chat is visible — mark as read immediately so sender sees blue ticks
            supabase.from('messages').update({ is_read: true }).eq('id', msg.id);
          } else if (!mutedChatsRef.current.has(msg.sender_id) && Notification.permission === 'granted') {
            new Notification(selected.display_name || selected.username || 'New message', {
              body: msg.content || (msg.attachment_type === 'image' ? '📷 Image' : msg.attachment_type === 'video' ? '🎥 Video' : '🎵 Voice message'),
              icon: '/favicon.ico',
            });
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, ({ new: msg }) => {
        if (isMine(msg)) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: msg.content, is_read: msg.is_read } : m));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old: msg }) => {
        setMessages(prev => prev.filter(m => m.id !== msg.id));
      })
      .subscribe();

    return () => chanRef.current?.unsubscribe();
  }, [selected]);

  // ── data loaders ────────────────────────────────────────────────────────────

  async function markMessagesRead(otherId) {
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', otherId)
      .eq('receiver_id', user.id)
      .is('room_id', null)
      .eq('is_read', false);
  }

  async function loadInitialUnreadCounts() {
    const { data } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .is('room_id', null)
      .eq('is_read', false);
    const counts = new Map();
    for (const msg of (data || [])) {
      counts.set(msg.sender_id, (counts.get(msg.sender_id) || 0) + 1);
    }
    setUnreadChats(counts);
  }

  async function loadConversations() {
    const { data } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, content, created_at, attachment_type, sender:profiles!sender_id(id,username,display_name,avatar_url), receiver:profiles!receiver_id(id,username,display_name,avatar_url)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .is('room_id', null)
      .order('created_at', { ascending: false });

    if (!data) return;
    const hidden = (() => {
      try { return new Set(JSON.parse(localStorage.getItem(`hiddenChats_${user.id}`) || '[]')); }
      catch { return new Set(); }
    })();
    const seen = new Set();
    const convos = [];
    for (const msg of data) {
      const other = msg.sender_id === user.id ? msg.receiver : msg.sender;
      if (!other || seen.has(other.id) || hidden.has(other.id)) continue;
      seen.add(other.id);
      const preview = msg.attachment_type === 'image' ? '📷 Image'
        : msg.attachment_type === 'video' ? '🎥 Video'
        : msg.attachment_type === 'audio' ? '🎵 Voice note'
        : msg.content;
      convos.push({ ...other, lastMessage: preview });
    }
    setConversations(convos);
  }

  async function loadMessages(otherId) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .is('room_id', null)
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),` +
        `and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true });

    const msgs = data || [];
    const replyIds = [...new Set(msgs.filter(m => m.reply_to_id).map(m => m.reply_to_id))];
    if (replyIds.length > 0) {
      const { data: replyMsgs } = await supabase
        .from('messages')
        .select('id, content, attachment_type, sender_id, sender:profiles!sender_id(username, display_name)')
        .in('id', replyIds);
      const replyMap = Object.fromEntries((replyMsgs || []).map(m => [m.id, m]));
      setMessages(msgs.map(m => m.reply_to_id ? { ...m, reply_msg: replyMap[m.reply_to_id] } : m));
    } else {
      setMessages(msgs);
    }
  }

  async function checkBlock(otherId) {
    const { data } = await supabase
      .from('friendships')
      .select('status, requester_id')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),` +
        `and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`
      )
      .eq('status', 'blocked')
      .maybeSingle();

    if (!data) { setBlockStatus(null); return; }
    setBlockStatus(data.requester_id === user.id ? 'blocked_them' : 'blocked_by_them');
  }

  // ── search ──────────────────────────────────────────────────────────────────

  async function handleSearch(e) {
    const q = e.target.value;
    setSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const [r1, r2] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url').neq('id', user.id).ilike('username', `%${q}%`).limit(5),
      supabase.from('profiles').select('id,username,display_name,avatar_url').neq('id', user.id).ilike('display_name', `%${q}%`).limit(5),
    ]);
    const seen = new Set();
    const merged = [];
    for (const row of [...(r1.data || []), ...(r2.data || [])]) {
      if (!seen.has(row.id)) { seen.add(row.id); merged.push(row); }
    }
    setSearchResults(merged.slice(0, 6));
  }

  function pickUser(u) {
    // un-hide if user explicitly opens this conversation again
    if (hiddenChats.has(u.id)) {
      const next = new Set(hiddenChats);
      next.delete(u.id);
      setHiddenChats(next);
      localStorage.setItem(`hiddenChats_${user.id}`, JSON.stringify([...next]));
    }
    setSelected(u);
    setSearch('');
    setSearchResults([]);
    setShowEmoji(false);
    setShowAttach(false);
    setConversations((prev) => {
      if (prev.find((c) => c.id === u.id)) return prev;
      return [{ ...u, lastMessage: '' }, ...prev];
    });
  }

  // ── edit / delete ────────────────────────────────────────────────────────────

  async function editMessage(msgId, newContent) {
    const { error } = await supabase.from('messages')
      .update({ content: newContent })
      .eq('id', msgId).eq('sender_id', user.id);
    if (!error) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: newContent } : m));
    else setError(error.message);
  }

  async function deleteMessage(msgId) {
    const { error } = await supabase.from('messages')
      .delete().eq('id', msgId).eq('sender_id', user.id);
    if (!error) setMessages(prev => prev.filter(m => m.id !== msgId));
    else setError(error.message);
  }

  function deleteConversation(otherId, e) {
    e.stopPropagation();
    const next = new Set(hiddenChats);
    next.add(otherId);
    setHiddenChats(next);
    localStorage.setItem(`hiddenChats_${user.id}`, JSON.stringify([...next]));
    setConversations(prev => prev.filter(c => c.id !== otherId));
    if (selected?.id === otherId) setSelected(null);
  }

  // ── send helpers ─────────────────────────────────────────────────────────────

  async function uploadToStorage(file, fileName) {
    const path = `${user.id}/${fileName}`;
    const { error: upErr } = await supabase.storage
      .from('chat-media')
      .upload(path, file, { upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: { publicUrl } } = supabase.storage.from('chat-media').getPublicUrl(path);
    return publicUrl;
  }

  async function dispatchMessage({ content = '', attachment_url = null, attachment_type = null, reply_to_id = null, is_forwarded = false, toUserId = null }) {
    const receiverId = toUserId || selected?.id;
    if (!receiverId) return;
    const { error: sendErr } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content,
      attachment_url,
      attachment_type,
      reply_to_id,
      is_forwarded,
    });
    if (sendErr) { setError(sendErr.message); return; }
    // Notify the receiver so the Navbar bell lights up
    if (receiverId !== user.id) {
      supabase.from('notifications').insert({
        user_id:      receiverId,
        type:         'message',
        from_id:      user.id,
        reference_id: user.id,
        message:      `${profile?.display_name || profile?.username || 'Someone'} sent you a message`,
      });
    }
    loadConversations();
  }

  async function deleteSelected() {
    const ids = [...selectedMsgs];
    await Promise.all(ids.map(id =>
      supabase.from('messages').delete().eq('id', id).eq('sender_id', user.id)
    ));
    setMessages(prev => prev.filter(m => !selectedMsgs.has(m.id)));
    setSelectedMsgs(new Set());
    setSelectMode(false);
  }

  async function handleForward(toUserId) {
    if (bulkForwardMsgs.length > 0) {
      for (const msg of bulkForwardMsgs) {
        await dispatchMessage({ content: msg.content || '', attachment_url: msg.attachment_url || null, attachment_type: msg.attachment_type || null, is_forwarded: true, toUserId });
      }
      setBulkForwardMsgs([]);
      setShowForwardModal(false);
      setSelectedMsgs(new Set());
      setSelectMode(false);
      return;
    }
    if (!forwardMsg) return;
    await dispatchMessage({
      content: forwardMsg.content || '',
      attachment_url: forwardMsg.attachment_url || null,
      attachment_type: forwardMsg.attachment_type || null,
      is_forwarded: true,
      toUserId,
    });
    setShowForwardModal(false);
    setForwardMsg(null);
  }

  function openForward(msg) {
    setForwardMsg(msg);
    setShowForwardModal(true);
  }

  function handleBulkForward() {
    const msgsToForward = messages
      .filter(m => selectedMsgs.has(m.id))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    setBulkForwardMsgs(msgsToForward);
    setShowForwardModal(true);
  }

  // ── send text / emoji ────────────────────────────────────────────────────────

  async function sendText(e) {
    e.preventDefault();
    if (!text.trim() || !selected || blockStatus) return;
    setSending(true);
    await dispatchMessage({ content: text.trim(), reply_to_id: replyTo?.id || null });
    setText('');
    setReplyTo(null);
    setSending(false);
  }

  function insertEmoji(emoji) {
    setText((prev) => prev + emoji);
  }

  // ── send image ────────────────────────────────────────────────────────────────

  async function handleImageFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setShowAttach(false);
    if (file.size > MAX_IMAGE_BYTES) { setError('Image must be under 100 MB.'); return; }
    setUploading(true);
    try {
      const url = await uploadToStorage(file, `img_${Date.now()}_${file.name}`);
      await dispatchMessage({ attachment_url: url, attachment_type: 'image' });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // ── send video (TUS resumable — bypasses 50MB standard-upload limit) ─────────

  async function uploadVideoWithTUS(file, fileName) {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const bucketName = 'chat-media';
    const objectName = `${user.id}/${fileName}`;

    return new Promise((resolve, reject) => {
      const upload = new TusUpload(file, {
        endpoint: 'https://ucyrciribqaxhutjlfpj.supabase.co/storage/v1/upload/resumable',
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${accessToken}`,
          'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName,
          objectName,
          contentType: file.type,
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024,
        onError: (err) => reject(new Error(err.message || 'Upload failed')),
        onSuccess: () => {
          const { data } = supabase.storage.from(bucketName).getPublicUrl(objectName);
          resolve(data.publicUrl);
        },
      });
      upload.start();
    });
  }

  async function handleVideoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setShowAttach(false);
    if (file.size > MAX_VIDEO_BYTES) { setError('Video must be under 500 MB.'); return; }
    setUploading(true);
    try {
      const url = await uploadVideoWithTUS(file, `vid_${Date.now()}_${file.name}`);
      await dispatchMessage({ attachment_url: url, attachment_type: 'video' });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // ── voice recording ──────────────────────────────────────────────────────────

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setUploading(true);
        try {
          const url = await uploadToStorage(blob, `voice_${Date.now()}.webm`);
          await dispatchMessage({ attachment_url: url, attachment_type: 'audio' });
        } catch (err) {
          setError(err.message);
        } finally {
          setUploading(false);
        }
      };
      mediaRecRef.current = recorder;
      recorder.start(100);
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError('Microphone access denied. Allow mic access and try again.');
    }
  }

  function stopRecording() {
    if (mediaRecRef.current && recording) {
      mediaRecRef.current.stop();
      clearInterval(timerRef.current);
      setRecording(false);
      setRecSeconds(0);
    }
  }

  // ── block / unblock ──────────────────────────────────────────────────────────

  async function blockUser() {
    if (!selected) return;
    // Remove any existing friendship row first, then insert blocked row
    await supabase.from('friendships').delete().or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${selected.id}),` +
      `and(requester_id.eq.${selected.id},addressee_id.eq.${user.id})`
    );
    await supabase.from('friendships').insert({ requester_id: user.id, addressee_id: selected.id, status: 'blocked' });
    setBlockStatus('blocked_them');
  }

  async function unblockUser() {
    if (!selected) return;
    await supabase.from('friendships').delete()
      .eq('requester_id', user.id).eq('addressee_id', selected.id).eq('status', 'blocked');
    setBlockStatus(null);
  }

  // ────────────────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="bg-zinc-950 flex" style={{ height: 'calc(100vh - 56px)' }}>

      {/* hidden file inputs */}
      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
      <input ref={vidInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFile} />

      {/* ── Left: conversation list ─────────────────────────────────────────── */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-zinc-800">
          <p className="text-white font-semibold text-sm mb-2">Messages</p>
          <div className="relative">
            <input
              value={search} onChange={handleSearch}
              placeholder="Find a player…"
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-lg mt-1 z-10 overflow-hidden shadow-xl">
                {searchResults.map((u) => (
                  <button key={u.id} onClick={() => pickUser(u)}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-white text-xs transition-colors"
                  >
                    {u.display_name || u.username}
                    <span className="text-zinc-500 ml-1">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-zinc-600 text-xs text-center p-6">Search for a player to start chatting</p>
          ) : (
            conversations.map((c) => (
              <div key={c.id}
                className={`group relative flex items-center border-b border-zinc-800 transition-colors ${
                  selected?.id === c.id ? 'bg-orange-500/10' : 'hover:bg-zinc-800'
                }`}
              >
                <button onClick={() => pickUser(c)} className="flex-1 text-left px-3 py-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      <Avatar
                        url={c.avatar_url}
                        name={c.display_name || c.username}
                        size="sm"
                        online={onlineUsers.has(c.id)}
                        showOffline
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-xs font-medium truncate ${(unreadChats.get(c.id) || 0) > 0 ? 'text-white' : 'text-zinc-300'}`}>
                          {c.display_name || c.username}
                        </p>
                        {(unreadChats.get(c.id) || 0) > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] bg-orange-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-1 leading-none">
                            {unreadChats.get(c.id) > 99 ? '99+' : unreadChats.get(c.id)}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs truncate ${(unreadChats.get(c.id) || 0) > 0 ? 'text-orange-400/70' : 'text-zinc-500'}`}>
                        {c.lastMessage}
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => deleteConversation(c.id, e)}
                  title="Delete from history"
                  className="opacity-0 group-hover:opacity-100 mr-2 shrink-0 p-1 text-zinc-600 hover:text-red-400 transition-all rounded"
                >
                  <X size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Right: chat window ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
              {selectMode ? (
                <>
                  <p className="text-white text-sm font-medium">{selectedMsgs.size} selected</p>
                  <div className="flex items-center gap-2">
                    {selectedMsgs.size > 0 && (
                      <>
                        <button onClick={handleBulkForward}
                          className="flex items-center gap-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                          <Forward size={12} /> Forward
                        </button>
                        <button onClick={deleteSelected}
                          className="flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                          <Trash2 size={12} /> Delete
                        </button>
                      </>
                    )}
                    <button onClick={() => { setSelectMode(false); setSelectedMsgs(new Set()); }}
                      className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate(`/profile/${selected.username}`)}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    <Avatar
                      url={selected.avatar_url}
                      name={selected.display_name || selected.username}
                      size="sm"
                      online={onlineUsers.has(selected.id)}
                      showOffline
                    />
                    <div className="text-left">
                      <p className="text-white font-semibold text-sm hover:text-orange-400 transition-colors">{selected.display_name || selected.username}</p>
                      <p className={`text-xs ${onlineUsers.has(selected.id) ? 'text-green-400' : 'text-zinc-500'}`}>
                        {onlineUsers.has(selected.id) ? 'Online' : 'Offline'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    <button onClick={() => { setShowMsgSearch(p => !p); setMsgSearch(''); }}
                      className="p-2 text-zinc-500 hover:text-orange-400 transition-colors rounded-lg"
                      title="Search messages">
                      <Search size={16} />
                    </button>
                    <button onClick={() => toggleMuteChat(selected.id)}
                      className="p-2 text-zinc-500 hover:text-orange-400 transition-colors rounded-lg"
                      title={mutedChats.has(selected.id) ? 'Unmute notifications' : 'Mute notifications'}>
                      {mutedChats.has(selected.id) ? <BellOff size={16} /> : <Bell size={16} />}
                    </button>
                    <button onClick={() => setSelectMode(true)}
                      className="p-2 text-zinc-500 hover:text-orange-400 transition-colors rounded-lg"
                      title="Select messages">
                      <Check size={16} />
                    </button>
                    {!blockStatus && (
                      <button onClick={() => initiateCall(selected)}
                        className="p-2 text-zinc-500 hover:text-orange-400 transition-colors rounded-lg"
                        title="Start call">
                        <Phone size={18} />
                      </button>
                    )}
                    {blockStatus === 'blocked_them' ? (
                      <button onClick={unblockUser}
                        className="flex items-center gap-1.5 text-xs border border-zinc-700 hover:border-orange-500 text-zinc-400 hover:text-orange-400 px-3 py-1.5 rounded-lg transition-colors">
                        <Ban size={13} />Unblock
                      </button>
                    ) : blockStatus !== 'blocked_by_them' && (
                      <button onClick={blockUser}
                        className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors"
                        title="Block user">
                        <Ban size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Search bar */}
            {showMsgSearch && (
              <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 flex items-center gap-2 shrink-0">
                <Search size={13} className="text-zinc-500 shrink-0" />
                <input
                  autoFocus
                  value={msgSearch}
                  onChange={e => setMsgSearch(e.target.value)}
                  placeholder="Search messages…"
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder:text-zinc-600"
                />
                {msgSearch && (
                  <span className="text-zinc-600 text-xs shrink-0">
                    {messages.filter(m => m.content?.toLowerCase().includes(msgSearch.toLowerCase())).length} results
                  </span>
                )}
                <button onClick={() => { setShowMsgSearch(false); setMsgSearch(''); }}
                  className="text-zinc-600 hover:text-white shrink-0">
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="bg-red-950 border-b border-red-800 text-red-300 text-xs px-4 py-2 flex items-center justify-between">
                {error}
                <button onClick={() => setError('')}><X size={13} /></button>
              </div>
            )}

            {/* Uploading indicator */}
            {uploading && (
              <div className="bg-zinc-800 border-b border-zinc-700 text-zinc-400 text-xs px-4 py-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                Uploading…
              </div>
            )}

            {/* Block banners */}
            {blockStatus === 'blocked_by_them' && (
              <div className="bg-zinc-900 border-b border-zinc-800 text-zinc-500 text-xs px-4 py-3 text-center">
                You can't message this person.
              </div>
            )}
            {blockStatus === 'blocked_them' && (
              <div className="bg-zinc-900 border-b border-zinc-800 text-zinc-500 text-xs px-4 py-3 text-center">
                You've blocked this user. <button onClick={unblockUser} className="text-orange-400 hover:text-orange-300">Unblock</button> to message them.
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(() => {
                const displayMsgs = msgSearch
                  ? messages.filter(m => m.content?.toLowerCase().includes(msgSearch.toLowerCase()))
                  : messages;
                // Instagram-style: find the LAST message I sent that the other person has seen
                let lastSeenId = null;
                for (let i = displayMsgs.length - 1; i >= 0; i--) {
                  const m = displayMsgs[i];
                  if (m.sender_id === user.id && m.is_read) { lastSeenId = m.id; break; }
                }
                return displayMsgs.map((msg) => (
                  <div key={msg.id}>
                    <MsgBubble msg={msg} own={msg.sender_id === user.id}
                      onEdit={editMessage} onDelete={deleteMessage}
                      onReply={setReplyTo} onForward={openForward}
                      selectMode={selectMode}
                      isSelected={selectedMsgs.has(msg.id)}
                      onSelect={(id) => setSelectedMsgs(prev => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                      })}
                    />
                    {lastSeenId === msg.id && (
                      <div className="flex justify-end pr-2 -mt-0.5 mb-1">
                        <span className="text-zinc-500 text-[10px]">Seen</span>
                      </div>
                    )}
                  </div>
                ));
              })()}
              <div ref={bottomRef} />
            </div>

            {/* Input area — hidden when blocked */}
            {!blockStatus && (
              <div className="border-t border-zinc-800 bg-zinc-900">
                {/* Emoji picker */}
                {showEmoji && (
                  <div ref={emojiRef} className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 shadow-2xl rounded-xl overflow-hidden">
                    <EmojiPicker
                      onEmojiClick={(d) => insertEmoji(d.emoji)}
                      theme="dark"
                      height={380}
                      width={320}
                      skinTonesDisabled
                    />
                  </div>
                )}

                {/* Attachment menu */}
                {showAttach && (
                  <div ref={attachRef} className="absolute bottom-20 left-16 z-30 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
                    <button
                      onClick={() => { setShowAttach(false); imgInputRef.current?.click(); }}
                      className="flex items-center gap-2 px-4 py-3 hover:bg-zinc-700 text-white text-sm w-full transition-colors"
                    >
                      <ImageIcon size={16} className="text-orange-400" />Image
                    </button>
                    <button
                      onClick={() => { setShowAttach(false); vidInputRef.current?.click(); }}
                      className="flex items-center gap-2 px-4 py-3 hover:bg-zinc-700 text-white text-sm w-full transition-colors border-t border-zinc-700"
                    >
                      <Video size={16} className="text-orange-400" />Video
                    </button>
                  </div>
                )}

                {/* Reply preview bar */}
                {replyTo && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border-b border-zinc-700">
                    <div className="flex-1 border-l-2 border-orange-500 pl-2 min-w-0">
                      <p className="text-orange-400 text-xs font-semibold truncate">
                        Replying to {replyTo.sender_id === user.id ? 'yourself' : (selected?.display_name || selected?.username)}
                      </p>
                      <p className="text-zinc-400 text-xs truncate">
                        {replyTo.content || (replyTo.attachment_type === 'image' ? '📷 Image' : replyTo.attachment_type === 'video' ? '🎥 Video' : '🎵 Voice')}
                      </p>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-white shrink-0"><X size={15} /></button>
                  </div>
                )}

                {/* Recording bar */}
                {recording && (
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-red-950/30">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-red-400 text-sm font-mono">{fmtTime(recSeconds)}</span>
                    <span className="text-zinc-500 text-xs flex-1">Recording voice note…</span>
                    <button onClick={stopRecording}
                      className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <MicOff size={12} />Stop & Send
                    </button>
                  </div>
                )}

                <form onSubmit={sendText} className="flex items-center gap-2 p-3">
                  {/* Emoji */}
                  <button type="button" onClick={() => { setShowEmoji((v) => !v); setShowAttach(false); }}
                    className={`p-2 rounded-lg transition-colors ${showEmoji ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-500 hover:text-orange-400'}`}
                    title="Emoji"
                  >
                    <Smile size={18} />
                  </button>

                  {/* Attachment */}
                  <button type="button" onClick={() => { setShowAttach((v) => !v); setShowEmoji(false); }}
                    className={`p-2 rounded-lg transition-colors ${showAttach ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-500 hover:text-orange-400'}`}
                    disabled={uploading}
                    title="Send image or video"
                  >
                    <Paperclip size={18} />
                  </button>

                  {/* Voice note */}
                  <button type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={uploading}
                    className={`p-2 rounded-lg transition-colors ${recording ? 'text-red-400 bg-red-500/10 animate-pulse' : 'text-zinc-500 hover:text-orange-400'}`}
                    title={recording ? 'Stop recording' : 'Record voice note'}
                  >
                    {recording ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>

                  {/* Text input */}
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Send a message…"
                    disabled={uploading || recording}
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600 disabled:opacity-50"
                  />

                  {/* Send */}
                  <button type="submit" disabled={!text.trim() || sending || uploading}
                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
            <MessageSquare size={48} className="mb-3 opacity-30" />
            <p className="text-sm">Select a conversation or search for a player</p>
          </div>
        )}
      </main>

      {/* Forward modal */}
      {showForwardModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-white font-bold mb-1">Forward to…</h3>
            <p className="text-zinc-500 text-xs mb-3 truncate">
              {bulkForwardMsgs.length > 0
                ? `${bulkForwardMsgs.length} message${bulkForwardMsgs.length > 1 ? 's' : ''}`
                : `"${forwardMsg?.content || (forwardMsg?.attachment_type === 'image' ? '📷 Image' : '🎥 Video')}"`}
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {conversations.filter(c => c.id !== selected?.id).map(c => (
                <button key={c.id} onClick={() => handleForward(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs shrink-0">
                    {(c.display_name || c.username || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white text-sm">{c.display_name || c.username}</p>
                    <p className="text-zinc-500 text-xs">@{c.username}</p>
                  </div>
                </button>
              ))}
              {conversations.filter(c => c.id !== selected?.id).length === 0 && (
                <p className="text-zinc-600 text-sm text-center py-4">No other conversations</p>
              )}
            </div>
            <button onClick={() => { setShowForwardModal(false); setForwardMsg(null); setBulkForwardMsgs([]); }}
              className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2.5 rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
