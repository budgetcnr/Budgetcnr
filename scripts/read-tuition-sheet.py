"""Read the private authoritative workbook; never log student records."""
import argparse
import hashlib
import io
import json
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import openpyxl

FILE_ID = '1fQ811hgbn07MlyirtBpc07i5CeAfhLj1'


def cents(value):
    if value is None or str(value).strip() in ('', '-'):
        return 0
    amount = Decimal(str(value).replace(',', '').strip()) * 100
    if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value():
        raise ValueError('Invalid monetary cell')
    return int(amount)


def parse_workbook(data):
    workbook = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    if not {'ม.2', 'ม.3', 'ม.5', 'ม.6'}.issubset(workbook.sheetnames):
        raise ValueError('Missing authoritative worksheet')
    records, coverage, dates, pending = [], [], set(), 0
    seen = set()
    for sheet in workbook:
        if sheet.title == 'นักเรียนใหม่':
            pending += sum(1 for row in sheet.values if isinstance(row[0], (int, float)) and row[1])
            continue
        if not re.fullmatch(r'ม\.[2356]', sheet.title):
            raise ValueError('Unexpected worksheet; review its layout before import')
        rows = list(sheet.values)
        match = re.search(r'ณ\s*วันที่\s*(\d+)\s*([ก-๙]+)\s*(25\d{2})', str(rows[2][0]))
        months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
        if not match or match[2] not in months:
            raise ValueError('Missing report date')
        as_of = date(int(match[3]) - 543, months.index(match[2]) + 1, int(match[1]))
        dates.add(as_of.isoformat())
        academic_year = as_of.year + 543 - (as_of.month < 5)
        cutoff = (academic_year, 1 if 5 <= as_of.month <= 10 else 2)
        total_col = next(i for i, cell in enumerate(rows[3]) if cell == 'รวม')
        terms = []
        future_cols = []
        for i, cell in enumerate(rows[4][:total_col]):
            term = re.fullmatch(r'([12])/(25\d{2})', str(cell or '').strip())
            if term:
                year, semester = int(term[2]), int(term[1])
                if (year, semester) <= cutoff:
                    terms.append((i, year, semester))
                else:
                    future_cols.append(i)
        if not terms:
            raise ValueError('Missing term headers')
        room = None
        for row in rows[5:]:
            heading = re.fullmatch(r'ระดับชั้น\s*(ม\.[1-6]/\d+)', str(row[0] or '').strip())
            if heading:
                room = heading[1]
                if not room.startswith(sheet.title + '/'):
                    raise ValueError('Classroom does not match worksheet')
                if any(c['class_room'] == room for c in coverage):
                    raise ValueError('Duplicate classroom')
                coverage.append({'class_room': room, 'terms': [[y, s] for _, y, s in terms]})
                continue
            raw_id = row[1]
            student_id = str(int(raw_id)) if isinstance(raw_id, (int, float)) and float(raw_id).is_integer() else str(raw_id or '').strip()
            if not student_id:
                # Subtotals and formatting-only rows have no student number.
                if row[2] and row[0] and str(row[0]).strip().isdigit():
                    raise ValueError('Student row without ID')
                continue
            if not re.fullmatch(r'\d{4,10}', student_id) or not room or not row[2]:
                raise ValueError('Invalid student row')
            if student_id in seen:
                raise ValueError('Duplicate student ID')
            seen.add(student_id)
            if any(cents(row[i]) for i in future_cols):
                raise ValueError('Amounts after report date; review headers')
            if row[total_col] is None or not str(row[total_col]).strip():
                raise ValueError('Missing cached student total; recalculate workbook before import')
            total = cents(row[total_col])
            entries = [{'academic_year': y, 'semester': s, 'outstanding_cents': cents(row[i])}
                       for i, y, s in terms]
            records.append({'student_id': student_id, 'class_room': room,
                            'total_cents': total, 'entries': entries,
                            'details_available': int(sum(e['outstanding_cents'] for e in entries) == total)})
    if len(dates) != 1 or not records or not coverage:
        raise ValueError('Incomplete workbook or inconsistent dates')
    bundle = {'source_url': f'https://docs.google.com/spreadsheets/d/{FILE_ID}/edit',
              'as_of': dates.pop(), 'coverage': coverage, 'records': records,
              'pending_roster_rows': pending}
    digest = hashlib.sha256(json.dumps(bundle, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    bundle['version'] = 'arrears-live-' + digest[:20]
    return bundle


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        bundle = parse_workbook(args.file.read_bytes())
        args.output.write_text(json.dumps(bundle, ensure_ascii=False))
        args.output.chmod(0o600)
        print(f"Workbook validated: {len(bundle['records'])} records; {len(bundle['coverage'])} classrooms; "
              f"{sum(r['total_cents'] for r in bundle['records']) / 100:,.2f} THB; "
              f"{bundle['pending_roster_rows']} roster rows require separate review.")
    except Exception:
        raise SystemExit('Source read/validation failed. Check downloaded workbook and layout. No personal data logged.')
