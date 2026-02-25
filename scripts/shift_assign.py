#!/usr/bin/env python3
"""
夜間・週末シフト割当スクリプト

シフト表と提出シートのデータを解析し、指定週の夜間・週末期ブロックと
各講師の稼働可能情報を出力する。
"""

import json
import re
import sys
import argparse
from datetime import datetime, timedelta

# 列インデックスと曜日の対応（シフト表）
WEEKDAY_COL_INDEX = {
    0: 2,  # 月曜日 → インデックス2
    1: 3,  # 火曜日 → インデックス3
    2: 4,  # 水曜日 → インデックス4
    3: 5,  # 木曜日 → インデックス5
    4: 6,  # 金曜日 → インデックス6
    5: 7,  # 土曜日 → インデックス7
}

WEEKDAY_NAMES = ['月', '火', '水', '木', '金', '土']

# 列インデックスとスプレッドシート列文字の対応
COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

# 提出シートの講師列マッピング（インデックス: 講師名）
INSTRUCTOR_COLUMNS = {
    3: 'まりあ',
    4: '河内',
    5: 'たつき',
    6: 'みさみさ',
    7: 'kawasaki',
    8: 'としこ',
    9: 'いしぐろ',
    10: 'ちいかた',
    11: 'えーと',
    12: 'KAZU',
    13: 'りょう',
    14: 'みほりん',
    15: 'たつや',
}


def normalize_date(raw: str) -> str:
    """日付文字列を YYYY/MM/DD 形式に正規化する。
    シフト表: "2025/09/15/(月)" → "2025/09/15"
    提出シート: "2025/10/02(木)" → "2025/10/02"
    """
    m = re.match(r'(\d{4}/\d{2}/\d{2})', raw)
    return m.group(1) if m else raw


def load_sheet_values(json_file: str) -> list:
    """MCP結果JSONファイルからシートの値を読み込む"""
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return json.loads(data[0]['text'])['values']
    except (json.JSONDecodeError, KeyError, IndexError) as e:
        print(f"Error loading {json_file}: {e}", file=sys.stderr)
        sys.exit(1)


def find_date_row(values: list, target_date_str: str) -> int | None:
    """シフト表から指定日付を含む行のインデックスを探す"""
    for i, row in enumerate(values):
        for cell in row:
            if target_date_str in str(cell):
                return i
    return None


def is_night_block(block_rows: list) -> bool:
    """夜間・週末期ブロックかどうかを判定する。
    「講師」行が存在し、「朝会」「夕会」行が存在しないブロックが夜間・週末期。
    """
    row_types = set()
    for row in block_rows:
        if row and len(row) > 0:
            row_types.add(str(row[0]))
    has_instructor = '講師' in row_types
    has_no_allday = not ({'朝会', '夕会'} & row_types)
    return has_instructor and has_no_allday


def parse_night_blocks(values: list, date_row_idx: int, week_dates: dict) -> list:
    """指定週の夜間・週末期ブロックを解析する。

    week_dates: {曜日名: {'date': 'YYYY/MM/DD', 'col_index': 2-7, 'col_letter': 'C-H'}}
    """
    night_blocks = []
    current_kikan_id = None
    current_section = {}
    current_block_rows = []

    def save_block():
        if current_kikan_id and is_night_block(current_block_rows):
            block = {
                'kikan_id': current_kikan_id,
                'section': current_section.get('section', ''),
                'instructor_row_abs': current_section.get('instructor_row_abs'),
                'dates': {},
            }
            # 各曜日のデータを収集
            for wd_name, wd_info in week_dates.items():
                col_idx = wd_info['col_index']
                current_val = ''
                instr_row_abs = current_section.get('instructor_row_abs')
                if instr_row_abs is not None:
                    instr_row = values[instr_row_abs]
                    if len(instr_row) > col_idx:
                        current_val = instr_row[col_idx]
                block['dates'][wd_name] = {
                    'date': wd_info['date'],
                    'col_letter': wd_info['col_letter'],
                    'col_index': col_idx,
                    'current_value': current_val,
                    'availability': {},
                }
            night_blocks.append(block)

    # 日付行の次の行から次の日付行まで走査
    for i in range(date_row_idx + 1, min(date_row_idx + 120, len(values))):
        row = values[i]

        # 次の日付行に到達したら終了
        if len(row) > 2 and row[2] and '/' in str(row[2]) and len(str(row[2])) > 8:
            break

        if not row or len(row) == 0:
            continue

        row_type = str(row[0]) if row else ''

        # header行（新しい期の開始）
        if 'header' in row_type:
            # 前の期を保存
            save_block()

            current_kikan_id = row[1] if len(row) > 1 else None
            current_block_rows = [row]
            current_section = {}

            # header行のsection情報（C列以降）
            for wd_name, wd_info in week_dates.items():
                col_idx = wd_info['col_index']
                if len(row) > col_idx and row[col_idx]:
                    current_section['section'] = row[col_idx]
                    break
            continue

        if current_kikan_id is None:
            continue

        current_block_rows.append(row)

        # 講師行の絶対行番号を記録
        if row_type == '講師':
            current_section['instructor_row_abs'] = i

    # 最後のブロックを保存
    save_block()

    return night_blocks


