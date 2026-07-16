import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const COLUMNS = ["아이디어", "작업 중", "촬영 대기", "완료"];
const COLUMN_COLORS = {
  "아이디어": "#e8f4fd",
  "작업 중": "#fff7e6",
  "촬영 대기": "#f0f9eb",
  "완료": "#f5f0ff",
};
const COLUMN_BORDER = {
  "아이디어": "#4a90d9",
  "작업 중": "#f5a623",
  "촬영 대기": "#52c41a",
  "완료": "#9b59b6",
};
const SOURCE_BADGE = {
  "주제문": { bg: "#e8f4fd", color: "#4a90d9" },
  "환자질문": { bg: "#fff0f6", color: "#eb2f96" },
};

// ─── 유틸 ───────────────────────────────────────
const useDebounce = (value, delay = 400) => {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
};

function loadCards() {
  try { return JSON.parse(localStorage.getItem("yt_cards") || "[]"); } catch { return []; }
}
function saveCards(cards) {
  localStorage.setItem("yt_cards", JSON.stringify(cards));
}

// ─── 공통 컴포넌트 ─────────────────────────────
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
        background: "#fff", border: "1px solid #e8e8e8",
        borderRadius: 10, padding: "16px 20px", marginBottom: 12,
        cursor: "pointer", transition: "box-shadow 0.15s",
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
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{post.title_ja}</div>
          )}
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>{post.summary_ko}…</div>
        </div>
        <div style={{ marginLeft: 16, textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: "#999" }}>{post.published_at}</div>
          {post.comment_count > 0 && (
            <div style={{ fontSize: 12, color: "#4a90d9", marginTop: 4 }}>💬 {post.comment_count}</div>
          )}
          {post.category && (
            <div style={{
              marginTop: 6, fontSize: 11, background: "#f0f4ff",
              color: "#4a6cf7", padding: "2px 8px", borderRadius: 20, display: "inline-block"
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
      borderRadius: 8, padding: "12px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
        <span style={{ fontWeight: 600, color: isDoctor ? "#1a5fa8" : "#333" }}>
          {isDoctor ? "👨‍⚕️ " : "💬 "}{comment.author}
          {isDoctor && (
            <span style={{ marginLeft: 6, fontSize: 11, background: "#1a5fa8", color: "#fff", padding: "1px 6px", borderRadius: 10 }}>
              박사 답변
            </span>
          )}
        </span>
        <span style={{ color: "#aaa", fontSize: 12 }}>{comment.posted_at}</span>
      </div>
      <div style={{ fontSize: 13, color: "#333", lineHeight: 1.7, marginBottom: 8 }}>{comment.content_ko}</div>
      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6, borderTop: "1px solid #e0e0e0", paddingTop: 8, fontFamily: "serif" }}>
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

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#888" }}>불러오는 중...</div>;

  const { post, comments } = data;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={onClose} style={{ background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
          ← 목록으로
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowJa(!showJa)}
            style={{ background: showJa ? "#4a6cf7" : "#f0f0f0", color: showJa ? "#fff" : "#333", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
          >
            {showJa ? "🇯🇵 원문 표시 중" : "🇯🇵 원문 보기"}
          </button>
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: "#4a6cf7", padding: "6px 14px", border: "1px solid #4a6cf7", borderRadius: 6, textDecoration: "none" }}>
            원문 링크 ↗
          </a>
        </div>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>{post.title_ko}</h2>
      {showJa && <div style={{ fontSize: 16, color: "#666", fontFamily: "serif", marginBottom: 6 }}>{post.title_ja}</div>}
      <div style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>{post.published_at} · {post.category}</div>
      <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 10, padding: "24px 28px", marginBottom: 24 }}>
        <div style={{ fontSize: 15, lineHeight: 1.9, color: "#222", whiteSpace: "pre-wrap" }}>{post.content_ko}</div>
        {showJa && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "2px solid #f0f0f0", fontSize: 14, lineHeight: 1.9, color: "#555", fontFamily: "serif", whiteSpace: "pre-wrap" }}>
            {post.content_ja}
          </div>
        )}
      </div>
      {comments.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: "#333" }}>댓글 {comments.length}개</h3>
          {comments.map(c => <CommentBlock key={c.id} comment={c} />)}
        </div>
      )}
    </div>
  );
}

