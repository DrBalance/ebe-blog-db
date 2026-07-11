import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
const useDebounce = (value, delay = 400) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};


// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

function StatBar({ stats }) {
  if (!stats) return null;
  return (
    <div style={{ display: "flex", gap: 24, fontSize: 13, color: "#666", marginBottom: 20 }}>
      <span>📝 포스트 <strong>{stats.total_posts?.toLocaleString()}</strong>개</span>
      <span>💬 댓글 <strong>{stats.total_comments?.toLocaleString()}</strong>개</span>
      <span>👨‍⚕️ 박사 답변 <strong>{stats.doctor_replies?.toLocaleString()}</strong>개</span>
      <span>🗓 최신 {stats.latest_post}</span>
    </div>
  );
}


function PostCard({ post, onClick }) {
  return (
    <div
      onClick={() => onClick(post.id)}
      style={{
        background: "#fff",
        border: "1px solid #e8e8e8",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 12,
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: 4 }}>
            {post.title_ko || post.title_ja}
          </div>
          {post.title_ko && (
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
              {post.title_ja}
            </div>
          )}
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
            {post.summary_ko}…
          </div>
        </div>
        <div style={{ marginLeft: 16, textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: "#999" }}>{post.published_at}</div>
          {post.comment_count > 0 && (
            <div style={{ fontSize: 12, color: "#4a90d9", marginTop: 4 }}>
              💬 {post.comment_count}
            </div>
          )}
          {post.category && (
            <div style={{
              marginTop: 6, fontSize: 11, background: "#f0f4ff",
              color: "#4a6cf7", padding: "2px 8px", borderRadius: 20,
              display: "inline-block"
            }}>
              {post.category}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function CommentBlock({ comment }) {
  const isDoctor = comment.is_doctor_reply;
  return (
    <div style={{
      background: isDoctor ? "#f0f7ff" : "#fafafa",
      border: isDoctor ? "1px solid #bcd4f5" : "1px solid #eee",
      borderRadius: 8,
      padding: "12px 16px",
      marginBottom: 10,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginBottom: 8, fontSize: 13
      }}>
        <span style={{ fontWeight: 600, color: isDoctor ? "#1a5fa8" : "#333" }}>
          {isDoctor ? "👨‍⚕️ " : "💬 "}{comment.author}
          {isDoctor && <span style={{ marginLeft: 6, fontSize: 11, background: "#1a5fa8", color: "#fff", padding: "1px 6px", borderRadius: 10 }}>박사 답변</span>}
        </span>
        <span style={{ color: "#aaa", fontSize: 12 }}>{comment.posted_at}</span>
      </div>
      <div style={{ fontSize: 13, color: "#333", lineHeight: 1.7, marginBottom: 8 }}>
        {comment.content_ko}
      </div>
      <div style={{
        fontSize: 12, color: "#888", lineHeight: 1.6,
        borderTop: "1px solid #e0e0e0", paddingTop: 8,
        fontFamily: "serif"
      }}>
        {comment.content_ja}
      </div>
    </div>
  );
}


function PostDetail({ postId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showJa, setShowJa] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/posts/${postId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [postId]);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
      불러오는 중...
    </div>
  );

  const { post, comments } = data;

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button
          onClick={onClose}
          style={{ background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
        >
          ← 목록으로
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowJa(!showJa)}
            style={{
              background: showJa ? "#4a6cf7" : "#f0f0f0",
              color: showJa ? "#fff" : "#333",
              border: "none", borderRadius: 6,
              padding: "6px 14px", cursor: "pointer", fontSize: 13
            }}
          >
            {showJa ? "🇯🇵 원문 표시 중" : "🇯🇵 원문 보기"}
          </button>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: "#4a6cf7", padding: "6px 14px", border: "1px solid #4a6cf7", borderRadius: 6, textDecoration: "none" }}
          >
            원문 링크 ↗
          </a>
        </div>
      </div>

      {/* 제목 */}
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>
        {post.title_ko}
      </h2>
      {showJa && (
        <div style={{ fontSize: 16, color: "#666", fontFamily: "serif", marginBottom: 6 }}>
          {post.title_ja}
        </div>
      )}
      <div style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>
        {post.published_at} · {post.category}
      </div>

      {/* 본문 */}
      <div style={{
        background: "#fff", border: "1px solid #e8e8e8",
        borderRadius: 10, padding: "24px 28px", marginBottom: 24
      }}>
        <div style={{ fontSize: 15, lineHeight: 1.9, color: "#222", whiteSpace: "pre-wrap" }}>
          {post.content_ko}
        </div>
        {showJa && (
          <div style={{
            marginTop: 24, paddingTop: 20,
            borderTop: "2px solid #f0f0f0",
            fontSize: 14, lineHeight: 1.9, color: "#555",
            fontFamily: "serif", whiteSpace: "pre-wrap"
          }}>
            {post.content_ja}
          </div>
        )}
      </div>

      {/* 댓글 */}
      {comments.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: "#333" }}>
            댓글 {comments.length}개
          </h3>
          {comments.map(c => <CommentBlock key={c.id} comment={c} />)}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// 메인 App
// ─────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);

  const debouncedQuery = useDebounce(query);

  // 통계 + 카테고리 로드
  useEffect(() => {
    fetch(`${API}/stats`).then(r => r.json()).then(setStats);
    fetch(`${API}/categories`).then(r => r.json()).then(setCategories);
  }, []);

  // 포스트 목록 로드
  const fetchPosts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: 20,
      ...(debouncedQuery && { q: debouncedQuery }),
      ...(category && { category }),
      ...(year && { year }),
    });
    fetch(`${API}/posts?${params}`)
      .then(r => r.json())
      .then(d => { setPosts(d.posts || []); setTotal(d.total || 0); setLoading(false); });
  }, [debouncedQuery, category, year, page]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { setPage(1); }, [debouncedQuery, category, year]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* 헤더 */}
      <div style={{ background: "#1a2340", color: "#fff", padding: "20px 0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#8899bb", marginBottom: 4 }}>
            DR. EBE BLOG ARCHIVE
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            ドクター江部 당질제한 아카이브
          </h1>
          <div style={{ fontSize: 13, color: "#8899bb", marginTop: 4 }}>
            2007–2026 · 전체 포스트 검색 · 원문/번역 병기
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>
        {!selectedId ? (
          <>
            <StatBar stats={stats} />

            {/* 검색바 */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="🔍  키워드 검색 (한국어 / 일본어)"
                style={{
                  flex: 1, minWidth: 220,
                  padding: "10px 16px", fontSize: 14,
                  border: "1px solid #ddd", borderRadius: 8,
                  outline: "none", background: "#fff"
                }}
              />
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, background: "#fff" }}
              >
                <option value="">전체 카테고리</option>
                {categories.map(c => (
                  <option key={c.category} value={c.category}>
                    {c.category} ({c.count})
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={e => setYear(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, background: "#fff" }}
              >
                <option value="">전체 연도</option>
                {Array.from({ length: 20 }, (_, i) => 2026 - i).map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>

            {/* 결과 헤더 */}
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              {loading ? "검색 중..." : `총 ${total.toLocaleString()}개 포스트`}
              {query && ` — "${query}" 검색 결과`}
            </div>

            {/* 포스트 목록 */}
            {loading
              ? <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>불러오는 중...</div>
              : posts.map(p => <PostCard key={p.id} post={p} onClick={setSelectedId} />)
            }

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff" }}
                >
                  ←
                </button>
                <span style={{ padding: "8px 16px", fontSize: 13, color: "#555" }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff" }}
                >
                  →
                </button>
              </div>
            )}
          </>
        ) : (
          <PostDetail postId={selectedId} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}
