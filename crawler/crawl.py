"""
ドクター江部 블로그 전체 크롤러
- FC2 블로그 포스트 + 댓글 수집
- Google Translate로 일→한 번역
- PostgreSQL에 저장

사용법:
  pip install requests beautifulsoup4 deep-translator psycopg2-binary python-dotenv
  python crawl.py --test        # 최근 5개 포스트만 테스트
  python crawl.py --month 202607  # 특정 월만
  python crawl.py --all           # 전체 (수 시간 소요)
"""

import os
import re
import time
import argparse
import json
import requests
import psycopg2
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://koujiebe.blog.fc2.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

translator = GoogleTranslator(source='ja', target='ko')


# ─────────────────────────────────────────────
# 번역
# ─────────────────────────────────────────────

def translate(text: str) -> str:
    """일본어 → 한국어 (2000자 청크 분할, 실패 시 최대 3회 재시도)"""
    if not text or not text.strip():
        return ""
    chunks = [text[i:i+2000] for i in range(0, len(text), 2000)]
    parts = []
    for chunk in chunks:
        for attempt in range(3):
            try:
                parts.append(translator.translate(chunk))
                time.sleep(1.0)
                break
            except Exception as e:
                print(f"    ⚠️  번역 실패 (시도 {attempt+1}/3): {e}")
                if attempt < 2:
                    time.sleep(2)
                else:
                    parts.append("")
    return "\n".join(parts)


# ─────────────────────────────────────────────
# 크롤링
# ─────────────────────────────────────────────

def fetch(url: str) -> BeautifulSoup:
    res = requests.get(url, headers=HEADERS, timeout=20)
    res.encoding = 'utf-8'
    return BeautifulSoup(res.text, 'html.parser')


def get_post_urls_from_page(soup: BeautifulSoup) -> list[str]:
    """페이지에서 포스트 URL 추출"""
    urls = []
    seen = set()
    for a in soup.find_all('a', href=True):
        href = a['href']
        if re.search(r'blog-entry-\d+\.html', href):
            # 절대 URL 정규화
            if not href.startswith('http'):
                href = BASE_URL + href
            # 앵커 제거
            href = href.split('#')[0]
            if href not in seen:
                seen.add(href)
                urls.append(href)
    return urls


def get_monthly_post_urls(year: int, month: int) -> list[str]:
    """월별 아카이브 페이지에서 포스트 URL 목록 수집"""
    archive_url = f"{BASE_URL}/blog-date-{year:04d}{month:02d}.html"
    print(f"  📅 아카이브: {archive_url}")
    soup = fetch(archive_url)
    urls = get_post_urls_from_page(soup)

    # 페이지네이션 처리
    page = 2
    while True:
        paginated = f"{BASE_URL}/blog-date-{year:04d}{month:02d}-p{page}.html"
        try:
            s = fetch(paginated)
            new_urls = get_post_urls_from_page(s)
            if not new_urls:
                break
            urls.extend(new_urls)
            page += 1
            time.sleep(1)
        except Exception:
            break

    return list(dict.fromkeys(urls))  # 중복 제거


def parse_post(url: str) -> dict:
    """개별 포스트 파싱"""
    soup = fetch(url)

    post_id_match = re.search(r'blog-entry-(\d+)', url)
    post_id = post_id_match.group(1) if post_id_match else None

    # FC2 실제 구조: EntryBlock > EntryTitle / EntryBody / EntryDateTop
    entry_block = soup.find('div', class_='EntryBlock')

    # 제목
    title_tag = entry_block.find('div', class_='EntryTitle') if entry_block else None
    title_ja = title_tag.get_text(strip=True) if title_tag else ""

    # 본문
    body_tag = entry_block.find('div', class_='EntryBody') if entry_block else None
    content_ja = body_tag.get_text("\n", strip=True) if body_tag else ""

    # 게시일
    date_tag = entry_block.find('div', class_='EntryDateTop') if entry_block else None
    published_at = date_tag.get_text(strip=True) if date_tag else ""

    # 카테고리
    cat_tag = soup.find('a', href=re.compile(r'blog-category'))
    category = cat_tag.get_text(strip=True) if cat_tag else ""

    # 댓글
    comments = parse_comments(soup)

    return {
        "id": post_id,
        "url": url,
        "title_ja": title_ja,
        "content_ja": content_ja,
        "published_at": published_at,
        "category": category,
        "comments": comments,
    }