def extract_availability(availability_values: list, week_dates: dict) -> dict:
    """提出シートから指定週の各日付・各講師の稼働可能情報を抽出する。

    Returns: {date_str: {instructor_name: status}}
    """
    result = {}
    target_dates = {v['date'] for v in week_dates.values()}

    for row in availability_values:
        if not row or len(row) < 2:
            continue
        raw_date = str(row[1]) if len(row) > 1 else ''
        norm_date = normalize_date(raw_date)
        if norm_date not in target_dates:
            continue

        day_availability = {}
        for col_idx, instructor in INSTRUCTOR_COLUMNS.items():
            if len(row) > col_idx and row[col_idx]:
                status = str(row[col_idx]).strip()
                if status and status not in ('', '0'):
                    day_availability[instructor] = status

        if day_availability:
            # 同じ日付で複数行ある場合はマージ
            if norm_date in result:
                result[norm_date].update(day_availability)
            else:
                result[norm_date] = day_availability

    return result


def merge_availability(night_blocks: list, availability: dict) -> list:
    """夜間・週末期ブロックの各曜日に稼働可能情報をマージする"""
    for block in night_blocks:
        for wd_name, wd_info in block['dates'].items():
            date_str = wd_info['date']
            wd_info['availability'] = availability.get(date_str, {})
    return night_blocks


def build_week_dates(week_start: datetime) -> dict:
    """週の月曜日から土曜日までの日付辞書を作成する"""
    week_dates = {}
    for i, wd_name in enumerate(WEEKDAY_NAMES):
        d = week_start + timedelta(days=i)
        col_idx = WEEKDAY_COL_INDEX[i]
        week_dates[wd_name] = {
            'date': d.strftime('%Y/%m/%d'),
            'col_index': col_idx,
            'col_letter': COL_LETTERS[col_idx],
        }
    return week_dates


# ── 自動割当ロジック ──────────────────────────────────────────────────────────

def is_available_status(status: str) -> bool:
    """稼働可能なステータスかどうかを判定する（NG・空欄以外）"""
    if not status:
        return False
    s = status.strip()
    return bool(s) and s != 'NG'


def count_week_availability(availability: dict) -> dict:
    """週内の各講師の稼働可能日数をカウントする。

    availability: {date_str: {instructor: status}}
    Returns: {instructor: count}
    """
    counts: dict[str, int] = {}
    for day_avail in availability.values():
        for instructor, status in day_avail.items():
            if is_available_status(status):
                counts[instructor] = counts.get(instructor, 0) + 1
    return counts


