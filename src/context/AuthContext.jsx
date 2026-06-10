import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const presenceChanRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user.id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));

    let subscription;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user.id);
        else { setProfile(null); setLoading(false); }
      });
      subscription = data?.subscription;
    } catch {
      setLoading(false);
    }

    return () => subscription?.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    try {
      // maybeSingle returns null (not an error) when no row found
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
      } else {
        // Profile row missing — create it from auth metadata
        const { data: { user: au } } = await supabase.auth.getUser();
        const meta  = au?.user_metadata ?? {};
        const email = au?.email ?? '';
        const base  = (meta.username || email.split('@')[0])
          .toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const username = base.length >= 3 ? base : base + '_' + userId.slice(0, 4);

        const { data: created, error: createErr } = await supabase
          .from('profiles')
          .insert({
            id:           userId,
            username:     username,
            display_name: meta.display_name || email.split('@')[0],
          })
          .select()
          .single();

        if (createErr) {
          // Profile table may not exist yet — set null and let pages handle it
          setProfile(null);
        } else {
          setProfile(created);
        }
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) { setOnlineUsers(new Set()); return; }
    const ch = supabase.channel('global-online', {
      config: { presence: { key: user.id } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      setOnlineUsers(new Set(Object.keys(state)));
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') await ch.track({ uid: user.id });
    });
    presenceChanRef.current = ch;
    return () => { ch.untrack(); ch.unsubscribe(); };
  }, [user?.id]);

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, onlineUsers, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
