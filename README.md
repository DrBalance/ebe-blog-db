# ドクター江部 블로그 아카이브 시스템

당질제한 YouTube 소재용 — 전체 블로그 크롤링 + 번역 + 검색 웹앱

---

## 구조

```
ebe-blog-db/
├── crawler/         Python 크롤러 (1회성 실행)
│   └── crawl.py
├── backend/         Node.js API (Railway 배포)
│   ├── index.js
│   └── package.json
└── frontend/        React 검색 UI (Cloudflare Pages 배포)
    ├── src/App.jsx
    └── package.json
```

---

## STEP 1 — 크롤러 실행 (로컬)

### 설치
```bash
cd crawler
pip install requests beautifulsoup4 deep-translator psycopg2-binary python-dotenv
```

### .env 파일 생성
```
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/DBNAME
```

### 실행 순서

**① 먼저 테스트 (DB 없이, 최근 5개만)**
```bash
python crawl.py --test
# → test_output.json 생성 확인
```

**② 특정 월만 테스트**
```bash
python crawl.py --month 202607
```

**③ 전체 크롤링 (수 시간 소요)**
```bash
nohup python crawl.py --all > crawl.log 2>&1 &
# 백그라운드 실행, crawl.log로 진행상황 확인
tail -f crawl.log
```

> 재실행 시 이미 완료된 포스트는 자동 스킵됩니다.

---

## STEP 2 — Railway 백엔드 배포

```bash
cd backend
npm install

# Railway에서 환경변수 설정
# DATABASE_URL = Railway PostgreSQL URL

# 배포
railway up
```

---

## STEP 3 — Cloudflare Pages 프론트엔드 배포

```bash
cd frontend
npm install

# .env.local 생성
echo "VITE_API_URL=https://your-railway-api.up.railway.app" > .env.local

# 빌드
npm run build

# Cloudflare Pages에 dist/ 폴더 업로드
```

---

## 기능

| 기능 | 설명 |
|------|------|
| 키워드 검색 | 한국어 + 일본어 동시 검색 |
| 카테고리 필터 | 케톤체, 인슐린, 합병증 등 |
| 연도 필터 | 2007~2026 |
| 원문/번역 토글 | 포스트 상세에서 일본어 원문 표시 |
| 댓글 표시 | 박사 답변 파란색 하이라이트 |
| 페이지네이션 | 20개씩 |

---

## 번역 비용 예상

| 대상 | 예상 글자수 | Google Translate 비용 |
|------|------------|----------------------|
| 포스트 본문 | 약 2천만자 | ~$10 |
| 댓글 | 약 1천만자 | ~$5 |
| **합계** | **약 3천만자** | **~$15** |

> Google Translate API: 첫 500,000자 무료, 이후 $20/100만자

---

## 향후 확장

- [ ] YouTube 아이디어 메모 기능 (포스트별 메모 저장)
- [ ] pgvector 연동 → 의미 기반 검색 ("인슐린 저항성과 비만")
- [ ] 카테고리별 포스트 요약 자동 생성
- [ ] 즐겨찾기 / 북마크 기능
