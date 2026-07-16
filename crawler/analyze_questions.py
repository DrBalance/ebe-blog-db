"""
댓글 질문 배치 분석기
- is_doctor_reply=FALSE 댓글에서 질문 추출 + 유사 질문 클러스터링
- questions 테이블에 저장 (frequency, related_post_ids 포함)
- 이미 처리된 댓글은 스킵 (재실행 안전)

사용법:
  python analyze_questions.py              # 전체 실행
  python analyze_questions.py --batch 100  # 배치당 댓글 수 조정
  nohup python -u analyze_questions.py > questions.log 2>&1 &
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

CATEGORY_LIST = "혈당/당뇨/다이어트/식품/생활습관/기타"


def init_db(conn):
    cur = conn.cursor()
    # questions 테이블에 frequency, related_post_ids 컬럼 추가
    cur.execute("ALTER TABLE questions ADD COLUMN IF NOT EXISTS frequency INTEGER DEFAULT 1")
    cur.execute("ALTER TABLE questions ADD COLUMN IF NOT EXISTS related_post_ids JSONB DEFAULT '[]'")
    # comments 테이블에 처리 여부 플래그 추가
    cur.execute("ALTER TABLE comments ADD COLUMN IF NOT EXISTS questions_analyzed BOOLEAN DEFAULT FALSE")
    conn.commit()
    cur.close()


def get_existing_questions(cur):
    """DB에 이미 저장된 질문 목록 반환 (중복 방지용)"""
    cur.execute("SELECT id, content FROM questions ORDER BY id DESC LIMIT 500")
    return cur.fetchall()


def is_duplicate(new_q, existing_questions, threshold=25):
    """앞 threshold 글자가 일치하면 중복으로 판단"""
    new_prefix = new_q[:threshold].strip()
    for _, existing_content in existing_questions:
        if existing_content[:threshold].strip() == new_prefix:
            return True
    return False


def find_similar_id(new_q, existing_questions, threshold=25):
    """중복 질문의 DB id 반환"""
    new_prefix = new_q[:threshold].strip()
    for eid, existing_content in existing_questions:
        if existing_content[:threshold].strip() == new_prefix:
            return eid
    return None


def extract_questions_from_batch(comments_batch):
    """
    댓글 배치에서 질문 추출 + 유사 질문 클러스터링.
    반환: [{question_ko, frequency, category, related_post_ids[]}]
    """
    comment_lines = []
    for i, (cid, content_ko, post_id) in enumerate(comments_batch, 1):
        preview = (content_ko or "").strip()[:180]
        comment_lines.append(f"[{i}|post:{post_id}] {preview}")

    comment_text = "\n\n".join(comment_lines)

    prompt = f"""다음은 당질제한 의사 블로그의 독자 댓글입니다.
질문이 담긴 댓글만 골라서 YouTube 콘텐츠 소재가 될 수 있는 질문을 추출하세요.
- 질문이 아닌 감사/응원 댓글은 완전히 제외
- 유사한 질문은 하나로 묶어서 frequency를 높이세요
- 질문을 자연스러운 한국어로 다듬어 주세요
- related_post_ids에는 해당 질문이 나온 post ID(숫자만)를 넣으세요

반드시 순수 JSON 배열만 출력하세요. 마크다운, 코드블록 없이:
[{{"question_ko":"질문내용","frequency":1,"category":"{CATEGORY_LIST} 중 1개","related_post_ids":[123,456]}}]

