import base64
import io
import json
import unittest
from agentcore_relay import relay
ARN="arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/fixture-agent-123"
SESSION="fixture-agent-session-id-at-least-thirty-three-characters"
class Client:
    def __init__(self,fail=False): self.calls=[];self.fail=fail
    def invoke_agent_runtime(self,**args):
        self.calls.append(args)
        if self.fail: raise TimeoutError()
        reply=dict(status=200,body=base64.b64encode(b'{"nonce":"fixture","requests":[]}').decode(),headers={"x-looplabs-response-signature":"b"*64,"set-cookie":"must-not-forward"})
        return {"response":io.BytesIO(json.dumps(reply).encode())}
def event(): return dict(rawPath="/looplabs/approval-bridge",requestContext={"http":{"method":"POST"}},headers={"x-looplabs-signature":"a"*64},body='{"operation":"list"}')
class Tests(unittest.TestCase):
    def test_fixed_native_target_and_original_bytes(self):
        c=Client();r=relay(event(),c,runtime_arn=ARN,session_id=SESSION);self.assertEqual(r["statusCode"],200);self.assertNotIn("set-cookie",r["headers"]);payload=json.loads(c.calls[0]["payload"]);self.assertEqual(payload["path"],"/looplabs/approval-bridge");self.assertEqual(payload["raw_body"],event()["body"]);self.assertEqual(c.calls[0]["runtimeSessionId"],SESSION)
    def test_timeout_no_retry(self):
        c=Client(True);self.assertEqual(relay(event(),c,runtime_arn=ARN,session_id=SESSION)["statusCode"],503);self.assertEqual(len(c.calls),1)
    def test_missing_signature_no_runtime_invocation(self):
        c=Client();e=event();e["headers"]={};self.assertEqual(relay(e,c,runtime_arn=ARN,session_id=SESSION)["statusCode"],401);self.assertFalse(c.calls)
    def test_arbitrary_native_path_refused(self):
        c=Client();e=event();e["rawPath"]="/dev/inbound";self.assertEqual(relay(e,c,runtime_arn=ARN,session_id=SESSION)["statusCode"],404);self.assertFalse(c.calls)
    def test_oversized_body_refused(self):
        c=Client();e=event();e["body"]="x"*24001;self.assertEqual(relay(e,c,runtime_arn=ARN,session_id=SESSION)["statusCode"],413);self.assertFalse(c.calls)
if __name__=="__main__":unittest.main()
