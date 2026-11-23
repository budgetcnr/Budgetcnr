import importlib.util
import io
import unittest
from pathlib import Path

import openpyxl

spec = importlib.util.spec_from_file_location('reader', Path(__file__).parents[1] / 'scripts/read-tuition-sheet.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def workbook(change=lambda w: None):
    w = openpyxl.Workbook()
    w.remove(w.active)
    for grade in [2, 3, 5, 6]:
        s = w.create_sheet(f'ม.{grade}')
        s.append(['รายชื่อนักเรียนค้างชำระ'])
        s.append(['โรงเรียนทดสอบ'])
        s.append(['ณ วันที่ 10 กันยายน 2569'])
        s.append(['เลขที่', 'เลขประจำตัว', 'ชื่อ - นามสกุล', 'ม.1', None, 'รวม'])
        s.append([None, None, None, '1/2569', '2/2569'])
        s.append([f'ระดับชั้น ม.{grade}/1'])
        s.append([1, 10000 + grade, 'Synthetic student', 100, None, 100])
        s.append([None, None, None, None, None, 100])  # subtotal excluded
    change(w)
    out = io.BytesIO()
    w.save(out)
    return out.getvalue()


class ReaderTests(unittest.TestCase):
    def test_numeric_ids_and_totals_and_future_headers(self):
        b = reader.parse_workbook(workbook())
        self.assertEqual(len(b['records']), 4)
        self.assertEqual(sum(r['total_cents'] for r in b['records']), 40000)
        self.assertEqual(b['records'][0]['student_id'], '10002')
        self.assertEqual(b['coverage'][0]['terms'], [[2569, 1]])

    def test_deterministic_version(self):
        self.assertEqual(reader.parse_workbook(workbook())['version'], reader.parse_workbook(workbook())['version'])

    def test_blank_past_term_means_paid(self):
        def change(w):
            w['ม.2']['D7'] = None
            w['ม.2']['F7'] = 0
        b = reader.parse_workbook(workbook(change))
        self.assertEqual(b['records'][0]['entries'][0]['outstanding_cents'], 0)

    def test_report_total_preserved_when_details_differ(self):
        b = reader.parse_workbook(workbook(lambda w: setattr(w['ม.2']['F7'], 'value', 50)))
        self.assertEqual(b['records'][0]['total_cents'], 5000)
        self.assertEqual(b['records'][0]['details_available'], 0)

    def test_bad_source_rejected(self):
        changes = [
            lambda w: w.remove(w['ม.2']),
            lambda w: setattr(w['ม.2']['F7'], 'value', None),
            lambda w: setattr(w['ม.2']['D7'], 'value', -1),
            lambda w: setattr(w['ม.2']['D7'], 'value', 'bad'),
            lambda w: setattr(w['ม.2']['E7'], 'value', 500),
            lambda w: setattr(w['ม.3']['B7'], 'value', 10002),
            lambda w: setattr(w['ม.3']['A3'], 'value', 'ณ วันที่ 11 กันยายน 2569'),
        ]
        for change in changes:
            with self.subTest(change=change), self.assertRaises((ValueError, ArithmeticError)):
                reader.parse_workbook(workbook(change))


if __name__ == '__main__':
    unittest.main()
