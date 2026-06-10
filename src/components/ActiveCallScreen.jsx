import { useEffect, useRef } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useCall } from '../context/CallContext';

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function ActiveCallScreen() {
  const {
    activeCall, callStatus, callDuration, callError,
    isMuted, isCameraOn, localStream, remoteStream,
    hangUp, toggleMute, toggleCamera,
  } = useCall();

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, isCameraOn]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Brief end screen when activeCall is already cleared but status isn't idle yet
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

  const remoteHasVideo = !!remoteStream?.getVideoTracks().find(t => t.readyState === 'live');

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col select-none">

      {/* Remote area */}
      <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-hidden">

        {/* Remote video */}
        {remoteHasVideo && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Avatar + status when no remote video */}
        {!remoteHasVideo && (
          <div className="flex flex-col items-center gap-5 z-10">
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

        {/* Overlay info when remote video is on */}
        {remoteHasVideo && (
          <div className="absolute top-6 inset-x-0 text-center z-10 pointer-events-none">
            <p className="text-white text-xl font-bold drop-shadow-lg">{name}</p>
            <p className={`text-sm mt-0.5 tabular-nums drop-shadow-lg ${callStatus === 'active' ? 'text-green-400' : 'text-zinc-300'}`}>
              {statusText}
            </p>
          </div>
        )}

        {/* Local video PiP */}
        {isCameraOn && (
          <div className="absolute bottom-4 right-4 w-32 h-24 rounded-2xl overflow-hidden border-2 border-zinc-600 shadow-2xl z-10">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Error banner */}
        {callError && (
          <div className="absolute top-4 inset-x-4 bg-red-950/90 border border-red-700 text-red-300 text-xs rounded-xl px-4 py-2 text-center z-20">
            {callError}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-center gap-8">

          {/* Mute */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
            </button>
            <span className="text-zinc-500 text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
          </div>

          {/* End call */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={hangUp}
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg"
            >
              <PhoneOff size={26} className="text-white" />
            </button>
            <span className="text-zinc-500 text-xs">End Call</span>
          </div>

          {/* Camera */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={toggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isCameraOn ? 'bg-zinc-600 hover:bg-zinc-500' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              {isCameraOn
                ? <Video size={22} className="text-white" />
                : <VideoOff size={22} className="text-zinc-400" />
              }
            </button>
            <span className="text-zinc-500 text-xs">{isCameraOn ? 'Camera On' : 'Camera'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
