"""
포스트 본문 기반 주제문 배치 분석기
- posts 테이블 전체를 순회하며 Claude로 주제문 3~5개 추출
- topics 테이블에 post_id 포함 저장
- 이미 처리된 포스트는 스킵 (재실행 안전)

사용법:
  python analyze_topics.py             # 전체 실행
  python analyze_topics.py --limit 50  # 50개만 테스트
  nohup python -u analyze_topics.py > topics.log 2>&1 &
"""

import os
import re
import sys
import json
import time
import argparse
import psycopg2
from dotenv import load_dotenv
import anthropic

load_dotenv()

DB_URL = os.environ['DATABASE_URL']
API_KEY = os.environ['ANTHROPIC_API_KEY']

client = anthropic.Anthropic(api_key=API_KEY)


def init_db(conn):
    cur = conn.cursor()
    # post_id 컬럼이 없으면 추가
    cur.execute("""
        ALTER TABLE topics ADD COLUMN IF NOT EXISTS post_id INTEGER
    """)
    conn.commit()
    cur.close()


def already_processed(cur, post_id):
    cur.execute("SELECT 1 FROM topics WHERE post_id = %s LIMIT 1", [post_id])
    return cur.fetchone() is not None


def extract_topics(content_ko, title_ko):
    """Claude로 주제문 3~5개 추출. [{topic_sentence, keywords[]}] 반환"""
    content_preview = content_ko[:2500].strip()
    if not content_preview:
        return []

    prompt = f"""다음 당질제한 블로그 포스트에서 한국 YouTube 콘텐츠 소재가 될 수 있는 핵심 주제문 3~5개를 추출해주세요.
주제문은 시청자가 궁금해할 만한 형태로 다듬어 주세요.

반드시 순수 JSON 배열만 출력하세요. 마크다운, 코드블록 없이:
[{{"topic_sentence":"주제문","keywords":["키워드1","키워드2","키워드3"]}}]

제목: {title_ko}
본문:
{content_preview}"""

    for attempt in range(3):
        try:
            msg = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=1024,
                messages=[{'role': 'user', 'content': prompt}]
            )
            raw = msg.content[0].text.strip()
            raw = raw.replace('```json', '').replace('```', '').strip()

            try:
                topics = json.loads(raw)
            except Exception:
                match = re.search(r'\[[\s\S]*\]', raw)
                if not match:
                    return []
                topics = json.loads(match.group())

            if not isinstance(topics, list):
                return []
            return topics

        except Exception as e:
            if attempt < 2:
                print(f" [재시도 {attempt+1}]", end="", flush=True)
                time.sleep(3)
            else:
                print(f" [API 오류: {e}]", end="", flush=True)
                return []
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0, help='처리할 포스트 수 (0=전체)')
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    init_db(conn)
    cur = conn.cursor()

    # 아직 처리 안 된 포스트만 가져오기
    limit_clause = f"LIMIT {args.limit}" if args.limit > 0 else ""
    cur.execute(f"""
        SELECT p.id, p.title_ko, p.content_ko
        FROM posts p
        WHERE p.content_ko IS NOT NULL
          AND p.content_ko != ''
          AND p.title_ko IS NOT NULL
          AND p.title_ko != ''
          AND NOT EXISTS (
              SELECT 1 FROM topics t WHERE t.post_id = p.id
          )
        ORDER BY p.published_at DESC
        {limit_clause}
    """)
    posts = cur.fetchall()
    total = len(posts)

    if total == 0:
        print("처리할 포스트가 없습니다. (이미 모두 완료되었거나 DB가 비어있음)")
        cur.close()
        conn.close()
        return

    print(f"처리 대상 포스트: {total}개")
    print("=" * 60)

    total_topics = 0

    for i, (post_id, title_ko, content_ko) in enumerate(posts, 1):
        title_preview = (title_ko or "")[:40]
        print(f"[{i}/{total}] {title_preview}... ", end="", flush=True)

        topics = extract_topics(content_ko or "", title_ko or "")

        if not topics:
            print("→ 추출 실패/스킵")
            time.sleep(0.5)
            continue

        count = 0
        try:
            for t in topics:
                if not isinstance(t, dict):
                    continue
                topic_sentence = t.get('topic_sentence', '').strip()
                keywords = t.get('keywords', [])
                if not topic_sentence:
                    continue

                cur.execute("""
                    INSERT INTO topics (topic, related_keywords, post_id)
                    VALUES (%s, %s, %s)
                """, [
                    topic_sentence,
                    json.dumps(keywords, ensure_ascii=False),
                    post_id
                ])
                count += 1

            conn.commit()
            total_topics += count
            print(f"→ 주제문 {count}개 저장")

        except Exception as e:
            conn.rollback()
            print(f"→ DB 저장 오류: {e}")

        time.sleep(0.5)

    print("=" * 60)
    print(f"완료! 총 {total_topics}개 주제문 저장 ({total}개 포스트 처리)")
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