// ─── 검색 탭 ────────────────────────────────────
function SearchTab() {
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

  useEffect(() => {
    fetch(`${API}/stats`).then(r => r.json()).then(setStats);
    fetch(`${API}/categories`).then(r => r.json()).then(setCategories);
  }, []);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page, limit: 20,
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

  if (selectedId) return <PostDetail postId={selectedId} onClose={() => setSelectedId(null)} />;

  return (
    <>
      <StatBar stats={stats} />
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="🔍  키워드 검색 (한국어 / 일본어)"
          style={{ flex: 1, minWidth: 220, padding: "10px 16px", fontSize: 14, border: "1px solid #ddd", borderRadius: 8, outline: "none", background: "#fff" }}
        />
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, background: "#fff" }}>
          <option value="">전체 카테고리</option>
          {categories.map(c => <option key={c.category} value={c.category}>{c.category} ({c.count})</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, background: "#fff" }}>
          <option value="">전체 연도</option>
          {Array.from({ length: 20 }, (_, i) => 2026 - i).map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>
      <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        {loading ? "검색 중..." : `총 ${total.toLocaleString()}개 포스트`}
        {query && ` — "${query}" 검색 결과`}
      </div>
      {loading
        ? <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>불러오는 중...</div>
        : posts.map(p => <PostCard key={p.id} post={p} onClick={setSelectedId} />)
      }
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff" }}>←</button>
          <span style={{ padding: "8px 16px", fontSize: 13, color: "#555" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff" }}>→</button>
        </div>
      )}
    </>
  );
}

