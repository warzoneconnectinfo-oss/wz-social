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

  // ── 1-on-1 call state ─────────────────────────────────────────────────────
  const [incomingCall,  setIncomingCall]  = useState(null);
  const [activeCall,    setActiveCall]    = useState(null);
  const [callStatus,    setCallStatus]    = useState('idle');
  const [isMuted,       setIsMuted]       = useState(false);
  const [isCameraOn,    setIsCameraOn]    = useState(false);
  const [localStream,   setLocalStream]   = useState(null);
  const [remoteStream,  setRemoteStream]  = useState(null);
  const [callError,     setCallError]     = useState('');
  const [callDuration,  setCallDuration]  = useState(0);

  // ── Group call state ───────────────────────────────────────────────────────
  const [remoteStreams,      setRemoteStreams]      = useState({}); // peerId → MediaStream
  const [groupParticipants,  setGroupParticipants]  = useState([]); // [{id,username,display_name}]

  // ── Refs: 1-on-1 ──────────────────────────────────────────────────────────
  const pcRef              = useRef(null);
  const localStreamRef     = useRef(null);
  const sigSubRef          = useRef(null);
  const callSubRef         = useRef(null);
  const processedSigs      = useRef(new Set());
  const processedCalls     = useRef(new Set());
  const durationTimer      = useRef(null);
  const ringTimer          = useRef(null);
  const pollTimer          = useRef(null);
  const incomingPollRef    = useRef(null);
  const activeCallRef      = useRef(null);
  const callStatusRef      = useRef('idle');
  const userIdRef          = useRef(null);
  const incomingCallRef    = useRef(null);
  const isHangingUp        = useRef(false);
  const iceCandidateBuffer = useRef([]);
  const remoteStreamRef    = useRef(null);

  // ── Refs: group call ──────────────────────────────────────────────────────
  const pcsRef              = useRef({});        // peerId → RTCPeerConnection
  const groupProcessedSigs  = useRef(new Set());
  const groupPollRef        = useRef(null);
  const groupCallIdRef      = useRef(null);
  const myProfileRef        = useRef(null);
  const inviteSubRef        = useRef(null);

  // ── Keep refs in sync ─────────────────────────────────────────────────────
  useEffect(() => { activeCallRef.current   = activeCall;       }, [activeCall]);
  useEffect(() => { callStatusRef.current   = callStatus;       }, [callStatus]);
  useEffect(() => { userIdRef.current       = user?.id ?? null; }, [user]);
  useEffect(() => { incomingCallRef.current = incomingCall;     }, [incomingCall]);
  useEffect(() => { remoteStreamRef.current = remoteStream;     }, [remoteStream]);

  // ── Fetch own profile for grp_join announcements ──────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('id, username, display_name')
      .eq('id', user.id).single()
      .then(({ data }) => { if (data) myProfileRef.current = data; });
  }, [user]);

  // ── Duration timer ────────────────────────────────────────────────────────
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

  // ── Realtime broadcast: direct group-call invite channel ─────────────────
  useEffect(() => {
    if (!user) return;
    inviteSubRef.current?.unsubscribe();
    inviteSubRef.current = supabase
      .channel(`wz-invite-${user.id}`)
      .on('broadcast', { event: 'group_invite' }, ({ payload }) => {
        if (!payload) return;
        if (callStatusRef.current !== 'idle' || activeCallRef.current) return;
        const { inviteCallId, mainCallId, inviterProfile, participants } = payload;
        if (!inviterProfile || !mainCallId) return;
        if (processedCalls.current.has(inviteCallId)) return;
        processedCalls.current.add(inviteCallId);
        setIncomingCall({
          callId: inviteCallId,
          caller: inviterProfile,
          isGroupInvite: true,
          directGroupJoin: { mainCallId, participants },
        });
        setCallStatus('ringing');
      })
      .subscribe();
    return () => { inviteSubRef.current?.unsubscribe(); };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function showIncoming(call) {
    if (processedCalls.current.has(call.id)) return;
    const { data: caller } = await supabase
      .from('profiles').select('id, username, display_name')
      .eq('id', call.caller_id).single();
    if (!caller) return;
    if (callStatusRef.current !== 'idle' || activeCallRef.current) return;
    if (processedCalls.current.has(call.id)) return;

    // Check if this is a group call invite
    const { data: groupMeta } = await supabase
      .from('call_signals').select('*')
      .eq('call_id', call.id).eq('type', 'group_meta').maybeSingle();

    setIncomingCall({ callId: call.id, caller, isGroupInvite: !!groupMeta });
    setCallStatus('ringing');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function getUserMedia() {
    try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); }
    catch { return await navigator.mediaDevices.getUserMedia({ audio: true }); }
  }

  function buildPC(callId, peerId, onIceInsert) {
    pcRef.current?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    if (peerId) pcsRef.current[peerId] = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !userIdRef.current) return;
      onIceInsert(candidate.toJSON());
    };

    pc.ontrack = ({ streams }) => {
      if (streams?.[0]) {
        setRemoteStream(streams[0]);
        if (peerId) setRemoteStreams(prev => ({ ...prev, [peerId]: streams[0] }));
        // Remote track = call is live; ensures 'active' on mobile where PC state events are unreliable
        setCallStatus(prev => (prev === 'ringing' || prev === 'connecting') ? 'active' : prev);
      }
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

  // ── Group: build a peer connection for one remote participant ─────────────

  function buildGroupPC(callId, peerId) {
    pcsRef.current[peerId]?.close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current[peerId] = pc;

    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !userIdRef.current) return;
      supabase.from('call_signals').insert({
        call_id: callId, from_id: userIdRef.current,
        type: 'grp_ice',
        data: { to_id: peerId, candidate: candidate.toJSON() },
      }).catch(console.error);
    };

    pc.ontrack = ({ streams }) => {
      if (streams?.[0]) setRemoteStreams(prev => ({ ...prev, [peerId]: streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') setCallStatus('active');
      if ((s === 'failed' || s === 'disconnected') && pcsRef.current[peerId] === pc) {
        pc.close();
        delete pcsRef.current[peerId];
        setRemoteStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
        setGroupParticipants(prev => prev.filter(p => p.id !== peerId));
      }
    };

    return pc;
  }

  // ── Group: apply a grp_* signal ───────────────────────────────────────────

  async function applyGroupSig(sig, callId) {
    const uid = userIdRef.current;
    if (!uid) return;

    if (sig.type === 'grp_join') {
      const participant = sig.data?.participant;
      if (!participant || participant.id === uid) return;
      setGroupParticipants(prev => {
        if (prev.find(p => p.id === participant.id)) return prev;
        return [...prev, participant];
      });
    }

    if (sig.type === 'grp_offer' && sig.data?.to_id === uid) {
      const peerId = sig.from_id;
      const pc = buildGroupPC(callId, peerId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await supabase.from('call_signals').insert({
          call_id: callId, from_id: uid,
          type: 'grp_answer',
          data: { to_id: peerId, sdp: { type: answer.type, sdp: answer.sdp } },
        });
      } catch (e) { console.warn('grp_offer failed:', e); }
    }

    if (sig.type === 'grp_answer' && sig.data?.to_id === uid) {
      const pc = pcsRef.current[sig.from_id];
      if (pc && pc.signalingState !== 'stable') {
        try { await pc.setRemoteDescription(new RTCSessionDescription(sig.data.sdp)); } catch {}
      }
    }

    if (sig.type === 'grp_ice' && sig.data?.to_id === uid) {
      const pc = pcsRef.current[sig.from_id];
      if (pc?.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(sig.data.candidate)); } catch {}
      }
    }

    if (sig.type === 'grp_leave') {
      const peerId = sig.from_id;
      pcsRef.current[peerId]?.close();
      delete pcsRef.current[peerId];
      setRemoteStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
      setGroupParticipants(prev => prev.filter(p => p.id !== peerId));
    }
  }

  // ── Group: poll for grp_* signals every 1 s ───────────────────────────────

  function startGroupPolling(callId) {
    clearInterval(groupPollRef.current);
    groupPollRef.current = setInterval(async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      const { data: sigs } = await supabase
        .from('call_signals').select('*')
        .eq('call_id', callId)
        .in('type', ['grp_join', 'grp_offer', 'grp_answer', 'grp_ice', 'grp_leave'])
        .neq('from_id', uid)
        .order('created_at', { ascending: true });
      for (const sig of (sigs || [])) {
        if (groupProcessedSigs.current.has(sig.id)) continue;
        if (['grp_offer', 'grp_answer', 'grp_ice'].includes(sig.type) && sig.data?.to_id !== uid) continue;
        groupProcessedSigs.current.add(sig.id);
        await applyGroupSig(sig, callId);
      }
    }, 1000);
  }

  // ── 1-on-1: signal polling every 1 s ─────────────────────────────────────

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
        await applySig(sig, callId);
        if (!pcRef.current) break;
      }
    }, 1000);
  }

  async function applySig(sig, callId) {
    const pc = pcRef.current;

    // grp_join received during 1-on-1 → switch this peer into group mode
    if (sig.type === 'grp_join') {
      const participant = sig.data?.participant;
      if (!participant) return;
      const cid = callId || activeCallRef.current?.callId;
      if (cid && !groupCallIdRef.current) {
        groupCallIdRef.current = cid;
        if (pc && !pcsRef.current[sig.from_id]) pcsRef.current[sig.from_id] = pc;
        const rs = remoteStreamRef.current;
        if (rs) setRemoteStreams(prev => ({ ...prev, [sig.from_id]: rs }));
        const myProfile = myProfileRef.current;
        if (myProfile && userIdRef.current) {
          supabase.from('call_signals').insert({
            call_id: cid, from_id: userIdRef.current,
            type: 'grp_join', data: { participant: myProfile },
          }).catch(console.error);
        }
        startGroupPolling(cid);
      }
      setGroupParticipants(prev => {
        if (prev.find(p => p.id === participant.id)) return prev;
        return [...prev, participant];
      });
      return;
    }

    if (sig.type === 'answer' && pc) {
      clearTimeout(ringTimer.current);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.data.sdp));
        for (const c of iceCandidateBuffer.current) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        iceCandidateBuffer.current = [];
        // Answer received = callee accepted; mark active so caller UI updates immediately
        setCallStatus(s => (s === 'ringing' || s === 'connecting') ? 'active' : s);
      }
      catch (e) { console.warn('setRemoteDescription(answer):', e); }
    }
    if (sig.type === 'ice-candidate' && pc) {
      if (!pc.remoteDescription) {
        iceCandidateBuffer.current.push(sig.data.candidate);
      } else {
        try { await pc.addIceCandidate(new RTCIceCandidate(sig.data.candidate)); } catch {}
      }
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
        await applySig(sig, callId);
      })
      .subscribe();
  }

  // ── Join a group call room (redirect from acceptCall when group_meta found) ─

  async function joinGroupCall(mainCallId, inviter, existingParticipants) {
    try {
      const stream = await getUserMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getVideoTracks().forEach(t => { t.enabled = false; });
      setIsCameraOn(false);
      setIsMuted(false);

      const myProfile = myProfileRef.current;
      groupCallIdRef.current = mainCallId;

      if (myProfile && userIdRef.current) {
        await supabase.from('call_signals').insert({
          call_id: mainCallId, from_id: userIdRef.current,
          type: 'grp_join', data: { participant: myProfile },
        });
      }

      // Collect all current participants from grp_join signals + passed list
      const { data: joinSigs } = await supabase
        .from('call_signals').select('*')
        .eq('call_id', mainCallId).eq('type', 'grp_join')
        .neq('from_id', userIdRef.current);

      const seen = new Set();
      const allParticipants = [];
      for (const sig of (joinSigs || [])) {
        const p = sig.data?.participant;
        if (p && !seen.has(p.id)) { seen.add(p.id); allParticipants.push(p); }
      }
      for (const p of (existingParticipants || [])) {
        if (!seen.has(p.id)) { seen.add(p.id); allParticipants.push(p); }
      }
      // Fallback: use the original calls row to find the pair
      if (allParticipants.length === 0) {
        const { data: callRow } = await supabase
          .from('calls').select('caller_id, callee_id').eq('id', mainCallId).maybeSingle();
        if (callRow) {
          for (const pid of [callRow.caller_id, callRow.callee_id]) {
            if (pid && pid !== userIdRef.current && !seen.has(pid)) {
              const { data: p } = await supabase
                .from('profiles').select('id, username, display_name').eq('id', pid).single();
              if (p) { seen.add(p.id); allParticipants.push(p); }
            }
          }
        }
      }

      setGroupParticipants(allParticipants);
      setActiveCall({ callId: mainCallId, peer: inviter, role: 'group_joiner', isGroup: true });
      setCallStatus('connecting');

      // Offer to every existing participant
      for (const participant of allParticipants) {
        const pc = buildGroupPC(mainCallId, participant.id);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await supabase.from('call_signals').insert({
            call_id: mainCallId, from_id: userIdRef.current,
            type: 'grp_offer',
            data: { to_id: participant.id, sdp: { type: offer.type, sdp: offer.sdp } },
          });
        } catch (e) { console.warn(`grp_offer to ${participant.id} failed:`, e); }
      }

      startGroupPolling(mainCallId);
    } catch (err) {
      setCallError(err.message || 'Failed to join group call');
      doCleanup();
      setCallStatus('idle');
      setActiveCall(null);
    }
  }

  // ── Invite friends to the active call (up to 3 total extra) ──────────────

  async function inviteToCall(friends) {
    const callId = activeCallRef.current?.callId;
    if (!callId || !userIdRef.current) return;

    const myProfile = myProfileRef.current;
    const peer = activeCallRef.current?.peer;

    // Enter group mode if not already
    if (!groupCallIdRef.current) {
      groupCallIdRef.current = callId;
      if (pcRef.current && peer?.id && !pcsRef.current[peer.id]) {
        pcsRef.current[peer.id] = pcRef.current;
      }
      const rs = remoteStreamRef.current;
      if (rs && peer?.id) setRemoteStreams(prev => ({ ...prev, [peer.id]: rs }));
      if (peer) {
        setGroupParticipants(prev => {
          if (prev.find(p => p.id === peer.id)) return prev;
          return [...prev, peer];
        });
      }
      if (myProfile) {
        await supabase.from('call_signals').insert({
          call_id: callId, from_id: userIdRef.current,
          type: 'grp_join', data: { participant: myProfile },
        }).catch(console.error);
      }
      startGroupPolling(callId);
    }

    const currentParticipants = [
      ...(myProfile ? [myProfile] : []),
      ...(peer ? [peer] : []),
    ].filter(Boolean);

    for (const friend of friends) {
      const inviteCallId = crypto.randomUUID();

      // Primary: broadcast directly — bypasses RLS and is instant
      const inviteCh = supabase.channel(`wz-invite-${friend.id}`);
      inviteCh.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          inviteCh.send({
            type: 'broadcast',
            event: 'group_invite',
            payload: {
              inviteCallId,
              mainCallId: callId,
              inviterProfile: myProfile,
              participants: currentParticipants,
            },
          }).catch(console.error).finally(() => inviteCh.unsubscribe());
        }
      });

      // Secondary: calls row for polling fallback
      const { error } = await supabase.from('calls').insert({
        id: inviteCallId,
        caller_id: userIdRef.current,
        callee_id: friend.id,
        status: 'ringing',
      });
      if (error) {
        console.error('invite calls insert (non-fatal, broadcast already sent):', error);
        continue;
      }

      // Tag as group invite so the polling path can also redirect correctly
      await supabase.from('call_signals').insert({
        call_id: inviteCallId, from_id: userIdRef.current,
        type: 'group_meta',
        data: { main_call_id: callId, participants: currentParticipants },
      }).catch(console.error);

      // Auto-cancel if unanswered after 30 s
      setTimeout(() => {
        supabase.from('calls').update({ status: 'missed' })
          .eq('id', inviteCallId).eq('status', 'ringing').catch(() => {});
      }, 30000);
    }
  }

  // ── Public: initiate 1-on-1 call ─────────────────────────────────────────

  async function initiateCall(callee) {
    if (callStatusRef.current !== 'idle') return;
    if (callee.id === userIdRef.current) return;
    setCallError('');
    setCallStatus('connecting');

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

      const pc = buildPC(callId, callee.id, (candidateJson) => {
        if (dbReady) {
          supabase.from('call_signals').insert({
            call_id: callId, from_id: userIdRef.current,
            type: 'ice-candidate', data: { candidate: candidateJson },
          });
        } else {
          iceBuffer.push(candidateJson);
        }
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const { error: callErr } = await supabase.from('calls').insert({
        id: callId, caller_id: user.id, callee_id: callee.id, status: 'ringing',
      });
      if (callErr) throw callErr;

      await supabase.from('call_signals').insert({
        call_id: callId, from_id: user.id, type: 'offer',
        data: { sdp: { type: offer.type, sdp: offer.sdp } },
      });

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
    const { callId, caller, directGroupJoin } = incomingCall;
    processedCalls.current.add(callId);
    setCallError('');
    setCallStatus('connecting');
    setIncomingCall(null);

    try {
      // Fast path: broadcast-delivered invite carries the join info directly
      if (directGroupJoin) {
        const { mainCallId, participants } = directGroupJoin;
        await supabase.from('calls').update({ status: 'ended' }).eq('id', callId).catch(() => {});
        await joinGroupCall(mainCallId, caller, participants);
        return;
      }

      // Fallback: check call_signals for group_meta (polling-path invite)
      const { data: groupMeta } = await supabase
        .from('call_signals').select('*')
        .eq('call_id', callId).eq('type', 'group_meta').maybeSingle();

      if (groupMeta) {
        const { main_call_id, participants } = groupMeta.data;
        await supabase.from('calls').update({ status: 'ended' }).eq('id', callId).catch(() => {});
        await joinGroupCall(main_call_id, caller, participants);
        return;
      }

      // Normal 1-on-1 flow ──────────────────────────────────────────────────
      const stream = await getUserMedia();
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getVideoTracks().forEach(t => { t.enabled = false; });
      setIsCameraOn(false);
      setIsMuted(false);

      setActiveCall({ callId, peer: caller, role: 'callee' });

      const pc = buildPC(callId, caller.id, (candidateJson) => {
        supabase.from('call_signals').insert({
          call_id: callId, from_id: userIdRef.current,
          type: 'ice-candidate', data: { candidate: candidateJson },
        });
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

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

      const { data: callerIce } = await supabase
        .from('call_signals').select('*')
        .eq('call_id', callId).eq('type', 'ice-candidate').neq('from_id', user.id);
      for (const s of (callerIce || [])) {
        processedSigs.current.add(s.id);
        try { await pc.addIceCandidate(new RTCIceCandidate(s.data.candidate)); } catch {}
      }

      await supabase.from('call_signals').insert({
        call_id: callId, from_id: user.id, type: 'answer',
        data: { sdp: { type: answer.type, sdp: answer.sdp } },
      });
      await supabase.from('calls').update({ status: 'active' }).eq('id', callId);

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
    const uid    = userIdRef.current;
    const isGroup = !!groupCallIdRef.current;
    clearTimeout(ringTimer.current);

    try {
      if (callId && uid) {
        if (isGroup) {
          await supabase.from('call_signals')
            .insert({ call_id: callId, from_id: uid, type: 'grp_leave', data: {} })
            .catch(console.error);
        } else {
          await Promise.all([
            supabase.from('call_signals').insert({ call_id: callId, from_id: uid, type: 'hangup', data: {} }),
            supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', callId),
          ]).catch(console.error);
        }
      }
    } finally {
      doCleanup();
      setActiveCall(null);
      setRemoteStream(null);
      setCallStatus('ended');
      setTimeout(() => { setCallStatus('idle'); isHangingUp.current = false; }, 2000);
    }
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
    Object.values(pcsRef.current).forEach(pc => pc?.close());
    pcsRef.current = {};
    setRemoteStreams({});
    setGroupParticipants([]);
    clearInterval(groupPollRef.current);
    groupPollRef.current = null;
    groupProcessedSigs.current = new Set();
    groupCallIdRef.current = null;
    sigSubRef.current?.unsubscribe();
    sigSubRef.current = null;
    processedSigs.current = new Set();
    // Note: inviteSubRef is NOT cleaned up here — it must persist across calls
    iceCandidateBuffer.current = [];
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
      remoteStreams, groupParticipants,
      initiateCall, acceptCall, declineCall, hangUp, toggleMute, toggleCamera,
      inviteToCall,
    }}>
      {children}
    </CallCtx.Provider>
  );
}

export const useCall = () => useContext(CallCtx);