def parse_comments(soup: BeautifulSoup) -> list[dict]:
    """댓글 파싱 — FC2 구조: EntryBlock(EntryTitle2=コメント) > CTBody + Date 쌍"""
    comments = []

    # 두 번째 EntryBlock이 댓글 영역 (EntryTitle2 = "コメント")
    comment_block = None
    for block in soup.find_all('div', class_='EntryBlock'):
        t2 = block.find('div', class_='EntryTitle2')
        if t2 and 'コメント' in t2.get_text():
            comment_block = block
            break
    if not comment_block:
        return comments

    bodies = comment_block.find_all('div', class_='CTBody')
    dates  = comment_block.find_all('div', class_='Date')
    # 마지막 CTBody는 댓글 작성 폼(Date 없음)이므로 Date 수만큼만 사용
    bodies = bodies[:len(dates)]

    for i, body_tag in enumerate(bodies):
        content_ja = body_tag.get_text("\n", strip=True)
        if not content_ja.strip():
            continue

        # Date 텍스트 형식: "2026/07/01(Wed) 23:19 | URL | 作者名 | 【 編集 】"
        posted_at = ""
        author = f"독자{i+1}"
        if i < len(dates):
            date_text = dates[i].get_text(" ", strip=True)
            posted_at = date_text
            parts = [p.strip() for p in date_text.split('|')]
            if len(parts) >= 3:
                author = parts[2]

        is_doctor = bool(re.search(r'江部|ドクター|Dr\.', author))

        comments.append({
            "comment_no": i + 1,
            "author": author,
            "content_ja": content_ja,
            "posted_at": posted_at,
            "is_doctor_reply": is_doctor,
        })

    return comments


# ─────────────────────────────────────────────
# DB
# ─────────────────────────────────────────────

def get_db():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def init_db():
    """테이블 생성"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id           TEXT PRIMARY KEY,
            url          TEXT NOT NULL,
            title_ja     TEXT,
            title_ko     TEXT,
            content_ja   TEXT,
            content_ko   TEXT,
            published_at TEXT,
            category     TEXT,
            crawled_at   TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS comments (
            id             SERIAL PRIMARY KEY,
            post_id        TEXT REFERENCES posts(id) ON DELETE CASCADE,
            comment_no     INT,
            author         TEXT,
            content_ja     TEXT,
            content_ko     TEXT,
            posted_at      TEXT,
            is_doctor_reply BOOLEAN DEFAULT FALSE
        );

        -- 전문검색 인덱스 (한국어 + 일본어)
        CREATE INDEX IF NOT EXISTS idx_posts_title_ko  ON posts USING GIN(to_tsvector('simple', coalesce(title_ko, '')));
        CREATE INDEX IF NOT EXISTS idx_posts_content_ko ON posts USING GIN(to_tsvector('simple', coalesce(content_ko, '')));
        CREATE INDEX IF NOT EXISTS idx_posts_category  ON posts(category);
        CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ DB 테이블 초기화 완료")


def save_post(post: dict):
    """포스트 + 댓글 DB 저장 (upsert)"""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO posts (id, url, title_ja, title_ko, content_ja, content_ko, published_at, category)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                title_ko   = EXCLUDED.title_ko,
                content_ko = EXCLUDED.content_ko,
                crawled_at = NOW()
        """, (
            post['id'], post['url'],
            post['title_ja'], post.get('title_ko', ''),
            post['content_ja'], post.get('content_ko', ''),
            post['published_at'], post['category']
        ))

        # 댓글: 해당 포스트 기존 댓글 삭제 후 재삽입
        cur.execute("DELETE FROM comments WHERE post_id = %s", (post['id'],))
        for c in post.get('comments', []):
            cur.execute("""
                INSERT INTO comments (post_id, comment_no, author, content_ja, content_ko, posted_at, is_doctor_reply)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                post['id'], c['comment_no'], c['author'],
                c['content_ja'], c.get('content_ko', ''),
                c.get('posted_at', ''), c['is_doctor_reply']
            ))

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()


def already_crawled(post_id: str) -> bool:
    """이미 크롤링된 포스트인지 확인 (재실행 시 스킵)"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM posts WHERE id = %s AND content_ko != ''", (post_id,))
    exists = cur.fetchone() is not None
    cur.close()
    conn.close()
    return exists


