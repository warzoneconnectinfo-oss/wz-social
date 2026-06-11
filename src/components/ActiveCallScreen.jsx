import { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, UserPlus, X, Check } from 'lucide-react';
import { useCall } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// A single remote participant's video tile
function RemoteTile({ stream, participant, large }) {
  const videoRef = useRef(null);
  const hasVideo = !!stream?.getVideoTracks().find(t => t.readyState === 'live' && t.enabled);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const name = participant?.display_name || participant?.username || '?';
  const initial = name[0].toUpperCase();

  return (
    <div className={`relative flex items-center justify-center bg-zinc-800 overflow-hidden rounded-xl ${large ? 'flex-1' : ''}`}>
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-2xl font-bold">
            {initial}
          </div>
          <p className="text-white text-sm font-medium">{name}</p>
        </div>
      )}
      {hasVideo && (
        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
          {name}
        </div>
      )}
    </div>
  );
}

export default function ActiveCallScreen() {
  const {
    activeCall, callStatus, callDuration, callError,
    isMuted, isCameraOn, localStream, remoteStream,
    remoteStreams, groupParticipants,
    hangUp, toggleMute, toggleCamera, inviteToCall,
  } = useCall();

  const { user } = useAuth();

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);

  const [showInvite,    setShowInvite]    = useState(false);
  const [friends,       setFriends]       = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selected,      setSelected]      = useState(new Set());
  const [inviting,      setInviting]      = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, isCameraOn]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  async function openInvite() {
    setShowInvite(true);
    setSelected(new Set());
    setLoadingFriends(true);
    const { data } = await supabase
      .from('friendships')
      .select('*, friend:profiles!friendships_requester_id_fkey(id, username, display_name), friend2:profiles!friendships_addressee_id_fkey(id, username, display_name)')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted');

    const alreadyIn = new Set([
      activeCall?.peer?.id,
      ...groupParticipants.map(p => p.id),
    ]);

    const list = (data || [])
      .map(f => f.requester_id === user.id ? f.friend2 : f.friend)
      .filter(f => f && !alreadyIn.has(f.id));

    setFriends(list);
    setLoadingFriends(false);
  }

  async function sendInvites() {
    if (selected.size === 0) return;
    setInviting(true);
    const toInvite = friends.filter(f => selected.has(f.id));
    await inviteToCall(toInvite);
    setInviting(false);
    setShowInvite(false);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // End-screen when call is cleared but status hasn't reset yet
  if (!activeCall && ['ended', 'declined', 'missed'].includes(callStatus)) {
    const label = callStatus === 'declined' ? 'Call Declined'
                : callStatus === 'missed'   ? 'No Answer'
                :                             'Call Ended';
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
        <p className="text-white text-2xl font-bold">{label}</p>
      </div>
    );
  }

  if (!activeCall) return null;

  const peer = activeCall.peer;
  const name = peer?.display_name || peer?.username || 'Unknown';

  const statusText = {
    ringing:    activeCall.role === 'caller' ? `Calling ${name}…` : 'Connecting…',
    connecting: 'Connecting…',
    active:     fmtDuration(callDuration),
    ended:      'Call Ended',
    declined:   'Call Declined',
    missed:     'No Answer',
  }[callStatus] ?? 'Calling…';

  // Determine how many remote streams we have
  const streamEntries = Object.entries(remoteStreams); // [[peerId, stream], ...]
  const isGroupCall   = groupParticipants.length > 0 || streamEntries.length > 1;

  // Max 3 can be invited (total 4 including self)
  const canInvite = callStatus === 'active' && groupParticipants.length < 3;

  const remoteHasVideo = !!remoteStream?.getVideoTracks().find(t => t.readyState === 'live');

  // Helper: find participant info for a peerId
  function participantFor(peerId) {
    if (peer?.id === peerId) return peer;
    return groupParticipants.find(p => p.id === peerId) || { id: peerId, username: peerId.slice(0, 8) };
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col select-none">

      {/* ── Main video area ────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {isGroupCall ? (
          /* Group call: grid of tiles */
          <div className={`h-full p-2 gap-2 ${
            streamEntries.length === 1 ? 'flex' :
            streamEntries.length === 2 ? 'grid grid-cols-2' :
            'grid grid-cols-2'
          }`}>
            {streamEntries.length === 0 ? (
              /* Only self, waiting for others */
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-4xl font-bold mb-4">
                  {name[0].toUpperCase()}
                </div>
                <p className="text-white text-xl font-bold">{name}</p>
                <p className="text-zinc-400 text-sm mt-1">{statusText}</p>
                {groupParticipants.length > 0 && (
                  <p className="text-zinc-500 text-xs mt-2">
                    {groupParticipants.length} invited — waiting for them to join…
                  </p>
                )}
              </div>
            ) : (
              streamEntries.map(([peerId, stream]) => (
                <RemoteTile
                  key={peerId}
                  stream={stream}
                  participant={participantFor(peerId)}
                  large={streamEntries.length === 1}
                />
              ))
            )}
          </div>
        ) : (
          /* 1-on-1 call layout */
          <>
            {remoteHasVideo && (
              <video
                ref={remoteVideoRef}
                autoPlay playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {!remoteHasVideo && (
              <div className="h-full flex flex-col items-center justify-center gap-5 bg-zinc-900">
                <div className="relative">
                  {(callStatus === 'ringing' || callStatus === 'connecting') && (
                    <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping scale-150" />
                  )}
                  <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-5xl font-bold shadow-2xl">
                    {name[0].toUpperCase()}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-white text-2xl font-bold">{name}</p>
                  <p className={`text-lg mt-1 tabular-nums ${callStatus === 'active' ? 'text-green-400' : 'text-zinc-400'}`}>
                    {statusText}
                  </p>
                </div>
              </div>
            )}
            {remoteHasVideo && (
              <div className="absolute top-6 inset-x-0 text-center z-10 pointer-events-none">
                <p className="text-white text-xl font-bold drop-shadow-lg">{name}</p>
                <p className={`text-sm mt-0.5 tabular-nums drop-shadow-lg ${callStatus === 'active' ? 'text-green-400' : 'text-zinc-300'}`}>
                  {statusText}
                </p>
              </div>
            )}
          </>
        )}

        {/* Local video PiP */}
        {isCameraOn && (
          <div className="absolute bottom-4 right-4 w-28 h-20 rounded-xl overflow-hidden border-2 border-zinc-600 shadow-2xl z-10">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        )}

        {/* Status bar for group call */}
        {isGroupCall && callStatus === 'active' && (
          <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none z-10">
            <span className="bg-black/60 text-green-400 text-xs font-mono px-3 py-1 rounded-full">
              {fmtDuration(callDuration)} · {groupParticipants.length + 1} in call
            </span>
          </div>
        )}

        {callError && (
          <div className="absolute top-4 inset-x-4 bg-red-950/90 border border-red-700 text-red-300 text-xs rounded-xl px-4 py-2 text-center z-20">
            {callError}
          </div>
        )}
      </div>

      {/* ── Control bar ───────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-center gap-6">

          {/* Mute */}
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleMute}
              className={`w-13 h-13 w-[52px] h-[52px] rounded-full flex items-center justify-center transition-colors ${
                isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}>
              {isMuted ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />}
            </button>
            <span className="text-zinc-500 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
          </div>

          {/* Invite Players */}
          {canInvite && (
            <div className="flex flex-col items-center gap-1.5">
              <button onClick={openInvite}
                className="w-[52px] h-[52px] rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center transition-colors">
                <UserPlus size={20} className="text-white" />
              </button>
              <span className="text-zinc-500 text-xs">Invite</span>
            </div>
          )}

          {/* End call */}
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={hangUp}
              className="w-[60px] h-[60px] rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg">
              <PhoneOff size={24} className="text-white" />
            </button>
            <span className="text-zinc-500 text-xs">End</span>
          </div>

          {/* Camera */}
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleCamera}
              className={`w-[52px] h-[52px] rounded-full flex items-center justify-center transition-colors ${
                isCameraOn ? 'bg-zinc-600 hover:bg-zinc-500' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}>
              {isCameraOn
                ? <Video size={20} className="text-white" />
                : <VideoOff size={20} className="text-zinc-400" />}
            </button>
            <span className="text-zinc-500 text-xs">{isCameraOn ? 'Cam On' : 'Camera'}</span>
          </div>

        </div>
      </div>

      {/* ── Invite modal ──────────────────────────────────────────────── */}
      {showInvite && (
        <div className="absolute inset-0 z-60 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col shadow-2xl">

            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-white font-semibold">Invite Players</h3>
              <button onClick={() => setShowInvite(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {loadingFriends ? (
                <p className="text-zinc-500 text-sm text-center py-8">Loading friends…</p>
              ) : friends.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">No friends available to invite</p>
              ) : (
                friends.map(friend => {
                  const isSelected = selected.has(friend.id);
                  const maxReached = selected.size >= (3 - groupParticipants.length);
                  return (
                    <button
                      key={friend.id}
                      onClick={() => toggleSelect(friend.id)}
                      disabled={!isSelected && maxReached}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-orange-500/20 border border-orange-500/40'
                          : maxReached
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-zinc-800'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {(friend.display_name || friend.username || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-white text-sm font-medium leading-none">
                          {friend.display_name || friend.username}
                        </p>
                        {friend.display_name && (
                          <p className="text-zinc-500 text-xs mt-0.5">@{friend.username}</p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 border-t border-zinc-800">
              <p className="text-zinc-500 text-xs text-center mb-3">
                {groupParticipants.length > 0
                  ? `${3 - groupParticipants.length} more player${3 - groupParticipants.length !== 1 ? 's' : ''} can join`
                  : 'Up to 3 players can be invited'}
              </p>
              <button
                onClick={sendInvites}
                disabled={selected.size === 0 || inviting}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                {inviting ? 'Inviting…' : `Invite ${selected.size > 0 ? `(${selected.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
