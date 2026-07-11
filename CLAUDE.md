# ebe-blog-db — Claude Code 작업 지침

## 프로젝트 개요

ドクター江部 (에베 코지) 의사의 당질제한 블로그를 전체 크롤링하여
일본어 원문 + 한국어 번역을 PostgreSQL DB에 저장하고,
React 검색 웹앱으로 제공하는 시스템.

- 블로그: https://koujiebe.blog.fc2.com
- 기간: 2007년 2월 ~ 현재 (약 7,100개 포스트)
- 용도: 당질제한 YouTube 콘텐츠 소재 아카이브

---

## 디렉토리 구조

```
ebe-blog-db/
├── CLAUDE.md              ← 이 파일
├── crawler/
│   ├── crawl.py           ← 메인 크롤러 (Python)
│   ├── requirements.txt
│   └── .env               ← DATABASE_URL 설정 (직접 생성)
├── backend/
│   ├── index.js           ← Node.js 검색 API
│   └── package.json
└── frontend/
    ├── src/App.jsx        ← React 검색 UI
    ├── index.html
    └── package.json
```

---

## 환경 설정 (처음 1회)

### 1. Python 패키지 설치
```bash
cd crawler
pip install -r requirements.txt
```

### 2. .env 파일 생성
```bash
# crawler/.env
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/DBNAME
```

---

## 작업 순서

### PHASE 1 — 크롤러 테스트 ✅ 여기서 시작

**목표:** 최근 5개 포스트를 크롤링해서 파싱/번역이 올바른지 확인

```bash
cd crawler
python crawl.py --test
```

**확인 사항:**
- `test_output.json` 생성 여부
- `title_ja`, `title_ko` 정상 출력
- `content_ja`, `content_ko` 정상 출력
- `comments` 배열에 댓글 파싱 여부
- `is_doctor_reply` 에베 박사 답글 감지 여부

**문제 발생 시:**
- 파싱 실패 → `crawl.py`의 CSS 셀렉터 확인 후 수정
- 번역 실패 → deep-translator rate limit → `time.sleep` 값 늘리기
- 댓글 0개 → FC2 댓글 HTML 구조 재확인 필요


### PHASE 2 — DB 연결 테스트

```bash
python crawl.py --month 202607
```

**확인 사항:**
- DB 테이블 자동 생성 (`posts`, `comments`)
- 포스트 저장 및 upsert 동작
- 재실행 시 스킵 동작 확인


### PHASE 3 — 전체 크롤링 (백그라운드)

```bash
nohup python crawl.py --all > crawl.log 2>&1 &
tail -f crawl.log
```

---

## 크롤러 핵심 로직 (`crawl.py`)

### 파싱 포인트 (FC2 블로그 구조)
- 포스트 목록: `a[href*="blog-entry-"]`
- 제목: `h2.entry-title` 또는 `h2`
- 본문: `div.entry-body` 또는 `div.entry_body`
- 댓글 영역: `div#comment` 또는 `div.comment`
- 박사 답글 감지: author에 `江部` 또는 `ドクター` 포함 여부

### 번역
- `deep_translator.GoogleTranslator(source='ja', target='ko')`
- 2000자 단위로 청크 분할 (Google 5000자 제한 대응)
- 청크 간 `time.sleep(0.4)` (rate limit 방지)

### DB upsert
- `ON CONFLICT (id) DO UPDATE` — 재실행 안전
- `already_crawled()` 함수로 완료된 포스트 스킵

---

## 수정 작업 규칙

1. **파일 수정 전 반드시 현재 내용 확인**
2. **가정으로 CSS 셀렉터 수정 금지** — 실제 HTML 확인 후 수정
3. **번역 테스트는 소량으로** (비용/속도)
4. **DB 스키마 변경 시** 기존 테이블 DROP 후 재생성

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `0개 URL 발견` | FC2 HTML 구조 상이 | requests로 raw HTML 출력 후 셀렉터 재확인 |
| 댓글 0개 | 댓글 div ID/class 상이 | 개별 포스트 HTML에서 댓글 구조 직접 확인 |
| 번역 빈 문자열 | rate limit | sleep 값 0.4 → 1.0으로 증가 |
| DB 연결 실패 | .env 미설정 | crawler/.env에 DATABASE_URL 확인 |
| `already_crawled` 항상 False | DB 비어있음 | 정상 동작, 첫 실행 시 당연함 |

---

## 첫 실행 체크리스트

- [ ] `pip install -r requirements.txt` 완료
- [ ] `crawler/.env` 에 `DATABASE_URL` 설정
- [ ] `python crawl.py --test` 실행
- [ ] `test_output.json` 열어서 번역 품질 확인
- [ ] 댓글 파싱 정상 여부 확인
- [ ] 이상 없으면 `--month 202607` 로 DB 연결 테스트
- [ ] 최종 확인 후 `--all` 전체 실행
