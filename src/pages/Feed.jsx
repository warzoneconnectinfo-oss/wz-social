import { useEffect, useRef, useState } from 'react';
import { Heart, Flag, Send, Image as ImageIcon, Trash2, MessageCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';

// Parse @mentions in post/comment content into clickable links
function renderContent(text) {
  if (!text) return null;
  return text.split(/(@\w+)/).map((part, i) =>
    /^@\w+$/.test(part)
      ? <Link key={i} to={`/profile/${part.slice(1)}`}
          className="text-orange-400 hover:text-orange-300 font-medium hover:underline transition-colors"
          onClick={e => e.stopPropagation()}>{part}</Link>
      : part
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────
function PostCard({ post, userId, userProfile, onLike, onReport, onDelete, onlineUsers }) {
  const author   = post.author || {};
  const name     = author.display_name || author.username || '?';
  const username = author.username;
  const isOwn    = post.author_id === userId;
  const isOnline = onlineUsers.has(post.author_id);

  const [showComments,  setShowComments]  = useState(false);
  const [comments,      setComments]      = useState([]);
  const [commentText,   setCommentText]   = useState('');
  const [loadingCmts,   setLoadingCmts]   = useState(false);
  const [submittingCmt, setSubmittingCmt] = useState(false);
  const [commentCount,  setCommentCount]  = useState(post.comment_count ?? 0);

  // mention states for comment input
  const [cMentionQuery,   setCMentionQuery]   = useState(null);
  const [cMentionStart,   setCMentionStart]   = useState(-1);
  const [cMentionResults, setCMentionResults] = useState([]);
  const cInputRef        = useRef(null);
  const cMentionTimerRef = useRef(null);

  async function fetchComments() {
    setLoadingCmts(true);
    const { data } = await supabase
      .from('post_comments')
      .select('*, author:profiles!author_id(id, username, display_name, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
    setLoadingCmts(false);
  }

  function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) fetchComments();
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim() || submittingCmt) return;
    setSubmittingCmt(true);
    const { data } = await supabase
      .from('post_comments')
      .insert({ post_id: post.id, author_id: userId, content: commentText.trim() })
      .select('*, author:profiles!author_id(id, username, display_name, avatar_url)')
      .single();
    if (data) {
      setComments(prev => [...prev, data]);
      setCommentCount(n => n + 1);
    }
    setCommentText('');
    setSubmittingCmt(false);
  }

  async function deleteComment(id) {
    await supabase.from('post_comments').delete().eq('id', id);
    setComments(prev => prev.filter(c => c.id !== id));
    setCommentCount(n => Math.max(0, n - 1));
  }

  // @mention in comment box
  function handleCommentChange(e) {
    const val = e.target.value;
    setCommentText(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match  = before.match(/@(\w*)$/);
    if (match) {
      setCMentionStart(cursor - match[0].length);
      setCMentionQuery(match[1]);
      clearTimeout(cMentionTimerRef.current);
      cMentionTimerRef.current = setTimeout(() => searchCommentMentions(match[1]), 150);
    } else {
      setCMentionQuery(null);
      setCMentionResults([]);
    }
  }

  async function searchCommentMentions(q) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(5);
    setCMentionResults(data || []);
  }

  function insertCommentMention(p) {
    const endPos   = cMentionStart + 1 + (cMentionQuery?.length || 0);
    const inserted = `@${p.username} `;
    const newVal   = commentText.slice(0, cMentionStart) + inserted + commentText.slice(endPos);
    setCommentText(newVal);
    setCMentionQuery(null);
    setCMentionResults([]);
    const newCur = cMentionStart + inserted.length;
    requestAnimationFrame(() => {
      cInputRef.current?.focus();
      cInputRef.current?.setSelectionRange(newCur, newCur);
    });
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      {/* Author row */}
      <div className="flex items-center gap-3 mb-3">
        <Link to={`/profile/${username}`}>
          <Avatar url={author.avatar_url} name={name} size="md" online={isOnline} />
        </Link>
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${username}`} className="text-white text-sm font-medium hover:text-orange-400 transition-colors">
            {name}
          </Link>
          <p className="text-zinc-500 text-xs">{new Date(post.created_at).toLocaleString()}</p>
        </div>
      </div>

      {/* Content with @mention links */}
      <p className="text-zinc-300 text-sm leading-relaxed mb-3 whitespace-pre-wrap">
        {renderContent(post.content)}
      </p>

      {/* Image */}
      {post.image_url && (
        <img src={post.image_url} alt=""
          className="rounded-lg mb-3 max-h-80 w-full object-cover border border-zinc-800"
          onError={e => { e.target.style.display = 'none'; }} />
      )}

      {/* Action bar */}
      <div className="flex items-center gap-4 pt-2 border-t border-zinc-800">
        <button onClick={() => onLike(post)}
          className={`flex items-center gap-1.5 text-sm transition-colors ${post.user_liked ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'}`}>
          <Heart size={15} fill={post.user_liked ? 'currentColor' : 'none'} />
          {post.likes_count}
        </button>

        <button onClick={toggleComments}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-orange-400 transition-colors">
          <MessageCircle size={15} />
          <span>{commentCount}</span>
          {showComments ? <ChevronDown size={13} className="rotate-180" /> : <ChevronDown size={13} />}
        </button>

        {!isOwn && (
          <button onClick={() => onReport(post.id)}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-yellow-500 transition-colors">
            <Flag size={13} />Report
          </button>
        )}
        {isOwn && (
          <button onClick={() => onDelete(post.id)}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors ml-auto">
            <Trash2 size={13} />Delete
          </button>
        )}
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
          {loadingCmts ? (
            <p className="text-zinc-600 text-xs text-center py-2">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-zinc-600 text-xs text-center py-2">No comments yet.</p>
          ) : (
            comments.map(c => {
              const cName  = c.author?.display_name || c.author?.username || '?';
              const cIsOwn = c.author_id === userId;
              return (
                <div key={c.id} className="flex gap-2 group">
                  <Link to={`/profile/${c.author?.username}`}>
                    <Avatar url={c.author?.avatar_url} name={cName} size="xs" />
                  </Link>
                  <div className="flex-1 min-w-0 bg-zinc-800 rounded-xl px-3 py-1.5">
                    <div className="flex items-baseline gap-2">
                      <Link to={`/profile/${c.author?.username}`} className="text-white text-xs font-medium hover:text-orange-400 transition-colors">
                        {cName}
                      </Link>
                      <span className="text-zinc-600 text-[10px]">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-zinc-300 text-xs leading-relaxed">
                      {renderContent(c.content)}
                    </p>
                  </div>
                  {cIsOwn && (
                    <button onClick={() => deleteComment(c.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all shrink-0 self-start mt-1">
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })
          )}

          {/* Comment input with @mention */}
          <div className="relative pt-1">
            {cMentionResults.length > 0 && cMentionQuery !== null && (
              <div className="absolute bottom-full left-0 mb-1 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-20">
                {cMentionResults.map(p => (
                  <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); insertCommentMention(p); }}
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
            <form onSubmit={submitComment} className="flex gap-2">
              <input
                ref={cInputRef}
                value={commentText}
                onChange={handleCommentChange}
                onKeyDown={e => e.key === 'Escape' && (setCMentionQuery(null), setCMentionResults([]))}
                placeholder="Write a comment… use @ to tag"
                maxLength={500}
                className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
              />
              <button type="submit" disabled={!commentText.trim() || submittingCmt}
                className="p-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0">
                <Send size={13} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feed page ─────────────────────────────────────────────────────────────────
export default function Feed() {
  const { user, profile, onlineUsers } = useAuth();
  const [searchParams] = useSearchParams();
  const [posts,      setPosts]      = useState([]);
  const [content,    setContent]    = useState('');
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fetching,   setFetching]   = useState(true);
  const [loadError,  setLoadError]  = useState('');
  const [highlightId, setHighlightId] = useState(null);

  // @mention state for compose box
  const [mentionQuery,   setMentionQuery]   = useState(null);
  const [mentionStart,   setMentionStart]   = useState(-1);
  const [mentionResults, setMentionResults] = useState([]);
  const textareaRef    = useRef(null);
  const mentionTimerRef = useRef(null);
  const imgInputRef    = useRef(null);
  const chanRef        = useRef(null);

  // Scroll to and briefly highlight a post when arriving from a notification
  useEffect(() => {
    const postId = searchParams.get('post');
    if (!postId || fetching) return;
    setHighlightId(postId);
    const el = document.getElementById(`post-${postId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [searchParams, fetching]);

  useEffect(() => {
    if (!user) return;
    load();
    chanRef.current = supabase
      .channel(`feed-live-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },
        async ({ new: row }) => {
          if (row.is_removed) return;
          if (row.author_id === user.id) return;
          const { data: a } = await supabase
            .from('profiles').select('id, username, display_name, avatar_url').eq('id', row.author_id).single();
          setPosts(prev => [{ ...row, author: a || {}, user_liked: false }, ...prev]);
        })
      .subscribe();
    return () => chanRef.current?.unsubscribe();
  }, [user]);

  async function load() {
    setFetching(true);
    setLoadError('');
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select('id, author_id, content, image_url, likes_count, comment_count, created_at, author:profiles!author_id(id, username, display_name, avatar_url)')
      .eq('is_removed', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (postsErr) {
      setLoadError(postsErr.message);
      setFetching(false);
      return;
    }

    const { data: likes } = await supabase.from('post_likes').select('post_id').eq('profile_id', user.id);
    const likedSet = new Set((likes || []).map(l => l.post_id));
    setPosts((postsData || []).map(p => ({ ...p, user_liked: likedSet.has(p.id) })));
    setFetching(false);
  }

  // @mention detection for compose textarea
  function handleContentChange(e) {
    const val = e.target.value;
    setContent(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match  = before.match(/@(\w*)$/);
    if (match) {
      setMentionStart(cursor - match[0].length);
      setMentionQuery(match[1]);
      clearTimeout(mentionTimerRef.current);
      mentionTimerRef.current = setTimeout(() => searchMentions(match[1]), 150);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  }

  async function searchMentions(q) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', user.id)
      .limit(6);
    setMentionResults(data || []);
  }

  function insertMention(p) {
    const endPos   = mentionStart + 1 + (mentionQuery?.length || 0);
    const inserted = `@${p.username} `;
    const newVal   = content.slice(0, mentionStart) + inserted + content.slice(endPos);
    setContent(newVal);
    setMentionQuery(null);
    setMentionResults([]);
    const newCur = mentionStart + inserted.length;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newCur, newCur);
    });
  }

  function handleImgSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  }

  function clearImg() {
    setImgFile(null);
    setImgPreview('');
    if (imgInputRef.current) imgInputRef.current.value = '';
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setLoadError('');

    let imageUrl = null;
    if (imgFile) {
      const ext  = imgFile.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('post-images').upload(path, imgFile);
      if (upErr) {
        setLoadError(`Image upload failed: ${upErr.message}`);
      } else {
        const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
        imageUrl = publicUrl;
      }
    }

    const { data: newPost, error: insertErr } = await supabase
      .from('posts')
      .insert({ author_id: user.id, content: content.trim(), image_url: imageUrl })
      .select('id')
      .single();

    if (insertErr) {
      setLoadError(`Failed to post: ${insertErr.message}`);
    } else {
      setContent('');
      clearImg();
      setMentionQuery(null);
      setMentionResults([]);
    }

    setSubmitting(false);
    load();
  }

  async function handleLike(post) {
    const nowLiked = !post.user_liked;
    // Optimistic UI update
    setPosts(prev => prev.map(p => p.id === post.id
      ? { ...p, user_liked: nowLiked, likes_count: p.likes_count + (nowLiked ? 1 : -1) } : p));
    // DB update — triggers handle likes_count sync automatically
    if (post.user_liked) {
      await supabase.from('post_likes').delete().eq('post_id', post.id).eq('profile_id', user.id);
    } else {
      await supabase.from('post_likes').insert({ post_id: post.id, profile_id: user.id });
    }
  }

  async function handleDelete(postId) {
    if (!window.confirm('Delete this post?')) return;
    await supabase.from('posts').delete().eq('id', postId).eq('author_id', user.id);
    setPosts(prev => prev.filter(p => p.id !== postId));
  }

  async function handleReport(postId) {
    const reason = window.prompt('Reason for report:');
    if (!reason) return;
    await supabase.from('reports').insert({ reporter_id: user.id, post_id: postId, reason });
    alert('Report submitted. Thanks.');
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-lg font-bold text-white">Community Feed</h1>

        {loadError && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded-xl px-4 py-3 flex justify-between items-center">
            {loadError}
            <button onClick={() => setLoadError('')}><X size={13} /></button>
          </div>
        )}

        {/* Compose */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <form onSubmit={handlePost}>
            <div className="flex items-start gap-3">
              <Avatar url={profile?.avatar_url} name={profile?.display_name || profile?.username || 'U'} size="md" online />
              <div className="flex-1 relative">
                {/* @mention dropdown */}
                {mentionResults.length > 0 && mentionQuery !== null && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-30">
                    {mentionResults.map(p => (
                      <button key={p.id} type="button"
                        onMouseDown={e => { e.preventDefault(); insertMention(p); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-700 text-left transition-colors">
                        <Avatar url={p.avatar_url} name={p.display_name || p.username} size="xs" />
                        <div className="min-w-0">
                          <p className="text-white text-xs font-medium truncate">{p.display_name || p.username}</p>
                          <p className="text-zinc-500 text-[10px] truncate">@{p.username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={handleContentChange}
                  onKeyDown={e => e.key === 'Escape' && (setMentionQuery(null), setMentionResults([]))}
                  placeholder="What's your loadout today? Use @ to tag"
                  maxLength={500} rows={3}
                  className="w-full bg-transparent text-white text-sm placeholder:text-zinc-600 resize-none focus:outline-none"
                />
                {imgPreview && (
                  <div className="relative mt-2 inline-block">
                    <img src={imgPreview} alt="preview" className="rounded-lg max-h-40 border border-zinc-700" />
                    <button type="button" onClick={clearImg}
                      className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5 text-white hover:text-red-400">
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => imgInputRef.current?.click()}
                  className="text-zinc-500 hover:text-orange-400 p-1 transition-colors" title="Attach image">
                  <ImageIcon size={16} />
                </button>
                <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden" onChange={handleImgSelect} />
                <span className="text-zinc-600 text-xs">{content.length}/500</span>
              </div>
              <button type="submit" disabled={!content.trim() || submitting}
                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
                <Send size={13} />
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        </div>

        {/* Posts list */}
        {fetching ? (
          <LoadingSpinner />
        ) : posts.length === 0 && !loadError ? (
          <div className="text-center text-zinc-600 py-16">No posts yet — be the first to post!</div>
        ) : (
          posts.map(post => (
            <div key={post.id} id={`post-${post.id}`}
              className={highlightId === post.id ? 'ring-2 ring-orange-500 rounded-xl transition-all duration-500' : ''}>
              <PostCard
                post={post}
                userId={user.id} userProfile={profile}
                onLike={handleLike} onReport={handleReport} onDelete={handleDelete}
                onlineUsers={onlineUsers}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
