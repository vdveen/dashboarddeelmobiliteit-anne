"""Unit tests for the /voi-trips/ access rule and data encryption."""

import gzip
import unittest

from scripts.voi_trips_access import LoginRequired, fetch_acl, may_see

VOI = {"system_id": "voi", "name": "Voi"}
CHECK = {"system_id": "check", "name": "CHECK"}
HILVERSUM = {"gm_code": "GM0402", "name": "Hilversum"}
UTRECHT = {"gm_code": "GM0344", "name": "Utrecht"}


class MaySeeTest(unittest.TestCase):
    def test_admin_may(self):
        self.assertTrue(may_see({"is_admin": True, "operators": [], "municipalities": []}))

    def test_voi_in_a_region_municipality_may(self):
        self.assertTrue(may_see({"is_admin": False, "operators": [VOI], "municipalities": [UTRECHT, HILVERSUM]}))

    def test_another_operator_may_not(self):
        self.assertFalse(may_see({"is_admin": False, "operators": [CHECK], "municipalities": [HILVERSUM]}))

    def test_voi_outside_the_region_may_not(self):
        self.assertFalse(may_see({"is_admin": False, "operators": [VOI], "municipalities": [UTRECHT]}))

    def test_malformed_acl_may_not(self):
        for acl in (None, [], "admin", {"is_admin": "true"}, {"operators": None, "municipalities": None}):
            self.assertFalse(may_see(acl))


class FetchAclTest(unittest.TestCase):
    def test_missing_token_needs_a_login(self):
        with self.assertRaises(LoginRequired):
            fetch_acl("")


class EncryptionTest(unittest.TestCase):
    def test_round_trip_returns_the_gzipped_json(self):
        try:
            from cryptography.fernet import Fernet
        except ImportError:
            self.skipTest("cryptography is not installed")
        from scripts.voi_trips_access import decrypt, encrypt
        key = Fernet.generate_key()
        payload = b'{"trips": 1}'
        self.assertEqual(gzip.decompress(decrypt(encrypt(payload, key), key)), payload)


if __name__ == "__main__":
    unittest.main()
