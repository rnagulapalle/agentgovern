import hashlib
import hmac
import json
import unittest
from receiver import Receiver

class NativeAuthority:
    def __init__(self): self.state = "pending"; self.resumes = 0
    def list_requests(self): return [{"status": self.state}]
    def decide_exact(self, **args):
        # Fixture for the customer's existing shared compare-and-set authority.
        if args["revision"] != "a" * 64: raise ValueError("stale")
        if self.state == "pending": self.state = args["decision"]; self.resumes += 1
        return self.list_requests()

class Tests(unittest.TestCase):
    def setUp(self):
        self.secret = "b" * 64
        self.scope = dict(tenantId="fixture", connectionId="aws-fixture", resourceArn="fixture-arn", version="1", epoch="fixture-epoch")
        self.native = NativeAuthority()
        self.receiver = Receiver(secret=self.secret, scope=self.scope, reviewers={"manager@example.test"}, authority=self.native, now=lambda: 1792150000)
    def command(self, **extra):
        return dict(contract="looplabs-shared-approval-1", scope=self.scope, nonce="00000000-0000-4000-8000-000000000001", timestamp="1792150000", operation="list") | extra
    def send(self, value, signature=None):
        raw = json.dumps(value, separators=(",", ":")).encode()
        sig = hmac.new(self.secret.encode(), b"request\n" + raw, hashlib.sha256).hexdigest()
        return raw, self.receiver.handle(raw, signature or sig)
    def decision(self): return self.command(operation="decide", id="approval-1", revision="a" * 64, policyVersion="policy-1", reviewer="manager@example.test", decision="approved", decisionId="c" * 64)
    def test_response_binds_original_request(self):
        raw, reply = self.send(self.command())
        self.assertEqual(reply.status, 200)
        expected = hmac.new(self.secret.encode(), b"response\n" + hashlib.sha256(raw).hexdigest().encode() + b"\n" + reply.body, hashlib.sha256).hexdigest()
        self.assertEqual(reply.headers["x-looplabs-response-signature"], expected)
    def test_duplicate_decision_only_resumes_once(self):
        self.send(self.decision()); self.send(self.decision()); self.assertEqual(self.native.resumes, 1)
    def test_slack_decision_observed_without_second_store(self):
        self.native.state = "rejected"
        _, reply = self.send(self.command())
        self.assertEqual(json.loads(reply.body)["requests"][0]["status"], "rejected")
    def test_wrong_signature_never_mutates(self):
        self.assertEqual(self.send(self.decision(), "0" * 64)[1].status, 409); self.assertEqual(self.native.resumes, 0)
    def test_expired_signed_envelope(self): self.assertEqual(self.send(self.decision() | {"timestamp": "1792140000"})[1].status, 409)
    def test_wrong_scope(self): self.assertEqual(self.send(self.decision() | {"scope": self.scope | {"tenantId": "other"}})[1].status, 409)
    def test_unconfigured_reviewer(self): self.assertEqual(self.send(self.decision() | {"reviewer": "other@example.test"})[1].status, 409)
    def test_stale_revision(self): self.assertEqual(self.send(self.decision() | {"revision": "d" * 64})[1].status, 409)
    def test_unknown_field_rejected(self): self.assertEqual(self.send(self.decision() | {"bypass": True})[1].status, 409)
    def test_unknown_decision_rejected(self): self.assertEqual(self.send(self.decision() | {"decision": "execute"})[1].status, 409)

if __name__ == "__main__": unittest.main()
