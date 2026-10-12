"""Unit tests for the /voi-trips/ access rule and data encryption."""

import gzip
import unittest

from scripts.voi_trips_access import LoginRequired, fetch_acl, has_voi_grant_in_region, may_see

VOI = {"system_id": "voi", "name": "Voi"}
CHECK = {"system_id": "check", "name": "CHECK"}
HILVERSUM = {"gm_code": "GM0402", "name": "Hilversum"}
UTRECHT = {"gm_code": "GM0344", "name": "Utrecht"}
HILVERSUM_ZONE = {**HILVERSUM, "zone_id": 34188}
UTRECHT_ZONE = {**UTRECHT, "zone_id": 34344}


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


def api(zones, operators=None):
    """A fake dashboard API: the zones and operators an account was granted.

    None means no filter, as the API treats an empty grant list.
    """
    def allowed(_token, query):
        if zones is not None and query["zone_ids"] not in zones:
            return False
        if operators is not None:
            return "operators" in query and query["operators"] in operators
        return True
    return allowed


class HasVoiGrantInRegionTest(unittest.TestCase):
    ACL = {"is_admin": False, "operators": [CHECK], "municipalities": [UTRECHT_ZONE, HILVERSUM_ZONE]}

    def test_voi_and_municipality_grants_may(self):
        # menu/acl hides both grants behind its default lists
        self.assertFalse(may_see(self.ACL))
        self.assertTrue(has_voi_grant_in_region("t", self.ACL, api({34188}, {"voi"})))

    def test_municipality_account_without_a_voi_grant_may_not(self):
        self.assertFalse(has_voi_grant_in_region("t", self.ACL, api({34188})))

    def test_voi_only_outside_the_region_may_not(self):
        self.assertFalse(has_voi_grant_in_region("t", self.ACL, api({34344}, {"voi"})))

    def test_another_operator_may_not(self):
        self.assertFalse(has_voi_grant_in_region("t", self.ACL, api({34188}, {"check"})))

    def test_municipalities_without_zone_ids_are_not_probed(self):
        acl = {"is_admin": False, "operators": [], "municipalities": [HILVERSUM]}
        self.assertFalse(has_voi_grant_in_region("t", acl, api({34188}, {"voi"})))

    def test_malformed_acl_may_not(self):
        for acl in (None, [], {"municipalities": None}):
            self.assertFalse(has_voi_grant_in_region("t", acl, api(None, {"voi"})))


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
