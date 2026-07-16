/**
 * 江部 블로그 DB — 검색 API
 * Railway Node.js 배포용
 *
 * 엔드포인트:
 *   GET /posts            - 목록 (검색, 필터, 페이지네이션)
 *   GET /posts/:id        - 포스트 상세 (댓글 포함)
 *   GET /categories       - 카테고리 목록
 *   GET /stats            - 전체 통계
 */

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());


// ─────────────────────────────────────────────
// GET /posts
// query: q, category, year, month, page, limit, doctor_only
// ─────────────────────────────────────────────
app.get('/posts', async (req, res) => {
  try {
    const {
      q,            // 검색어 (한/일 동시)
      category,     // 카테고리 필터
      year,         // 연도 필터
      month,        // 월 필터
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

    // 키워드 검색 (제목 + 본문, 한국어 + 일본어)
    if (q) {
      conditions.push(`(
        to_tsvector('simple', coalesce(title_ko,'') || ' ' || coalesce(content_ko,''))
          @@ plainto_tsquery('simple', $${pi})
        OR title_ja ILIKE $${pi + 1}
        OR content_ja ILIKE $${pi + 1}
      )`);
      params.push(q, `%${q}%`);
      pi += 2;
    }

    if (category) {
      conditions.push(`category = $${pi}`);
      params.push(category);
      pi++;
    }

    if (year) {
      conditions.push(`published_at LIKE $${pi}`);
      params.push(`${year}%`);
      pi++;
    }

    if (month) {
      conditions.push(`published_at LIKE $${pi}`);
      params.push(`%/${month}/%`);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // 총 건수
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM posts ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // 포스트 목록 (본문 미포함, 요약만)
    const result = await pool.query(
      `SELECT
        id, url, title_ja, title_ko,
        LEFT(content_ko, 200) AS summary_ko,
        LEFT(content_ja, 200) AS summary_ja,
        published_at, category,
        (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) AS comment_count
       FROM posts
       ${where}
       ORDER BY published_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      posts: result.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// GET /posts/:id — 상세 (댓글 포함)
// ─────────────────────────────────────────────
app.get('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const postResult = await pool.query(
      'SELECT * FROM posts WHERE id = $1',
      [id]
    );
    if (!postResult.rows.length) {
      return res.status(404).json({ error: '포스트를 찾을 수 없습니다' });
    }

    const commentsResult = await pool.query(
      `SELECT * FROM comments WHERE post_id = $1 ORDER BY comment_no`,
      [id]
    );

    res.json({
      post: postResult.rows[0],
      comments: commentsResult.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// GET /categories
// ─────────────────────────────────────────────
app.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM posts
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// GET /stats
// ─────────────────────────────────────────────
app.get('/stats', async (req, res) => {
  try {
    const posts = await pool.query('SELECT COUNT(*) FROM posts');
    const comments = await pool.query('SELECT COUNT(*) FROM comments');
    const doctor = await pool.query(
      'SELECT COUNT(*) FROM comments WHERE is_doctor_reply = TRUE'
    );
    const latest = await pool.query(
      'SELECT published_at FROM posts ORDER BY published_at DESC LIMIT 1'
    );
    res.json({
      total_posts: parseInt(posts.rows[0].count),
      total_comments: parseInt(comments.rows[0].count),
      doctor_replies: parseInt(doctor.rows[0].count),
      latest_post: latest.rows[0]?.published_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// GET /analyze — YouTube 주제 AI 분석
// ─────────────────────────────────────────────
app.get('/analyze', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT title_ko, title_ja, category,
             LEFT(content_ko, 300) AS summary
      FROM posts
      WHERE content_ko != ''
      ORDER BY RANDOM()
      LIMIT 100
    `);

    const postList = result.rows
      .map(p => `제목: ${p.title_ko}\n카테고리: ${p.category || '미분류'}\n요약: ${p.summary}`)
      .join('\n\n---\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `아래는 일본 의사 에베 코지(江部康二)의 당질제한 블로그 포스트 100개 샘플입니다.
이 콘텐츠를 바탕으로 한국 YouTube 채널의 당질제한 콘텐츠 주제를 10개 분석해주세요.

응답은 반드시 아래 JSON 배열 형식만 출력하세요. 다른 텍스트 없이 JSON만:
[
  {
    "topic": "주제명 (한국어, 20자 이내)",
    "description": "이 주제가 왜 YouTube 콘텐츠로 좋은지 설명 (2-3문장)",
    "example_titles": ["영상 제목 1", "영상 제목 2", "영상 제목 3", "영상 제목 4", "영상 제목 5"],
    "related_keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
  }
]

포스트 샘플:
${postList}`
      }]
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const topics = JSON.parse(jsonMatch ? jsonMatch[0] : text);

    res.json(topics);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API 서버 실행 중: http://localhost:${PORT}`));
