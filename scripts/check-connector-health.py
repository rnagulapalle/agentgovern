"""Private fixture readiness by GET only. Never print credentials or response data."""
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def ready(directory, open_request=None):
    try:
        private = Path(directory)
        token = json.loads((private / "connector-twin-credentials.json").read_text())["token"]
        if not isinstance(token, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{32,128}", token):
            return False
        contact, recipient = "1001", "customer@example.test"
        records_file = private / "connector-twin-records.json"
        if records_file.exists():
            records = json.loads(records_file.read_text())["records"]
            if not isinstance(records, list) or not 1 <= len(records) <= 100:
                return False
            contact, recipient = records[0]["contactId"], records[0]["recipient"]
            if not isinstance(contact, str) or not re.fullmatch(r"[0-9]{1,24}", contact):
                return False
            if not isinstance(recipient, str) or len(recipient) > 254 or not re.fullmatch(r"[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test", recipient):
                return False
        request = Request("http://127.0.0.1:8018/crm/crm/v3/objects/contacts/" + contact,
                          headers={"Authorization": "Bearer " + token})
        opener = open_request or build_opener(NoRedirect()).open
        with opener(request, timeout=2) as response:
            if response.status != 200 or response.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return False
            raw = response.read(65537)
            if len(raw) > 65536:
                return False
            value = json.loads(raw)
        return (value.get("id") == contact and value.get("properties", {}).get("email") == recipient
                and isinstance(value.get("updatedAt"), str) and 0 < len(value["updatedAt"]) <= 256)
    except Exception:
        return False


def self_test():
    import contextlib
    import io
    import tempfile
    import unittest
    from urllib.error import URLError

    class HealthTest(unittest.TestCase):
        def test_read_only_request_and_fail_closed_evidence(self):
            class Response:
                def __init__(self, value, status=200, content_type="application/json", raw=None):
                    self.status = status
                    self.headers = {"Content-Type": content_type}
                    self.raw = raw if raw is not None else json.dumps(value).encode()
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
                def read(self, size):
                    return self.raw[:size]

            with tempfile.TemporaryDirectory() as temp:
                directory = Path(temp)
                credentials = directory / "connector-twin-credentials.json"
                credentials.write_text(json.dumps({"token": "t" * 40}))
                records = directory / "connector-twin-records.json"
                records.write_text(json.dumps({"records": [{"contactId": "2001", "recipient": "owner@example.test"}]}))
                value = {"id": "2001", "properties": {"email": "owner@example.test"}, "updatedAt": "enrolled-2001"}
                def success(request, timeout):
                    self.assertEqual(request.get_method(), "GET")
                    self.assertEqual(request.full_url, "http://127.0.0.1:8018/crm/crm/v3/objects/contacts/2001")
                    self.assertEqual(request.get_header("Authorization"), "Bearer " + "t" * 40)
                    self.assertEqual(timeout, 2)
                    return Response(value)
                self.assertTrue(ready(temp, success))
                for bad in [{}, {**value, "id": "2002"}, {**value, "properties": {"email": "other@example.test"}}, {**value, "updatedAt": ""}, {**value, "updatedAt": "v" * 257}, []]:
                    self.assertFalse(ready(temp, lambda *a, **k: Response(bad)))
                for response in [Response(value, 401), Response(value, 302), Response(value, content_type="text/html"), Response(value, raw=b"x" * 65537), Response(value, raw=b"not-json")]:
                    self.assertFalse(ready(temp, lambda *a, **k: response))
                def unavailable(*args, **kwargs):
                    raise URLError("private token or host error")
                capture = io.StringIO()
                with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
                    self.assertFalse(ready(temp, unavailable))
                self.assertEqual(capture.getvalue(), "")
                for bad in ["[]", "{broken", json.dumps({"records": []}), json.dumps({"records": [{"contactId": "../secret", "recipient": "owner@example.test"}]})]:
                    records.write_text(bad)
                    self.assertFalse(ready(temp, success))
                records.unlink()
                baseline = {"id": "1001", "properties": {"email": "customer@example.test"}, "updatedAt": "baseline-version"}
                self.assertTrue(ready(temp, lambda request, **kwargs: Response(baseline) if request.get_method() == "GET" and request.full_url.endswith("/1001") else Response({}, 404)))
                credentials.write_text(json.dumps({"token": "bad\r\nheader"}))
                self.assertFalse(ready(temp, success))
        def test_redirects_never_forward_authority(self):
            self.assertIsNone(NoRedirect().redirect_request(None, None, 302, "", {}, "https://external.example/"))

    result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(HealthTest))
    return result.wasSuccessful()


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        sys.exit(0 if self_test() else 1)
    sys.exit(0 if ready(os.environ.get("LOOPLABS_CONNECTOR_STATE_DIR", "/state")) else 1)
