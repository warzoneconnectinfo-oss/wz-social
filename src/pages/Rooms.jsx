import { useEffect, useRef, useState } from 'react';
import { Radio, Plus, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Rooms() {
  const { user, profile } = useAuth();

  const [rooms, setRooms]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [messages, setMessages]   = useState([]);
  const [isMember, setIsMember]   = useState(false);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [newRoom, setNewRoom]     = useState({ name: '', description: '' });
  const [creating, setCreating]   = useState(false);
  const [roomError, setRoomError] = useState('');

  const bottomRef = useRef(null);
  const chanRef   = useRef(null);

  useEffect(() => { if (user) loadRooms().finally(() => setLoading(false)); }, [user]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    chanRef.current?.unsubscribe();
    if (!selected) return;

    loadMessages(selected.id);
    checkMembership(selected.id);

    chanRef.current = supabase
      .channel(`room-${selected.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `room_id=eq.${selected.id}`,
      }, async ({ new: msg }) => {
        const { data: sender } = await supabase
          .from('profiles').select('username, display_name').eq('id', msg.sender_id).single();
        setMessages((prev) => [...prev, { ...msg, sender }]);
      })
      .subscribe();

    return () => chanRef.current?.unsubscribe();
  }, [selected]);

  async function loadRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, creator:profiles!creator_id(username, display_name)')
      .eq('is_public', true)
      .order('created_at', { ascending: false });
    if (error) setRoomError(error.message);
    setRooms(data || []);
  }

  async function checkMembership(roomId) {
    const { data } = await supabase
      .from('room_members').select('id').eq('room_id', roomId).eq('profile_id', user.id).maybeSingle();
    setIsMember(!!data);
  }

  async function loadMessages(roomId) {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles!sender_id(username, display_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100);
    setMessages(data || []);
  }

  async function joinRoom(roomId) {
    const { error } = await supabase
      .from('room_members').insert({ room_id: roomId, profile_id: user.id });
    if (error) { setRoomError(error.message); return; }
    setIsMember(true);
  }

  async function leaveRoom(roomId) {
    const { error } = await supabase
      .from('room_members').delete().eq('room_id', roomId).eq('profile_id', user.id);
    if (error) { setRoomError(error.message); return; }
    setIsMember(false);
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !selected || !isMember) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      sender_id: user.id, room_id: selected.id, content: text.trim(),
    });
    if (error) setRoomError(error.message);
    setText('');
    setSending(false);
  }

  async function createRoom(e) {
    e.preventDefault();
    if (!newRoom.name.trim()) return;
    setCreating(true);
    setRoomError('');
    const { data, error } = await supabase.from('rooms').insert({
      name: newRoom.name.trim(),
      description: newRoom.description.trim() || null,
      creator_id: user.id, is_public: true,
    }).select().single();

    if (error) { setRoomError(error.message); setCreating(false); return; }

    await supabase.from('room_members').insert({ room_id: data.id, profile_id: user.id });
    setNewRoom({ name: '', description: '' });
    setShowForm(false);
    await loadRooms();
    setSelected(data);
    setCreating(false);
  }

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="bg-zinc-950 flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>

      {roomError && (
        <div className="bg-red-950 border-b border-red-800 text-red-300 text-xs px-4 py-2 flex justify-between items-center">
          {roomError}
          <button onClick={() => setRoomError('')} className="ml-4 text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">

      {/* ── Left panel ── */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <p className="text-white font-semibold text-sm">Chat Rooms</p>
          <button onClick={() => setShowForm(!showForm)}
            className="text-orange-400 hover:text-orange-300 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>

        {showForm && (
          <form onSubmit={createRoom} className="p-3 border-b border-zinc-800 space-y-2">
            <input
              value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
              placeholder="Room name" required
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
            />
            <input
              value={newRoom.description} onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
              placeholder="Description (optional)"
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
            />
            <button type="submit" disabled={creating}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg transition-colors"
            >
              {creating ? 'Creating…' : 'Create Room'}
            </button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto">
          {rooms.length === 0 ? (
            <p className="text-zinc-600 text-xs text-center p-6">No rooms yet — create one!</p>
          ) : (
            rooms.map((room) => (
              <button key={room.id} onClick={() => setSelected(room)}
                className={`w-full text-left px-3 py-3 border-b border-zinc-800 transition-colors ${
                  selected?.id === room.id ? 'bg-orange-500/10' : 'hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Radio size={14} className="text-orange-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium truncate">#{room.name}</p>
                    {room.description && (
                      <p className="text-zinc-500 text-xs truncate">{room.description}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Right panel ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-sm">#{selected.name}</p>
                {selected.description && <p className="text-zinc-500 text-xs">{selected.description}</p>}
              </div>
              <button
                onClick={() => isMember ? leaveRoom(selected.id) : joinRoom(selected.id)}
                className={`text-xs font-medium px-4 py-1.5 rounded-lg transition-colors ${
                  isMember
                    ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                {isMember ? 'Leave' : 'Join'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!isMember && (
                <div className="text-center text-zinc-500 text-xs bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  Join this room to participate in the conversation.
                </div>
              )}
              {messages.map((msg) => {
                const own  = msg.sender_id === user.id;
                const name = msg.sender?.display_name || msg.sender?.username || '?';
                return (
                  <div key={msg.id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold shrink-0">
                      {name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xs font-semibold ${own ? 'text-orange-400' : 'text-zinc-300'}`}>
                          {name}
                        </span>
                        <span className="text-zinc-600 text-xs">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-zinc-400 text-sm">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {isMember && (
              <form onSubmit={sendMessage} className="p-3 border-t border-zinc-800">
                <div className="flex gap-2">
                  <input
                    value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={`Message #${selected.name}…`}
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                  />
                  <button type="submit" disabled={!text.trim() || sending}
                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white p-2.5 rounded-xl transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
            <Radio size={48} className="mb-3 opacity-30" />
            <p className="text-sm">Select a room or create one to get started</p>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
