"""Customer-side HTTP protocol helper; no second approval datastore.

Install beside the workflow's existing authority. Its list_requests/decide_exact
methods must read/CAS the SAME approval used by Slack, not a mirrored record.
This helper does not implement the customer's native authority or deploy itself.
"""
from dataclasses import dataclass
import hashlib
import hmac
import json
import re
import time
from typing import Protocol


class Authority(Protocol):
    def list_requests(self) -> list[dict]: ...
    def decide_exact(self, *, approval_id: str, revision: str, policy_version: str,
                     reviewer: str, decision: str, decision_id: str) -> list[dict]: ...


@dataclass(frozen=True)
class Reply:
    status: int
    body: bytes
    headers: dict[str, str]


class Receiver:
    def __init__(self, *, secret: str, scope: dict, reviewers: set[str], authority: Authority,
                 now=time.time):
        if not re.fullmatch(r"[a-f0-9]{64,128}", secret) or not reviewers:
            raise ValueError("Explicit signing material and named reviewers required")
        if set(scope) != {"tenantId", "connectionId", "resourceArn", "version", "epoch"}:
            raise ValueError("Exact enrolled scope required")
        self.secret, self.scope, self.reviewers = secret, dict(scope), frozenset(reviewers)
        self.authority, self.now = authority, now

    def handle(self, raw: bytes, signature: str | None) -> Reply:
        # API Gateway must pass original bytes, without reserializing JSON.
        try:
            if len(raw) > 16384 or not isinstance(signature, str) or not re.fullmatch(r"[a-f0-9]{64}", signature):
                raise ValueError()
            expected = hmac.new(self.secret.encode(), b"request\n" + raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                raise ValueError()
            def pairs(items):
                out = {}
                for key, value in items:
                    if key in out:
                        raise ValueError()
                    out[key] = value
                return out
            value = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs)
            common = {"contract", "scope", "nonce", "timestamp", "operation"}
            if not isinstance(value, dict) or value.get("contract") != "looplabs-shared-approval-1" or value.get("scope") != self.scope:
                raise ValueError()
            if not isinstance(value.get("nonce"), str) or not re.fullmatch(r"[0-9a-f-]{36}", value["nonce"]):
                raise ValueError()
            if not isinstance(value.get("timestamp"), str) or not re.fullmatch(r"[0-9]{10,11}", value["timestamp"]) or abs(int(value["timestamp"]) - self.now()) > 300:
                raise ValueError()
            if value["operation"] == "list" and set(value) == common:
                requests = self.authority.list_requests()
            elif value["operation"] == "decide" and set(value) == common | {"id", "revision", "policyVersion", "decision", "reviewer", "decisionId"}:
                if value["reviewer"] not in self.reviewers or value["decision"] not in {"approved", "rejected"}:
                    raise ValueError()
                if not all(isinstance(value[k], str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,128}", value[k]) for k in ["id", "policyVersion"]):
                    raise ValueError()
                if not all(isinstance(value[k], str) and re.fullmatch(r"[a-f0-9]{64}", value[k]) for k in ["revision", "decisionId"]):
                    raise ValueError()
                requests = self.authority.decide_exact(approval_id=value["id"], revision=value["revision"],
                    policy_version=value["policyVersion"], reviewer=value["reviewer"],
                    decision=value["decision"], decision_id=value["decisionId"])
            else:
                raise ValueError()
            if not isinstance(requests, list) or len(requests) > 100:
                raise ValueError()
            body = json.dumps({"nonce": value["nonce"], "requests": requests}, ensure_ascii=False, separators=(",", ":")).encode()
            if len(body) > 131072:
                raise ValueError()
            reply_signature = hmac.new(self.secret.encode(), b"response\n" + hashlib.sha256(raw).hexdigest().encode() + b"\n" + body, hashlib.sha256).hexdigest()
            return Reply(200, body, {"content-type": "application/json", "cache-control": "no-store", "x-looplabs-response-signature": reply_signature})
        except Exception:
            # Do not expose native exception/provider payloads or signing details.
            # Caller treats errors as unknown, reads state, and never retries a write blindly.
            return Reply(409, b'{"error":"Decision or source state could not be confirmed; read current approval."}', {"content-type": "application/json", "cache-control": "no-store"})
