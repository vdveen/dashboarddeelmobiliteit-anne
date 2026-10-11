"""Access to the /voi-trips/ page data: who may see it, and the encrypted file.

The repository is public, so the page data is committed encrypted
(VOI_TRIPS_DATA) and the key lives only in the VOI_TRIPS_KEY service variable.
The API hands the data to a visitor whose dashboard login the dashboard API
accepts, and whose account may see Voi data in the region (see may_see).

This module imports neither Flask nor cryptography at load time, so the rule
can be unit tested anywhere.
"""

import gzip
import json
import os
import pathlib
import urllib.error
import urllib.request

DASHBOARD_API_URL = os.environ.get("DASHBOARD_API_URL", "https://api.dashboarddeelmobiliteit.nl").rstrip("/")
VOI_TRIPS_DATA = pathlib.Path(__file__).with_name("voi_trips_data.enc")

# The municipalities the page covers: Amersfoort, Baarn, Eemnes, Soest,
# Blaricum, Hilversum, Huizen, Laren, Wijdemeren and Gooise Meren
REGION_GM_CODES = frozenset({"GM0307", "GM0308", "GM0317", "GM0342", "GM0376",
                             "GM0402", "GM0406", "GM0417", "GM1696", "GM1942"})


class LoginRequired(Exception):
    """No login, or the dashboard API does not accept it (anymore)."""


def may_see(acl):
    """True when a dashboard account may see the page.

    Admins may. Other accounts need Voi among their operators and at least one
    of the region's municipalities, as the dashboard itself would show them
    Voi trips there.
    """
    if not isinstance(acl, dict):
        return False
    if acl.get("is_admin") is True:
        return True
    operators = {o.get("system_id") for o in acl.get("operators") or [] if isinstance(o, dict)}
    municipalities = {m.get("gm_code") for m in acl.get("municipalities") or [] if isinstance(m, dict)}
    return "voi" in operators and bool(REGION_GM_CODES & municipalities)


def fetch_acl(token, timeout=15):
    """The account's access list from the dashboard API, for a bearer token."""
    if not token:
        raise LoginRequired("No dashboard login")
    request = urllib.request.Request(f"{DASHBOARD_API_URL}/dashboard-api/menu/acl",
                                     headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            raise LoginRequired("The dashboard API does not accept this login") from error
        raise


def encrypt(payload, key):
    """Gzip and encrypt the page data (bytes of JSON) with a Fernet key."""
    from cryptography.fernet import Fernet
    return Fernet(key).encrypt(gzip.compress(payload, mtime=0))


def decrypt(token, key):
    """The gzipped JSON from an encrypted data file."""
    from cryptography.fernet import Fernet
    return Fernet(key).decrypt(token)