// ─── 소재발굴 탭 ────────────────────────────────
function ContentMiningTab({ onAddToKanban }) {
  const [activeView, setActiveView] = useState("주제문");
  const [topics, setTopics] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [analyzingTopics, setAnalyzingTopics] = useState(false);
  const [analyzingQuestions, setAnalyzingQuestions] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [doctorSearchQuery, setDoctorSearchQuery] = useState("");
  const [doctorResults, setDoctorResults] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState(null);

  const fetchTopics = useCallback(() => {
    setLoadingTopics(true);
    fetch(`${API}/topics?limit=100`)
      .then(r => r.json())
      .then(d => { setTopics(d.topics || []); setLoadingTopics(false); })
      .catch(() => setLoadingTopics(false));
  }, []);

  const fetchQuestions = useCallback(() => {
    setLoadingQuestions(true);
    fetch(`${API}/questions?limit=100`)
      .then(r => r.json())
      .then(d => { setQuestions(d.questions || []); setLoadingQuestions(false); })
      .catch(() => setLoadingQuestions(false));
  }, []);

  useEffect(() => {
    fetchTopics();
    fetchQuestions();
  }, [fetchTopics, fetchQuestions]);

  // 뷰 전환 시 선택 초기화
  useEffect(() => { setSelectedIds(new Set()); }, [activeView]);

  const handleAnalyzeTopics = async () => {
    setAnalyzingTopics(true);
    try {
      const res = await fetch(`${API}/analyze-topics`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert(`주제문 ${data.added}개 추가되었습니다.`);
      fetchTopics();
    } catch (e) {
      alert("분석 실패: " + e.message);
    }
    setAnalyzingTopics(false);
  };

  const handleAnalyzeQuestions = async () => {
    setAnalyzingQuestions(true);
    try {
      const res = await fetch(`${API}/analyze-questions`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert(`환자질문 ${data.added}개 추가되었습니다.`);
      fetchQuestions();
    } catch (e) {
      alert("분석 실패: " + e.message);
    }
    setAnalyzingQuestions(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const items = activeView === "주제문" ? topics : questions;
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const handleAddToKanban = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];

    if (activeView === "주제문") {
      const selected = topics.filter(t => selectedIds.has(t.id));
      const cards = selected.map(t => ({
        id: Date.now() + Math.random(),
        column: "아이디어",
        source: "주제문",
        dbId: t.id,
        topic: t.topic,
        description: t.description,
        example_titles: t.example_titles || [],
        related_keywords: t.related_keywords || [],
      }));
      onAddToKanban(cards);
      await fetch(`${API}/topics/mark-used`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, used: true }),
      });
      fetchTopics();
    } else {
      const selected = questions.filter(q => selectedIds.has(q.id));
      const cards = selected.map(q => ({
        id: Date.now() + Math.random(),
        column: "아이디어",
        source: "환자질문",
        dbId: q.id,
        topic: q.content,
        description: `카테고리: ${q.category}`,
        example_titles: [],
        related_keywords: [q.category],
      }));
      onAddToKanban(cards);
      await fetch(`${API}/questions/mark-used`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, used: true }),
      });
      fetchQuestions();
    }
    setSelectedIds(new Set());
  };

  const handleDoctorSearch = async () => {
    const q = selectedIds.size > 0
      ? (activeView === "주제문"
        ? topics.find(t => selectedIds.has(t.id))?.related_keywords?.[0]
        : questions.find(q => selectedIds.has(q.id))?.content?.slice(0, 20))
      : doctorSearchQuery;
    if (!q) return;
    const res = await fetch(`${API}/posts?q=${encodeURIComponent(q)}&limit=10`);
    const data = await res.json();
    setDoctorResults(data.posts || []);
    setDoctorSearchQuery(q);
  };

  const items = activeView === "주제문" ? topics : questions;
  const isLoading = activeView === "주제문" ? loadingTopics : loadingQuestions;

  if (selectedPostId) {
    return (
      <div>
        <PostDetail postId={selectedPostId} onClose={() => setSelectedPostId(null)} />
      </div>
    );
  }

  return (
    <div>
      {/* 상단 버튼 */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", flex: 1 }}>소재 발굴</div>
        <button onClick={handleAnalyzeTopics} disabled={analyzingTopics}
          style={{
            padding: "10px 18px", borderRadius: 8, border: "none", cursor: analyzingTopics ? "not-allowed" : "pointer",
            background: analyzingTopics ? "#ccc" : "#4a6cf7", color: "#fff", fontSize: 13, fontWeight: 600,
          }}>
          {analyzingTopics ? "⏳ 분석 중..." : "✨ 주제문 AI 분석"}
        </button>
        <button onClick={handleAnalyzeQuestions} disabled={analyzingQuestions}
          style={{
            padding: "10px 18px", borderRadius: 8, border: "none", cursor: analyzingQuestions ? "not-allowed" : "pointer",
            background: analyzingQuestions ? "#ccc" : "#eb2f96", color: "#fff", fontSize: 13, fontWeight: 600,
          }}>
          {analyzingQuestions ? "⏳ 분석 중..." : "💬 환자질문 AI 분석"}
        </button>
      </div>

      {/* 뷰 토글 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #f0f0f0", paddingBottom: 0 }}>
        {["주제문", "환자질문"].map(v => (
          <button key={v} onClick={() => setActiveView(v)}
            style={{
              padding: "8px 20px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600,
              background: activeView === v ? "#4a6cf7" : "transparent",
              color: activeView === v ? "#fff" : "#888",
              borderBottom: activeView === v ? "2px solid #4a6cf7" : "none",
              marginBottom: -2,
            }}>
            {v === "주제문" ? `📋 주제문 (${topics.length})` : `💬 환자질문 (${questions.length})`}
          </button>
        ))}
      </div>

      {/* 아이템 목록 */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>불러오는 중...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#bbb" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{activeView === "주제문" ? "📋" : "💬"}</div>
          <div style={{ fontSize: 15, marginBottom: 6 }}>아직 {activeView}이 없습니다</div>
          <div style={{ fontSize: 13 }}>위 "AI 분석" 버튼을 눌러 소재를 추출하세요</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "#555" }}>
              <input type="checkbox"
                checked={selectedIds.size === items.length && items.length > 0}
                onChange={toggleAll} />
              전체 선택 ({selectedIds.size}/{items.length})
            </label>
            <div style={{ fontSize: 12, color: "#999" }}>
              {activeView === "주제문" ? "미사용만 표시 중" : "미사용만 표시 중"}
            </div>
          </div>

          <div style={{ maxHeight: 460, overflowY: "auto", border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
            {items.map((item, idx) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div key={item.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "14px 16px",
                    borderBottom: idx < items.length - 1 ? "1px solid #f5f5f5" : "none",
                    background: isSelected ? "#f0f4ff" : "#fff",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onClick={() => toggleSelect(item.id)}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    {activeView === "주제문" ? (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 4 }}>{item.topic}</div>
                        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5, marginBottom: 6 }}>{item.description}</div>
                        {item.related_keywords?.length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {item.related_keywords.map(k => (
                              <span key={k} style={{ padding: "1px 8px", background: "#f0f4ff", color: "#4a6cf7", borderRadius: 10, fontSize: 11 }}>{k}</span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, color: "#1a1a1a", lineHeight: 1.6, marginBottom: 6 }}>{item.content}</div>
                        <span style={{ padding: "2px 8px", background: "#fff0f6", color: "#eb2f96", borderRadius: 10, fontSize: 11 }}>{item.category}</span>
                      </>
                    )}
                  </div>
                  {item.is_used && (
                    <span style={{ fontSize: 11, color: "#aaa", flexShrink: 0, marginTop: 2 }}>✓사용됨</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 에베 박사 답변 검색 패널 */}
      {doctorResults.length > 0 && (
        <div style={{ marginTop: 20, border: "1px solid #e8e8e8", borderRadius: 10, padding: 16, background: "#fafafa" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: "#333" }}>
            🔍 "{doctorSearchQuery}" 관련 포스트
          </div>
          {doctorResults.map(p => (
            <div key={p.id} onClick={() => setSelectedPostId(p.id)}
              style={{ padding: "8px 12px", marginBottom: 6, borderRadius: 8, cursor: "pointer", fontSize: 13, background: "#fff", border: "1px solid #eee" }}>
              <span style={{ fontWeight: 500 }}>{p.title_ko || p.title_ja}</span>
              <span style={{ color: "#aaa", marginLeft: 8, fontSize: 12 }}>{p.published_at}</span>
            </div>
          ))}
          <button onClick={() => setDoctorResults([])}
            style={{ marginTop: 6, background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 12 }}>
            닫기
          </button>
        </div>
      )}

      {/* 하단 액션 버튼 */}
      <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
        <button onClick={handleAddToKanban} disabled={selectedIds.size === 0}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 8, border: "none", cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
            background: selectedIds.size === 0 ? "#f0f0f0" : "#52c41a", color: selectedIds.size === 0 ? "#aaa" : "#fff",
            fontSize: 14, fontWeight: 600,
          }}>
          📌 선택항목 칸반으로 올리기 ({selectedIds.size})
        </button>
        <button onClick={handleDoctorSearch} disabled={selectedIds.size === 0 && !doctorSearchQuery}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid #1a5fa8", cursor: "pointer",
            background: "#fff", color: "#1a5fa8", fontSize: 14, fontWeight: 600,
          }}>
          👨‍⚕️ 에베 박사 답변 검색
        </button>
      </div>
    </div>
  );
}