def auto_assign_blocks(
    night_blocks: list,
    availability_counts: dict,
    excluded: set,
) -> list:
    """ルールに基づいて各ブロック×曜日に講師を自動割当する。

    ルール:
    1. excluded に含まれる講師は割当しない
    2. その日に稼働可能（NG・空欄以外）な講師のみ対象
    3. 週内稼働可能日数が少ない順に優先（同数の場合は名前順）

    Returns: assignments list
    """
    assignments = []

    for block in night_blocks:
        for wd_name, wd_info in block['dates'].items():
            avail = wd_info['availability']

            # 稼働可能かつ除外リスト外の講師
            candidates = [
                inst for inst, status in avail.items()
                if inst not in excluded and is_available_status(status)
            ]

            if not candidates:
                assignments.append({
                    'kikan_id': block['kikan_id'],
                    'section': block['section'],
                    'weekday': wd_name,
                    'date': wd_info['date'],
                    'col_letter': wd_info['col_letter'],
                    'instructor_row_abs': block['instructor_row_abs'],
                    'assigned_instructor': None,
                    'availability_status': None,
                    'reason': '稼働可能な講師なし',
                })
                continue

            # 週内稼働可能日数でソート（昇順）→ 同数なら名前順
            candidates.sort(key=lambda inst: (availability_counts.get(inst, 0), inst))
            assigned = candidates[0]

            assignments.append({
                'kikan_id': block['kikan_id'],
                'section': block['section'],
                'weekday': wd_name,
                'date': wd_info['date'],
                'col_letter': wd_info['col_letter'],
                'instructor_row_abs': block['instructor_row_abs'],
                'assigned_instructor': assigned,
                'availability_status': avail[assigned],
                'reason': None,
            })

    return assignments


# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='夜間・週末シフト割当データ解析')
    parser.add_argument('--shift-table', required=True, help='シフト表データJSONファイル')
    parser.add_argument('--availability', required=True, help='提出シートデータJSONファイル')
    parser.add_argument('--week', required=True, help='対象週の月曜日 (YYYY-MM-DD)')
    parser.add_argument(
        '--auto-assign', action='store_true',
        help='ルールに基づいて一括自動割当を行う',
    )
    parser.add_argument(
        '--exclude-instructors', default='ちいかた',
        help='割当から除外する講師名（カンマ区切り、デフォルト: ちいかた）',
    )
    args = parser.parse_args()

    # 週の月曜日を解析
    try:
        week_start = datetime.strptime(args.week, '%Y-%m-%d')
    except ValueError:
        print(f"Invalid date format: {args.week}. Use YYYY-MM-DD.", file=sys.stderr)
        sys.exit(1)

    # 月曜日かどうか確認（強制しないが警告）
    if week_start.weekday() != 0:
        print(
            f"Warning: {args.week} is not a Monday. "
            f"(weekday={week_start.weekday()})",
            file=sys.stderr
        )

    # データ読み込み
    shift_values = load_sheet_values(args.shift_table)
    availability_values = load_sheet_values(args.availability)

    # 週の日付辞書を構築
    week_dates = build_week_dates(week_start)

    # シフト表から月曜日の日付行を探す
    monday_date_str = week_start.strftime('%Y/%m/%d')
    date_row_idx = find_date_row(shift_values, monday_date_str)
    if date_row_idx is None:
        print(f"Date row not found for {monday_date_str}", file=sys.stderr)
        sys.exit(2)

    # 夜間・週末期ブロックを解析
    night_blocks = parse_night_blocks(shift_values, date_row_idx, week_dates)

    # 稼働可能情報を抽出
    availability = extract_availability(availability_values, week_dates)

    # ブロックに稼働可能情報をマージ
    night_blocks = merge_availability(night_blocks, availability)

    # 結果を構築
    result = {
        'week_start': week_start.strftime('%Y/%m/%d'),
        'date_row_index': date_row_idx,
        'week_dates': week_dates,
        'night_blocks': night_blocks,
    }

    # 自動割当モード
    if args.auto_assign:
        excluded = {x.strip() for x in args.exclude_instructors.split(',') if x.strip()}
        availability_counts = count_week_availability(availability)
        assignments = auto_assign_blocks(night_blocks, availability_counts, excluded)
        result['excluded_instructors'] = sorted(excluded)
        result['availability_counts'] = availability_counts
        result['assignments'] = assignments

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
