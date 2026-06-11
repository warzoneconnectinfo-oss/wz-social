import { useEffect, useRef } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useCall } from '../context/CallContext';

export default function IncomingCallModal() {
  const { incomingCall, acceptCall, declineCall } = useCall();
  const audioCtxRef = useRef(null);
  const ringInterval = useRef(null);

  useEffect(() => {
    if (!incomingCall) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();

      function beep() {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 520;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      }

      beep();
      ringInterval.current = setInterval(beep, 1400);
    } catch {}

    return () => {
      clearInterval(ringInterval.current);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [incomingCall]);

  if (!incomingCall) return null;

  const { caller, isGroupInvite } = incomingCall;
  const name = caller?.display_name || caller?.username || 'Unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 w-80 text-center shadow-2xl">

        {/* Pulsing avatar */}
        <div className="relative mx-auto w-24 h-24 mb-5">
          <div className={`absolute inset-0 rounded-full animate-ping ${isGroupInvite ? 'bg-orange-500/25' : 'bg-green-500/25'}`} />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
            {name[0].toUpperCase()}
          </div>
        </div>

        <p className="text-white text-xl font-bold mb-1">{name}</p>
        <p className="text-zinc-400 text-sm mb-8">
          {isGroupInvite ? 'Inviting you to a group call…' : 'Incoming call…'}
        </p>

        <div className="flex justify-center gap-12">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={declineCall}
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors shadow-lg"
            >
              <PhoneOff size={24} />
            </button>
            <span className="text-zinc-400 text-xs">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center text-white transition-colors shadow-lg"
            >
              <Phone size={24} />
            </button>
            <span className="text-zinc-400 text-xs">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
