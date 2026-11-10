"""Offline checks for the exported root layout; never start any services."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
POC = ROOT / 'kb' / 'deploy' / 'poc'


class ExportLayoutTests(unittest.TestCase):
    def test_compose_context_and_copies_resolve(self):
        self.assertEqual((POC / '../../..').resolve(), ROOT)
        self.assertIn('context: ../../..', (POC / 'compose.yaml').read_text())
        for line in (POC / 'Dockerfile').read_text().splitlines():
            if line.startswith('COPY '):
                self.assertTrue((ROOT / line.split()[1]).exists(), line)

    def test_supported_schema_only(self):
        self.assertTrue((ROOT / 'docs/schema_conflunce_v4.sql').is_file())
        self.assertEqual(sorted(p.name for p in (ROOT / 'kb/sql').glob('*.sql')), [
            '03_sessions_v4.sql', '04_testing.sql', '05_testing_review.sql',
            '06_login_rate_limits.sql'])

    def test_tls_and_local_bind(self):
        compose = (POC / 'compose.yaml').read_text()
        self.assertIn('127.0.0.1:18575:443', compose)
        self.assertIn('../../../tls:/etc/nginx/tls:ro', compose)
        self.assertIn('server_name localhost;', (POC / 'nginx.conf').read_text())


if __name__ == '__main__':
    unittest.main()
