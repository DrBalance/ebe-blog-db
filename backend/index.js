/**
 * 江部 블로그 DB — 검색 API
 * Railway Node.js 배포용
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
// DB 초기화 (topics, questions 테이블)
// ─────────────────────────────────────────────
async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      topic TEXT NOT NULL,
      description TEXT,
      example_titles JSONB DEFAULT '[]',
      related_keywords JSONB DEFAULT '[]',
      is_used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT DEFAULT '기타',
      is_used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
initTables().catch(console.error);


// ─────────────────────────────────────────────
// GET /posts
// query: q, category, year, month, page, limit
// ─────────────────────────────────────────────
app.get('/posts', async (req, res) => {
  try {
    const {
      q,
      category,
      year,
      month,
      page = 1,
      limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

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

    const countResult = await pool.query(`SELECT COUNT(*) FROM posts ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

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

    res.json({ total, page: parseInt(page), limit: parseInt(limit), posts: result.rows });
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
    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    if (!postResult.rows.length) return res.status(404).json({ error: '포스트를 찾을 수 없습니다' });

    const commentsResult = await pool.query(
      'SELECT * FROM comments WHERE post_id = $1 ORDER BY comment_no',
      [id]
    );
    res.json({ post: postResult.rows[0], comments: commentsResult.rows });
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
    const doctor = await pool.query('SELECT COUNT(*) FROM comments WHERE is_doctor_reply = TRUE');
    const latest = await pool.query('SELECT published_at FROM posts ORDER BY published_at DESC LIMIT 1');
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
// GET /analyze — YouTube 주제 AI 분석 (레거시 호환)
// ─────────────────────────────────────────────
app.get('/analyze', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT title_ko, category FROM posts
      WHERE content_ko != '' AND title_ko != ''
      ORDER BY RANDOM() LIMIT 80
    `);
    const postList = result.rows
      .map(p => `${p.title_ko} [${p.category || '미분류'}]`)
      .join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `다음은 당질제한 의사 에베 코지의 블로그 포스트 제목 목록입니다.
이를 바탕으로 한국 YouTube 채널의 당질제한 콘텐츠 주제 8개를 분석해주세요.

반드시 순수 JSON 배열만 출력하세요. 마크다운, 코드블록, 설명 텍스트 없이 JSON만:
[{"topic":"주제명","description":"설명","example_titles":["제목1","제목2","제목3","제목4","제목5"],"related_keywords":["키워드1","키워드2","키워드3"]}]

포스트 제목:
${postList}`
      }]
    });

    const raw = message.content[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

    let topics;
    try { topics = JSON.parse(raw); }
    catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('AI 응답에서 JSON 배열을 찾을 수 없습니다');
      topics = JSON.parse(match[0]);
    }

    if (!Array.isArray(topics)) throw new Error('AI 응답이 배열 형식이 아닙니다');
    res.json(topics);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// GET /topics — 저장된 주제문 목록
// query: is_used, keyword, page, limit
// ─────────────────────────────────────────────
app.get('/topics', async (req, res) => {
  try {
    const { is_used, keyword, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

    if (is_used !== undefined) {
      conditions.push(`is_used = $${pi}`);
      params.push(is_used === 'true');
      pi++;
    }
    if (keyword) {
      conditions.push(`(topic ILIKE $${pi} OR description ILIKE $${pi})`);
      params.push(`%${keyword}%`);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*) FROM topics ${where}`, params);
    const result = await pool.query(
      `SELECT * FROM topics ${where} ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit), offset]
    );
    res.json({ total: parseInt(countResult.rows[0].count), topics: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// GET /questions — 저장된 환자질문 목록
// query: is_used, category, page, limit
// ─────────────────────────────────────────────
app.get('/questions', async (req, res) => {
  try {
    const { is_used, category, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let pi = 1;

    if (is_used !== undefined) {
      conditions.push(`is_used = $${pi}`);
      params.push(is_used === 'true');
      pi++;
    }
    if (category) {
      conditions.push(`category = $${pi}`);
      params.push(category);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*) FROM questions ${where}`, params);
    const result = await pool.query(
      `SELECT * FROM questions ${where} ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, parseInt(limit), offset]
    );
    res.json({ total: parseInt(countResult.rows[0].count), questions: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// POST /topics/mark-used
// body: { ids: number[], used: boolean }
// ─────────────────────────────────────────────
app.post('/topics/mark-used', async (req, res) => {
  try {
    const { ids, used } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids 배열 필요' });
    await pool.query(`UPDATE topics SET is_used = $1 WHERE id = ANY($2::int[])`, [used !== false, ids]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// POST /questions/mark-used
// body: { ids: number[], used: boolean }
// ─────────────────────────────────────────────
app.post('/questions/mark-used', async (req, res) => {
  try {
    const { ids, used } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids 배열 필요' });
    await pool.query(`UPDATE questions SET is_used = $1 WHERE id = ANY($2::int[])`, [used !== false, ids]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// POST /analyze-topics — 포스트 제목 분석 → topics 테이블 저장
// ─────────────────────────────────────────────
app.post('/analyze-topics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT title_ko, category FROM posts
      WHERE content_ko != '' AND title_ko != ''
      ORDER BY RANDOM() LIMIT 100
    `);
    const postList = result.rows
      .map(p => `${p.title_ko} [${p.category || '미분류'}]`)
      .join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `다음은 당질제한 의사 에베 코지의 블로그 포스트 제목 목록입니다.
이를 바탕으로 한국 YouTube 채널의 당질제한 콘텐츠 주제 10개를 분석해주세요.

반드시 순수 JSON 배열만 출력하세요. 마크다운, 코드블록 없이 JSON만:
[{"topic":"주제명","description":"설명","example_titles":["제목1","제목2","제목3","제목4","제목5"],"related_keywords":["키워드1","키워드2","키워드3"]}]

포스트 제목:
${postList}`
      }]
    });

    const raw = message.content[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

    let topics;
    try { topics = JSON.parse(raw); }
    catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('AI 응답 파싱 실패');
      topics = JSON.parse(match[0]);
    }

    let added = 0;
    for (const t of topics) {
      await pool.query(
        `INSERT INTO topics (topic, description, example_titles, related_keywords)
         VALUES ($1, $2, $3, $4)`,
        [t.topic, t.description || '', JSON.stringify(t.example_titles || []), JSON.stringify(t.related_keywords || [])]
      );
      added++;
    }

    res.json({ added });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// POST /analyze-questions — 댓글에서 환자질문 추출 → questions 테이블 저장
// ─────────────────────────────────────────────
app.post('/analyze-questions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT content_ko FROM comments
      WHERE is_doctor_reply = FALSE
        AND content_ko IS NOT NULL
        AND length(content_ko) > 20
      ORDER BY RANDOM()
      LIMIT 200
    `);

    const commentList = result.rows
      .map((c, i) => `[${i + 1}] ${c.content_ko.slice(0, 200)}`)
      .join('\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `다음은 당질제한 의사 블로그의 독자 댓글입니다.
실제 궁금증이 담긴 질문성 댓글만 골라서 YouTube 콘텐츠 소재로 쓸 수 있는 질문 30개를 추출해주세요.
질문을 한국어로 자연스럽게 다듬어서 출력하세요.

반드시 순수 JSON 배열만 출력하세요. 마크다운, 코드블록 없이 JSON만:
[{"content":"질문내용","category":"혈당/당뇨/다이어트/식품/기타 중 1개"}]

댓글:
${commentList}`
      }]
    });

    const raw = message.content[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

    let questions;
    try { questions = JSON.parse(raw); }
    catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('AI 응답 파싱 실패');
      questions = JSON.parse(match[0]);
    }

    let added = 0;
    for (const q of questions) {
      await pool.query(
        `INSERT INTO questions (content, category) VALUES ($1, $2)`,
        [q.content, q.category || '기타']
      );
      added++;
    }

    res.json({ added });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────
// POST /chat — Anthropic API 프록시
// body: { messages, system }
// ─────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages 배열이 필요합니다' });
    }
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      ...(system && { system }),
      messages,
    });
    res.json({ content: response.content[0].text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API 서버 실행 중: http://localhost:${PORT}`));
