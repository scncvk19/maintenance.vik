"""Isolated tests for the read-only document categorizer. No application access."""
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from suggest_document_categories import preview, safe_csv_value, suggest


class DocumentCategoryTests(unittest.TestCase):
    def test_specific_category_takes_precedence_over_invoice(self):
        self.assertEqual(suggest('Strom Rechnung', 'stromrechnung.pdf')[0], 'energy')

    def test_ambiguous_and_unknown_are_not_guessed(self):
        self.assertEqual(suggest('Steuer und Versicherung', 'dokument.pdf')[0], '')
        self.assertEqual(suggest('Ohne Hinweis', 'scan123.pdf')[0], '')

    def test_csv_formula_is_neutralized(self):
        for value in ('=HYPERLINK("x")', ' +SUM(1,2)', '\t@cmd', '-1+2'):
            with self.subTest(value=value):
                self.assertTrue(safe_csv_value(value).startswith("'"))

    def test_manifest_preview_is_read_only(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'backup.zip'
            manifest = {
                'application': 'maintenance.vik', 'schema_version': 1,
                'data': {'documents': [
                    {'id': '123', 'title': 'Strom Rechnung', 'filename': 'energie.pdf', 'category': 'other'},
                    {'id': '456', 'title': '=FORMULA()', 'filename': 'notizen.txt', 'category': 'other'},
                ]},
            }
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('manifest.json', json.dumps(manifest))
            original = path.read_bytes()
            rows = preview(path)
            self.assertEqual(rows[0]['suggested_category'], 'energy')
            self.assertEqual(rows[0]['review_required'], 'ja')
            self.assertEqual(rows[1]['suggested_category'], '')
            self.assertTrue(rows[1]['title'].startswith("'"))
            self.assertEqual(path.read_bytes(), original)

    def test_unrelated_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'wrong.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('manifest.json', '{}')
            with self.assertRaises(ValueError):
                preview(path)


if __name__ == '__main__':
    unittest.main()