// ─── 카드 모달 ──────────────────────────────────
function CardModal({ card, onClose, onUpdate }) {
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!card) return;
    setLoadingPosts(true);
    const keyword = card.related_keywords?.[0] || card.topic?.slice(0, 15);
    fetch(`${API}/posts?q=${encodeURIComponent(keyword)}&limit=5`)
      .then(r => r.json())
      .then(d => { setRelatedPosts(d.posts || []); setLoadingPosts(false); });
  }, [card]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendChat = async (userMsg) => {
    if (!userMsg.trim() || chatLoading) return;
    const newMessages = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const resp = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: `당신은 한국 YouTube 당질제한 콘텐츠 전문가입니다. 현재 주제: "${card.topic}". 관련 키워드: ${card.related_keywords?.join(", ")}`,
          messages: newMessages,
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setChatMessages(prev => [...prev, { role: "assistant", content: data.content }]);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: "assistant", content: `오류: ${e.message}` }]);
    }
    setChatLoading(false);
  };

  const generateScript = async (type) => {
    const title = selectedTitle || card.example_titles?.[0] || card.topic;
    setScriptLoading(true);
    const prompt = type === "shorts"
      ? `YouTube Shorts 스크립트를 작성해줘. 제목: "${title}". 60초 이내, 훅→핵심→CTA 구조. 당질제한 관점에서 한국 시청자 대상.`
      : `YouTube 일반 영상 스크립트를 작성해줘. 제목: "${title}". 5~8분 분량, 인트로→본론(3파트)→아웃트로 구조. 당질제한 관점에서 한국 시청자 대상.`;
    await sendChat(prompt);
    setScriptLoading(false);
  };

  if (!card) return null;

  const sourceBadge = card.source ? SOURCE_BADGE[card.source] : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 900,
        maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{card.topic}</div>
              {sourceBadge && (
                <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: sourceBadge.bg, color: sourceBadge.color }}>
                  {card.source}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{card.description}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={card.column} onChange={e => onUpdate({ ...card, column: e.target.value })}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}>
              {COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>✕</button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div style={{ width: 300, borderRight: "1px solid #eee", padding: 20, overflowY: "auto", flexShrink: 0 }}>
            {card.example_titles?.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 10 }}>📺 예시 제목 (클릭하면 선택)</div>
                {card.example_titles.map((t, i) => (
                  <div key={i} onClick={() => setSelectedTitle(t)}
                    style={{
                      padding: "8px 12px", marginBottom: 6, borderRadius: 8, cursor: "pointer", fontSize: 13,
                      background: selectedTitle === t ? "#4a6cf7" : "#f5f6f9",
                      color: selectedTitle === t ? "#fff" : "#333",
                      border: selectedTitle === t ? "1px solid #4a6cf7" : "1px solid #e8e8e8",
                    }}>
                    {t}
                  </div>
                ))}
              </>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: card.example_titles?.length > 0 ? 16 : 0, marginBottom: 20 }}>
              <button onClick={() => generateScript("shorts")} disabled={scriptLoading}
                style={{ flex: 1, padding: "8px 4px", background: "#ff4757", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                📱 쇼츠
              </button>
              <button onClick={() => generateScript("long")} disabled={scriptLoading}
                style={{ flex: 1, padding: "8px 4px", background: "#4a6cf7", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                🎬 일반 영상
              </button>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 10 }}>🔗 관련 포스트</div>
            {loadingPosts
              ? <div style={{ color: "#aaa", fontSize: 13 }}>불러오는 중...</div>
              : relatedPosts.map(p => (
                <div key={p.id} onClick={() => setSelectedPost(p.id)}
                  style={{ padding: "8px 10px", marginBottom: 6, borderRadius: 8, cursor: "pointer", fontSize: 12, background: "#f9f9f9", border: "1px solid #eee" }}>
                  {p.title_ko || p.title_ja}
                </div>
              ))
            }

            {card.related_keywords?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>키워드</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {card.related_keywords.map(k => (
                    <span key={k} style={{ padding: "2px 8px", background: "#f0f4ff", color: "#4a6cf7", borderRadius: 12, fontSize: 11 }}>{k}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {selectedPost ? (
              <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                <button onClick={() => setSelectedPost(null)}
                  style={{ marginBottom: 16, background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
                  ← 채팅으로 돌아가기
                </button>
                <PostDetail postId={selectedPost} onClose={() => setSelectedPost(null)} />
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                  {chatMessages.length === 0 && (
                    <div style={{ textAlign: "center", color: "#bbb", padding: 40, fontSize: 14 }}>
                      💬 AI에게 질문하거나 위 버튼으로 스크립트를 생성하세요
                    </div>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} style={{ marginBottom: 16, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "80%", padding: "12px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.7,
                        background: m.role === "user" ? "#4a6cf7" : "#f5f6f9",
                        color: m.role === "user" ? "#fff" : "#222",
                        whiteSpace: "pre-wrap",
                      }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && <div style={{ color: "#aaa", fontSize: 13, padding: "8px 0" }}>AI 응답 중...</div>}
                  <div ref={chatEndRef} />
                </div>
                <div style={{ padding: "12px 20px", borderTop: "1px solid #eee", display: "flex", gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat(chatInput)}
                    placeholder="AI에게 질문... (Enter 전송)"
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, outline: "none" }}
                  />
                  <button onClick={() => sendChat(chatInput)} disabled={chatLoading}
                    style={{ padding: "10px 20px", background: "#4a6cf7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>
                    전송
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 칸반 보드 탭 ───────────────────────────────
function KanbanBoard({ externalCards, onExternalCardsConsumed }) {
  const [cards, setCards] = useState(loadCards);
  const [selectedCard, setSelectedCard] = useState(null);
  const [dragCard, setDragCard] = useState(null);

  // 소재발굴 탭에서 추가된 카드 반영
  useEffect(() => {
    if (externalCards && externalCards.length > 0) {
      const next = [...cards, ...externalCards];
      setCards(next);
      saveCards(next);
      onExternalCardsConsumed();
    }
  }, [externalCards]);

  const updateCards = (updated) => {
    setCards(updated);
    saveCards(updated);
  };

  const updateCard = (updated) => {
    const next = cards.map(c => c.id === updated.id ? updated : c);
    updateCards(next);
    setSelectedCard(updated);
  };

  const deleteCard = (id) => {
    updateCards(cards.filter(c => c.id !== id));
    setSelectedCard(null);
  };

  const onDragStart = (card) => setDragCard(card);
  const onDropColumn = (col) => {
    if (!dragCard) return;
    updateCards(cards.map(c => c.id === dragCard.id ? { ...c, column: col } : c));
    setDragCard(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>칸반 보드</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>소재발굴 탭에서 추가하거나 드래그로 이동하세요</div>
        </div>
        {cards.length > 0 && (
          <button onClick={() => { if (window.confirm("모든 카드를 삭제하시겠습니까?")) updateCards([]); }}
            style={{ padding: "10px 18px", background: "#fff", color: "#ff4757", border: "1px solid #ff4757", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
            초기화
          </button>
        )}
      </div>

      {cards.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#bbb" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📌</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>아직 카드가 없습니다</div>
          <div style={{ fontSize: 13 }}>소재발굴 탭에서 항목을 선택 후 "칸반으로 올리기"를 눌러보세요</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {COLUMNS.map(col => (
          <div key={col}
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDropColumn(col)}
            style={{
              background: COLUMN_COLORS[col], borderRadius: 12, padding: 16,
              borderTop: `3px solid ${COLUMN_BORDER[col]}`, minHeight: 400,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, color: COLUMN_BORDER[col], marginBottom: 12 }}>
              {col} <span style={{ fontWeight: 400, color: "#999", fontSize: 12 }}>({cards.filter(c => c.column === col).length})</span>
            </div>
            {cards.filter(c => c.column === col).map(card => {
              const badge = card.source ? SOURCE_BADGE[card.source] : null;
              return (
                <div key={card.id}
                  draggable
                  onDragStart={() => onDragStart(card)}
                  onClick={() => setSelectedCard(card)}
                  style={{
                    background: "#fff", borderRadius: 10, padding: "12px 14px",
                    marginBottom: 10, cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.08)"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", flex: 1 }}>{card.topic}</div>
                    <button onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                      style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 14, marginLeft: 4, flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", lineHeight: 1.5, marginBottom: 6 }}>
                    {card.description?.slice(0, 60)}{card.description?.length > 60 ? "..." : ""}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    {badge && (
                      <span style={{ padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>
                        {card.source}
                      </span>
                    )}
                    {card.related_keywords?.slice(0, 2).map(k => (
                      <span key={k} style={{ padding: "1px 6px", background: "#f0f4ff", color: "#4a6cf7", borderRadius: 8, fontSize: 10 }}>{k}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} onUpdate={updateCard} />
      )}
    </div>
  );
}

// ─── 메인 App ───────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("search");
  const [pendingKanbanCards, setPendingKanbanCards] = useState([]);

  const handleAddToKanban = (cards) => {
    setPendingKanbanCards(cards);
    setTab("kanban");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ background: "#1a2340", color: "#fff", padding: "20px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#8899bb", marginBottom: 4 }}>DR. EBE BLOG ARCHIVE</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>ドクター江部 당질제한 아카이브</h1>
          <div style={{ fontSize: 13, color: "#8899bb", marginTop: 4 }}>2007–2026 · 전체 포스트 검색 · 원문/번역 병기</div>

          <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
            {[
              { key: "search", label: "🔍 검색" },
              { key: "mining", label: "💡 소재발굴" },
              { key: "kanban", label: "📌 칸반보드" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  padding: "8px 20px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                  background: tab === t.key ? "#f5f6f9" : "transparent",
                  color: tab === t.key ? "#1a2340" : "#8899bb",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {tab === "search" && <SearchTab />}
        {tab === "mining" && <ContentMiningTab onAddToKanban={handleAddToKanban} />}
        {tab === "kanban" && (
          <KanbanBoard
            externalCards={pendingKanbanCards}
            onExternalCardsConsumed={() => setPendingKanbanCards([])}
          />
        )}
      </div>
    </div>
  );
}
