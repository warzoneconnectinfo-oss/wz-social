import { useEffect, useRef, useState } from 'react';
import { Send, Hash } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import LoadingSpinner from '../components/LoadingSpinner';

const FIXED_ROOMS = [
  { name: 'Battle Royale Casual',    description: 'Find casual BR teammates',              category: 'Battle Royale' },
  { name: 'Battle Royale Regular',   description: 'Find regular BR teammates',             category: 'Battle Royale' },
  { name: 'Resurgence Casuals',      description: 'Find casual Resurgence teammates',      category: 'Resurgence'    },
  { name: 'Resurgence Regular',      description: 'Find regular Resurgence teammates',     category: 'Resurgence'    },
  { name: 'Private Lobbies & LTMs',  description: 'Private lobbies & limited time modes',  category: 'Special'       },
  { name: 'Ranked Resurgence',       description: 'Find Ranked Resurgence teammates',      category: 'Ranked'        },
  { name: 'Ranked Multiplayer',      description: 'Find Ranked Multiplayer teammates',     category: 'Ranked'        },
  { name: 'Regular Map Multiplayer', description: 'Find Multiplayer teammates',            category: 'Multiplayer'   },
];

const CATEGORIES = ['Battle Royale', 'Resurgence', 'Special', 'Ranked', 'Multiplayer'];

export default function Rooms() {
  const { user } = useAuth();

  const [rooms, setRooms]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [messages, setMessages]   = useState([]);
  const [isMember, setIsMember]   = useState(false);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
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
        setMessages(prev => [...prev, { ...msg, sender }]);
      })
      .subscribe();

    return () => chanRef.current?.unsubscribe();
  }, [selected]);

  async function loadRooms() {
    const names = FIXED_ROOMS.map(r => r.name);

    const { data: existing } = await supabase
      .from('rooms').select('id, name, description, created_at')
      .in('name', names);

    const existingNames = new Set((existing || []).map(r => r.name));
    const missing = FIXED_ROOMS.filter(r => !existingNames.has(r.name));

    let all = existing || [];

    if (missing.length > 0) {
      const { data: created } = await supabase.from('rooms').insert(
        missing.map(r => ({ name: r.name, description: r.description, creator_id: user.id, is_public: true }))
      ).select('id, name, description, created_at');
      all = [...all, ...(created || [])];
    }

    const ordered = FIXED_ROOMS.map(fr => all.find(r => r.name === fr.name)).filter(Boolean);
    setRooms(ordered);
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
    const { error } = await supabase.from('room_members').insert({ room_id: roomId, profile_id: user.id });
    if (error) { setRoomError(error.message); return; }
    setIsMember(true);
  }

  async function leaveRoom(roomId) {
    const { error } = await supabase.from('room_members').delete().eq('room_id', roomId).eq('profile_id', user.id);
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

  if (loading) return <LoadingSpinner fullScreen />;

  const catRoomsMap = Object.fromEntries(
    CATEGORIES.map(cat => [
      cat,
      rooms.filter(r => FIXED_ROOMS.find(fr => fr.name === r.name)?.category === cat),
    ])
  );

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
        <aside className="w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-zinc-800">
            <p className="text-white font-semibold text-sm">Find Teammates</p>
            <p className="text-zinc-500 text-xs mt-0.5">Join a room &amp; chat</p>
          </div>

          <div className="flex-1 overflow-y-auto pb-4">
            {CATEGORIES.map(cat => {
              const catRooms = catRoomsMap[cat];
              if (!catRooms?.length) return null;
              return (
                <div key={cat}>
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 pt-4 pb-1">
                    {cat}
                  </p>
                  {catRooms.map(room => (
                    <button key={room.id} onClick={() => setSelected(room)}
                      className={`w-full text-left px-3 py-2 transition-colors ${
                        selected?.id === room.id
                          ? 'bg-orange-500/10 text-orange-400'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Hash size={13} className="shrink-0" />
                        <span className="text-xs font-medium truncate">{room.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Right panel ── */}
        <main className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Hash size={15} className="text-zinc-400" />
                    <p className="text-white font-semibold text-sm">{selected.name}</p>
                  </div>
                  {selected.description && (
                    <p className="text-zinc-500 text-xs mt-0.5">{selected.description}</p>
                  )}
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
                    Join this room to find teammates and start chatting.
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
              <Hash size={48} className="mb-3 opacity-30" />
              <p className="text-sm font-medium text-zinc-500">Pick a room to find teammates</p>
              <p className="text-xs text-zinc-600 mt-1">Join a channel and start chatting</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
