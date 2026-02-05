#!/usr/bin/env python3
"""
シフト解析スクリプト
指定した日付の自分（ちいかた/片田）のシフトを抽出する
"""

import json
import sys
from datetime import datetime

# 列インデックスと曜日の対応
WEEKDAY_INDEX = {
    0: 2,  # 月曜日
    1: 3,  # 火曜日
    2: 4,  # 水曜日
    3: 5,  # 木曜日
    4: 6,  # 金曜日
    5: 7,  # 土曜日
    6: 7,  # 日曜日（土曜と同じ列、通常はなし）
}

# 自分の名前パターン
MY_NAMES = ['ちいかた', '片田']

# 抽出対象の行タイプ
TARGET_ROW_TYPES = ['講師', 'TA', '朝会', '講義', 'レビュー・デモ会', '夕会']


def find_date_row(values, target_date):
    """指定した日付を含む日付行のインデックスを探す"""
    date_str = target_date.strftime('%Y/%m/%d')
    for i, row in enumerate(values):
        for cell in row:
            if date_str in str(cell):
                return i
    return None


def get_column_index(target_date):
    """日付から対応する列インデックスを取得"""
    weekday = target_date.weekday()
    return WEEKDAY_INDEX.get(weekday)


def contains_my_name(value):
    """自分の名前が含まれているかチェック"""
    if not value:
        return False
    for name in MY_NAMES:
        if name in str(value):
            return True
    return False


def parse_shifts(values, date_row_idx, col_idx):
    """シフトデータを解析して自分のシフトを抽出"""
    shifts = []
    current_kikan = None
    current_kikan_data = {}

    # 日付行の後から次の日付行まで走査
    for i in range(date_row_idx + 1, min(date_row_idx + 80, len(values))):
        row = values[i]

        # 次の日付行に到達したら終了
        if len(row) > 2 and row[2] and '/' in str(row[2]) and len(str(row[2])) > 8:
            break

        # header行をチェック（期の開始）
        if len(row) > 0 and 'header' in str(row[0]):
            # 前の期のデータを保存
            if current_kikan and current_kikan_data.get('has_my_shift'):
                shifts.append({
                    'kikan': current_kikan,
                    'section': current_kikan_data.get('section', ''),
                    'note': current_kikan_data.get('note', ''),
                    'roles': current_kikan_data.get('roles', {})
                })

            # 新しい期を開始
            current_kikan = row[1] if len(row) > 1 else None
            current_kikan_data = {'has_my_shift': False, 'roles': {}}

            # section情報を取得
            if len(row) > col_idx and row[col_idx]:
                current_kikan_data['section'] = row[col_idx]
            continue

        if not current_kikan:
            continue

        # データ行をチェック
        row_type = row[0] if len(row) > 0 else ""

        # note行の処理
        if 'note' in str(row_type) and len(row) > col_idx and row[col_idx]:
            current_kikan_data['note'] = row[col_idx]
            continue

        # 対象行タイプかチェック
        if row_type not in TARGET_ROW_TYPES:
            continue

        # 対象列のデータを取得
        if len(row) > col_idx and row[col_idx]:
            value = row[col_idx]
            if contains_my_name(value):
                current_kikan_data['has_my_shift'] = True
                current_kikan_data['roles'][row_type] = value

    # 最後の期のデータを保存
    if current_kikan and current_kikan_data.get('has_my_shift'):
        shifts.append({
            'kikan': current_kikan,
            'section': current_kikan_data.get('section', ''),
            'note': current_kikan_data.get('note', ''),
            'roles': current_kikan_data.get('roles', {})
        })

    return shifts


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_shift.py <data_file> [date: YYYY-MM-DD]", file=sys.stderr)
        sys.exit(1)

    data_file = sys.argv[1]

    # 日付を取得（指定がなければ今日）
    if len(sys.argv) > 2:
        target_date = datetime.strptime(sys.argv[2], '%Y-%m-%d')
    else:
        target_date = datetime.now()

    # データを読み込む
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        values = json.loads(data[0]['text'])['values']
    except Exception as e:
        print(f"Error loading data: {e}", file=sys.stderr)
        sys.exit(1)

    # 日付行を探す
    date_row_idx = find_date_row(values, target_date)
    if date_row_idx is None:
        print(f"Date row not found for {target_date.strftime('%Y/%m/%d')}", file=sys.stderr)
        sys.exit(1)

    # 列インデックスを取得
    col_idx = get_column_index(target_date)

    # シフトを解析
    shifts = parse_shifts(values, date_row_idx, col_idx)

    # 結果を出力（JSON形式）
    result = {
        'date': target_date.strftime('%Y/%m/%d'),
        'weekday': ['月', '火', '水', '木', '金', '土', '日'][target_date.weekday()],
        'column_index': col_idx,
        'date_row': date_row_idx,
        'shifts': shifts
    }

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