댓글:
{comment_text}"""

    for attempt in range(3):
        try:
            msg = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=4096,
                messages=[{'role': 'user', 'content': prompt}]
            )
            raw = msg.content[0].text.strip()
            raw = raw.replace('```json', '').replace('```', '').strip()

            try:
                questions = json.loads(raw)
            except Exception:
                match = re.search(r'\[[\s\S]*\]', raw)
                if not match:
                    return []
                questions = json.loads(match.group())

            if not isinstance(questions, list):
                return []
            return questions

        except Exception as e:
            if attempt < 2:
                print(f"  [재시도 {attempt+1}: {e}]", flush=True)
                time.sleep(3)
            else:
                print(f"  [API 오류: {e}]", flush=True)
                return []
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', type=int, default=100, help='Claude 1회 호출당 댓글 수 (기본 100)')
    args = parser.parse_args()

    batch_size = max(10, min(args.batch, 200))  # 10~200 사이로 제한

    conn = psycopg2.connect(DB_URL)
    init_db(conn)
    cur = conn.cursor()

    # 전체 미처리 댓글 수 확인
    cur.execute("""
        SELECT COUNT(*) FROM comments
        WHERE is_doctor_reply = FALSE
          AND questions_analyzed = FALSE
          AND content_ko IS NOT NULL
          AND length(content_ko) > 15
    """)
    total_remaining = cur.fetchone()[0]
    print(f"미처리 댓글: {total_remaining}개 (배치 크기: {batch_size})")
    print("=" * 60)

    if total_remaining == 0:
        print("처리할 댓글이 없습니다.")
        cur.close()
        conn.close()
        return

    batch_num = 0
    total_saved = 0
    total_updated = 0
    processed_count = 0

    while True:
        # 다음 배치 가져오기
        cur.execute("""
            SELECT c.id, c.content_ko, c.post_id
            FROM comments c
            WHERE c.is_doctor_reply = FALSE
              AND c.questions_analyzed = FALSE
              AND c.content_ko IS NOT NULL
              AND length(c.content_ko) > 15
            ORDER BY c.id
            LIMIT %s
        """, [batch_size])
        batch = cur.fetchall()

        if not batch:
            break

        batch_num += 1
        comment_ids = [row[0] for row in batch]
        print(f"\n[배치 {batch_num}] 댓글 {len(batch)}개 처리 중...", flush=True)

        # Claude 호출
        questions = extract_questions_from_batch(batch)

        if not questions:
            print("  → 질문 없음 또는 추출 실패")
        else:
            # 기존 질문 목록 가져오기 (중복 체크용)
            existing = get_existing_questions(cur)
            saved = 0
            updated = 0

            for q in questions:
                if not isinstance(q, dict):
                    continue
                question_ko = (q.get('question_ko') or '').strip()
                if not question_ko or len(question_ko) < 10:
                    continue

                frequency = int(q.get('frequency', 1))
                category = (q.get('category') or '기타').strip()
                related_post_ids = q.get('related_post_ids', [])
                if not isinstance(related_post_ids, list):
                    related_post_ids = []
                # 숫자만 필터링
                related_post_ids = [int(x) for x in related_post_ids if str(x).isdigit()]

                sim_id = find_similar_id(question_ko, existing)
                if sim_id:
                    # 기존 질문 frequency 증가, related_post_ids 병합
                    cur.execute("""
                        UPDATE questions
                        SET frequency = frequency + %s,
                            related_post_ids = (
                                SELECT jsonb_agg(DISTINCT v)
                                FROM jsonb_array_elements(related_post_ids || %s::jsonb) AS v
                            )
                        WHERE id = %s
                    """, [frequency, json.dumps(related_post_ids), sim_id])
                    updated += 1
                else:
                    cur.execute("""
                        INSERT INTO questions (content, category, frequency, related_post_ids)
                        VALUES (%s, %s, %s, %s)
                    """, [
                        question_ko, category, frequency,
                        json.dumps(related_post_ids)
                    ])
                    # 새로 삽입한 질문을 existing에 추가 (같은 배치 내 중복 방지)
                    cur.execute("SELECT lastval()")
                    new_id = cur.fetchone()[0]
                    existing.insert(0, (new_id, question_ko))
                    saved += 1

            conn.commit()
            total_saved += saved
            total_updated += updated
            print(f"  → 새 질문 {saved}개 저장, 기존 질문 {updated}개 빈도 업데이트")

        # 처리된 댓글 플래그 업데이트
        cur.execute(
            "UPDATE comments SET questions_analyzed = TRUE WHERE id = ANY(%s)",
            [comment_ids]
        )
        conn.commit()
        processed_count += len(batch)
        print(f"  → 누적 처리: {processed_count}/{total_remaining}", flush=True)

        time.sleep(2)

    print("\n" + "=" * 60)
    print(f"완료! 총 {total_saved}개 질문 저장, {total_updated}개 빈도 업데이트")
    print(f"총 {processed_count}개 댓글 처리")
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
