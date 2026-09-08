import unittest
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError
from datetime import datetime, timezone
import psycopg
from scripts.voi_database import persist_with_retry
from scripts.collect_voi_vehicles import fetch_payload
from scripts.voi_availability import parse_window, validate_polygon, ValidationError

class ReliabilityTest(unittest.TestCase):
    @patch('scripts.voi_database.time.sleep')
    @patch('scripts.voi_database.initialize')
    @patch('scripts.voi_database.store_snapshot', return_value=False)
    @patch('scripts.voi_database.connect')
    def test_retry_keeps_original_payload_and_duplicate_result(self, connect, store, initialize, sleep):
        connect.side_effect = [psycopg.OperationalError('transient'), MagicMock()]
        payload = {'captured_at': '2026-09-08T12:10:00Z'}
        self.assertFalse(persist_with_retry(payload, 'test'))
        self.assertIs(store.call_args.args[1], payload)
        self.assertEqual(connect.call_count, 2)

    @patch('scripts.voi_database.time.sleep')
    @patch('scripts.voi_database.connect', side_effect=psycopg.OperationalError('transient'))
    def test_retry_exhaustion_is_bounded(self, connect, sleep):
        with self.assertRaises(psycopg.OperationalError):
            persist_with_retry({}, 'test')
        self.assertEqual(connect.call_count, 3)

    @patch('scripts.collect_voi_vehicles.time.sleep')
    @patch('scripts.collect_voi_vehicles.urlopen', side_effect=HTTPError('https://example.test', 403, 'forbidden', {}, None))
    def test_permanent_http_failure_does_not_retry(self, request, sleep):
        with self.assertRaisesRegex(RuntimeError, '403'):
            fetch_payload('https://example.test', datetime.now(timezone.utc), 1, api_key='test-only')
        self.assertEqual(request.call_count, 1)
        sleep.assert_not_called()

    def test_window_and_geometry_budgets(self):
        with self.assertRaises(ValidationError):
            parse_window('2026-01-01', '2026-09-01')
        for point in ([float('nan'), 0], [181, 0]):
            with self.assertRaises(ValidationError):
                validate_polygon({'type': 'Polygon', 'coordinates': [[point, [1,0], [1,1], point]]})
