import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const CallCtx = createContext({});

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export function CallProvider({ children }) {
  const { user } = useAuth();

  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall,   setActiveCall]   = useState(null);
  const [callStatus,   setCallStatus]   = useState('idle');
  const [isMuted,      setIsMuted]      = useState(false);
  const [isCameraOn,   setIsCameraOn]   = useState(false);
  const [localStream,  setLocalStream]  = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callError,    setCallError]    = useState('');
  const [callDuration, setCallDuration] = useState(0);

  const pcRef           = useRef(null);
  const localStreamRef  = useRef(null);
  const sigSubRef       = useRef(null);
  const callSubRef      = useRef(null);
  const processedSigs   = useRef(new Set());
  const processedCalls  = useRef(new Set());
  const durationTimer   = useRef(null);
  const ringTimer       = useRef(null);
  const pollTimer       = useRef(null);
  const incomingPollRef = useRef(null);
  const activeCallRef   = useRef(null);
  const callStatusRef   = useRef('idle');
  const userIdRef       = useRef(null);
  const incomingCallRef = useRef(null);
  const isHangingUp     = useRef(false);

  useEffect(() => { activeCallRef.current   = activeCall;       }, [activeCall]);
  useEffect(() => { callStatusRef.current   = callStatus;       }, [callStatus]);
  useEffect(() => { userIdRef.current       = user?.id ?? null; }, [user]);
  useEffect(() => { incomingCallRef.current = incomingCall;     }, [incomingCall]);

  useEffect(() => {
    if (callStatus === 'active') {
      setCallDuration(0);
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      clearInterval(durationTimer.current);
    }
    return () => clearInterval(durationTimer.current);
  }, [callStatus]);

  // ── Realtime: listen for incoming calls ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    callSubRef.current?.unsubscribe();
    callSubRef.current = supabase
      .channel(`incoming-calls-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'calls',
        filter: `callee_id=eq.${user.id}`,
      }, ({ new: call }) => {
        if (!call) return;
        if (callStatusRef.current !== 'idle' || activeCallRef.current) return;
        if (processedCalls.current.has(call.id)) return;
        if (incomingCallRef.current?.callId === call.id) return;
        showIncoming(call);
      })
      .subscribe();
    return () => callSubRef.current?.unsubscribe();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling fallback for incoming calls (every 4 s) ───────────────────────
  useEffect(() => {
    if (!user) return;
    clearInterval(incomingPollRef.current);
    incomingPollRef.current = setInterval(async () => {
      if (callStatusRef.current !== 'idle' || incomingCallRef.current) return;
      const cutoff = new Date(Date.now() - 35_000).toISOString();
      const { data } = await supabase
        .from('calls').select('*')
        .eq('callee_id', user.id).eq('status', 'ringing')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(1);
      const call = data?.[0];
      if (!call) return;
      if (processedCalls.current.has(call.id)) return;
      if (incomingCallRef.current?.callId === call.id) return;
      showIncoming(call);
    }, 4000);
    return () => clearInterval(incomingPollRef.current);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function showIncoming(call) {
    if (processedCalls.current.has(call.id)) return;
    const { data: caller } = await supabase
      .from('profiles').select('id, username, display_name')
      .eq('id', call.caller_id).single();
    if (!caller) return;
    if (callStatusRef.current !== 'idle' || activeCallRef.current) return;
    if (processedCalls.current.has(call.id)) return;
    setIncomingCall({ callId: call.id, caller });
    setCallStatus('ringing');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function getUserMedia() {
    try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); }
    catch { return await navigator.mediaDevices.getUserMedia({ audio: true }); }
  }

  // Build a PeerConnection. onIceInsert is called for each candidate so the
  // caller can buffer candidates until the FK parent (calls row) exists.
  function buildPC(callId, onIceInsert) {
    pcRef.current?.close();
    // No iceCandidatePoolSize — pre-gathering fires onicecandidate before the
    // calls DB row exists, causing every insert to fail the FK constraint silently.
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !userIdRef.current) return;
      onIceInsert(candidate.toJSON());
    };

    pc.ontrack = ({ streams }) => {
      if (streams?.[0]) setRemoteStream(streams[0]);
    };

    let notifiedFailed = false;
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallStatus('active');
      else if (pc.connectionState === 'failed' && !notifiedFailed) {
        notifiedFailed = true; hangUp();
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')
        setCallStatus('active');
      else if (pc.iceConnectionState === 'failed' && !notifiedFailed) {
        notifiedFailed = true; hangUp();
      }
    };

    return pc;
  }

  // ── Signal polling — 1 s interval ────────────────────────────────────────
  function startPolling(callId) {
    clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      const uid = userIdRef.current;
      if (!pcRef.current || !uid) { clearInterval(pollTimer.current); return; }
      const { data: sigs } = await supabase
        .from('call_signals').select('*')
        .eq('call_id', callId).neq('from_id', uid)
        .order('created_at', { ascending: true });
      for (const sig of (sigs || [])) {
        if (processedSigs.current.has(sig.id)) continue;
        processedSigs.current.add(sig.id);
        await applySig(sig);
        if (!pcRef.current) break;
      }
    }, 1000);
  }

  async function applySig(sig) {
    const pc = pcRef.current;
    if (sig.type === 'answer' && pc) {
      clearTimeout(ringTimer.current);
      try { await pc.setRemoteDescription(new RTCSessionDescription(sig.data.sdp)); }
      catch (e) { console.warn('setRemoteDescription(answer):', e); }
    }
    if (sig.type === 'ice-candidate' && pc) {
      try { await pc.addIceCandidate(new RTCIceCandidate(sig.data.candidate)); } catch {}
    }
    if (sig.type === 'hangup' || sig.type === 'declined') {
      setIncomingCall(null);
      doCleanup();
      setActiveCall(null);
      setRemoteStream(null);
      setCallStatus(sig.type === 'declined' ? 'declined' : 'ended');
      setTimeout(() => setCallStatus('idle'), 3000);
    }
  }

  function subscribeSignals(callId) {
    sigSubRef.current?.unsubscribe();
    sigSubRef.current = supabase
      .channel(`call-sig-rt-${callId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'call_signals',
        filter: `call_id=eq.${callId}`,
      }, async ({ new: sig }) => {
        const uid = userIdRef.current;
        if (!uid || sig.from_id === uid) return;
        if (processedSigs.current.has(sig.id)) return;
        processedSigs.current.add(sig.id);
        await applySig(sig);
      })
      .subscribe();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async function initiateCall(callee) {
    if (callStatusRef.current !== 'idle') return;
    if (callee.id === userIdRef.current) return;
    setCallError('');
    setCallStatus('connecting');

    // ICE candidate buffer — holds candidates that fire before the calls DB row
    // exists. The FK constraint (call_signals.call_id → calls.id) means any
    // insert before the calls row fails silently. We flush the buffer right after.
    const iceBuffer = [];
    let dbReady = false;

    try {
      const stream = await getUserMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getVideoTracks().forEach(t => { t.enabled = false; });
      setIsCameraOn(false);
      setIsMuted(false);

      const callId = crypto.randomUUID();

      // Build PC with a buffering ICE handler
      const pc = buildPC(callId, (candidateJson) => {
        if (dbReady) {
          // calls row already exists — safe to insert directly
          supabase.from('call_signals').insert({
            call_id: callId, from_id: userIdRef.current,
            type: 'ice-candidate', data: { candidate: candidateJson },
          });
        } else {
          // Buffer until the calls row is created
          iceBuffer.push(candidateJson);
        }
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // ── DB writes (order matters due to FK) ──────────────────────────────
      // 1. calls row first (FK parent)
      const { error: callErr } = await supabase.from('calls').insert({
        id: callId, caller_id: user.id, callee_id: callee.id, status: 'ringing',
      });
      if (callErr) throw callErr;

      // 2. offer signal (FK child, calls row now exists)
      await supabase.from('call_signals').insert({
        call_id: callId, from_id: user.id, type: 'offer',
        data: { sdp: { type: offer.type, sdp: offer.sdp } },
      });

      // 3. Flush buffered ICE candidates (all gathered before calls row existed)
      dbReady = true;
      for (const c of iceBuffer) {
        await supabase.from('call_signals').insert({
          call_id: callId, from_id: user.id,
          type: 'ice-candidate', data: { candidate: c },
        });
      }

      setActiveCall({ callId, peer: callee, role: 'caller' });
      setCallStatus('ringing');

      subscribeSignals(callId);
      startPolling(callId);

      ringTimer.current = setTimeout(async () => {
        if (!pcRef.current) return;
        await supabase.from('calls').update({ status: 'missed' }).eq('id', callId);
        await supabase.from('call_signals').insert({ call_id: callId, from_id: user.id, type: 'hangup', data: {} });
        doCleanup();
        setActiveCall(null);
        setCallStatus('missed');
        setTimeout(() => setCallStatus('idle'), 3000);
      }, 30000);

    } catch (err) {
      setCallError(err.message || 'Failed to start call');
      doCleanup();
      setCallStatus('idle');
    }
  }

  async function acceptCall() {
    if (!incomingCall) return;
    const { callId, caller } = incomingCall;
    processedCalls.current.add(callId);
    setCallError('');
    setCallStatus('connecting');
    setIncomingCall(null);

    try {
      const stream = await getUserMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getVideoTracks().forEach(t => { t.enabled = false; });
      setIsCameraOn(false);
      setIsMuted(false);

      setActiveCall({ callId, peer: caller, role: 'callee' });

      // Callee ICE candidates reference a callId that already exists in DB — safe.
      const pc = buildPC(callId, (candidateJson) => {
        supabase.from('call_signals').insert({
          call_id: callId, from_id: userIdRef.current,
          type: 'ice-candidate', data: { candidate: candidateJson },
        });
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // ── Negotiate BEFORE starting poll so no signal is processed against ──
      // ── an incomplete PC state (e.g. ICE candidates before remote SDP). ──

      // Fetch offer — caller always inserts it right after the calls row
      let offerSig = null;
      for (let i = 0; i < 8 && !offerSig; i++) {
        const { data } = await supabase
          .from('call_signals').select('*')
          .eq('call_id', callId).eq('type', 'offer').maybeSingle();
        offerSig = data;
        if (!offerSig) await new Promise(r => setTimeout(r, 1000));
      }
      if (!offerSig) throw new Error('No offer received — caller may have cancelled');

      processedSigs.current.add(offerSig.id);
      await pc.setRemoteDescription(new RTCSessionDescription(offerSig.data.sdp));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Apply ALL existing ICE candidates from caller now that both SDPs are set
      const { data: callerIce } = await supabase
        .from('call_signals').select('*')
        .eq('call_id', callId).eq('type', 'ice-candidate').neq('from_id', user.id);

      for (const s of (callerIce || [])) {
        processedSigs.current.add(s.id);
        try { await pc.addIceCandidate(new RTCIceCandidate(s.data.candidate)); } catch {}
      }

      // Send answer
      await supabase.from('call_signals').insert({
        call_id: callId, from_id: user.id, type: 'answer',
        data: { sdp: { type: answer.type, sdp: answer.sdp } },
      });

      await supabase.from('calls').update({ status: 'active' }).eq('id', callId);

      // NOW start poll/subscribe — negotiation is complete, ICE can be applied safely
      subscribeSignals(callId);
      startPolling(callId);

    } catch (err) {
      await supabase.from('call_signals')
        .insert({ call_id: callId, from_id: user.id, type: 'hangup', data: {} })
        .catch(() => {});
      setCallError(err.message || 'Could not connect');
      doCleanup();
      setCallStatus('idle');
      setActiveCall(null);
    }
  }

  async function declineCall() {
    if (!incomingCall) return;
    const { callId } = incomingCall;
    processedCalls.current.add(callId);
    setIncomingCall(null);
    setCallStatus('idle');
    await Promise.all([
      supabase.from('call_signals').insert({ call_id: callId, from_id: user.id, type: 'declined', data: {} }),
      supabase.from('calls').update({ status: 'declined' }).eq('id', callId),
    ]);
  }

  async function hangUp() {
    if (isHangingUp.current) return;
    isHangingUp.current = true;
    const callId = activeCallRef.current?.callId;
    clearTimeout(ringTimer.current);
    if (callId) {
      await Promise.all([
        supabase.from('call_signals').insert({ call_id: callId, from_id: user.id, type: 'hangup', data: {} }),
        supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', callId),
      ]).catch(console.error);
    }
    doCleanup();
    setActiveCall(null);
    setRemoteStream(null);
    setCallStatus('ended');
    setTimeout(() => { setCallStatus('idle'); isHangingUp.current = false; }, 2000);
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(p => !p);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (!tracks.length) { setCallError('No camera found on this device'); return; }
    tracks.forEach(t => { t.enabled = !t.enabled; });
    setIsCameraOn(p => !p);
  }

  function doCleanup() {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    pcRef.current?.close();
    pcRef.current = null;
    sigSubRef.current?.unsubscribe();
    sigSubRef.current = null;
    processedSigs.current = new Set();
    clearInterval(durationTimer.current);
    clearInterval(pollTimer.current);
    clearTimeout(ringTimer.current);
    setIsMuted(false);
    setIsCameraOn(false);
    setCallError('');
  }

  return (
    <CallCtx.Provider value={{
      incomingCall, activeCall, callStatus, callError, callDuration,
      isMuted, isCameraOn, localStream, remoteStream,
      initiateCall, acceptCall, declineCall, hangUp, toggleMute, toggleCamera,
    }}>
      {children}
    </CallCtx.Provider>
  );
}

export const useCall = () => useContext(CallCtx);