# ─────────────────────────────────────────────
# 월별 아카이브 목록
# ─────────────────────────────────────────────

ARCHIVE_MONTHS = [
    (2007, m) for m in range(2, 13)
] + [
    (y, m)
    for y in range(2008, 2027)
    for m in range(1, 13)
    if not (y == 2026 and m > 7)  # 2026년 7월까지
]


# ─────────────────────────────────────────────
# 메인 실행
# ─────────────────────────────────────────────

def process_post(url: str, save_to_db: bool = True):
    post_id_match = re.search(r'blog-entry-(\d+)', url)
    post_id = post_id_match.group(1) if post_id_match else None

    if save_to_db and post_id and already_crawled(post_id):
        print(f"  ⏭️  스킵 (이미 완료): {post_id}")
        return None

    post = parse_post(url)
    if not post['title_ja']:
        print(f"  ⚠️  제목 없음, 스킵")
        return None

    print(f"  제목: {post['title_ja'][:40]}")
    print(f"  본문: {len(post['content_ja'])}자 / 댓글: {len(post['comments'])}개")
    print(f"  번역 중...")

    post['title_ko'] = translate(post['title_ja'])
    post['content_ko'] = translate(post['content_ja'])

    for c in post['comments']:
        c['content_ko'] = translate(c['content_ja'])
        time.sleep(1.0)

    if save_to_db:
        save_post(post)
        print(f"  ✅ DB 저장 완료")
    else:
        print(f"  ✅ 번역 완료: {post['title_ko'][:40]}")

    return post


def run_test():
    """테스트: 최근 5개만, DB 없이 JSON 출력"""
    print("🧪 테스트 모드 (최근 5개 포스트, DB 미사용)\n")
    soup = fetch(BASE_URL)
    urls = get_post_urls_from_page(soup)[:5]
    print(f"수집된 URL {len(urls)}개\n")

    results = []
    for i, url in enumerate(urls):
        print(f"[{i+1}/5] {url}")
        post = process_post(url, save_to_db=False)
        if post:
            results.append(post)
        time.sleep(2)

    with open("test_output.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 test_output.json 저장 완료")


def run_month(year: int, month: int):
    """특정 월 크롤링"""
    init_db()
    print(f"\n📅 {year}년 {month}월 크롤링 시작\n")
    urls = get_monthly_post_urls(year, month)
    print(f"  포스트 {len(urls)}개 발견\n")

    for i, url in enumerate(urls):
        print(f"[{i+1}/{len(urls)}] {url}")
        try:
            process_post(url, save_to_db=True)
        except Exception as e:
            print(f"  ❌ 오류: {e}")
        time.sleep(2)


def run_all():
    """전체 크롤링"""
    init_db()
    total = len(ARCHIVE_MONTHS)
    print(f"\n🚀 전체 크롤링 시작 ({total}개 월)\n")

    for i, (year, month) in enumerate(ARCHIVE_MONTHS):
        print(f"\n{'='*50}")
        print(f"[{i+1}/{total}] {year}년 {month}월")
        print('='*50)
        try:
            urls = get_monthly_post_urls(year, month)
            print(f"  포스트 {len(urls)}개")
            for url in urls:
                try:
                    process_post(url, save_to_db=True)
                except Exception as e:
                    print(f"  ❌ 포스트 오류: {e}")
                time.sleep(2)
        except Exception as e:
            print(f"  ❌ 월 오류: {e}")
        time.sleep(3)

    print("\n🎉 전체 크롤링 완료!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="江部 블로그 크롤러")
    parser.add_argument("--test",  action="store_true", help="최근 5개 테스트")
    parser.add_argument("--month", type=str, help="특정 월 (예: 202607)")
    parser.add_argument("--all",   action="store_true", help="전체 크롤링")
    args = parser.parse_args()

    if args.test:
        run_test()
    elif args.month:
        y, m = int(args.month[:4]), int(args.month[4:])
        run_month(y, m)
    elif args.all:
        run_all()
    else:
        parser.print_help()
