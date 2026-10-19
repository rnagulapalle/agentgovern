"""API Gateway -> fixed AgentCore HTTP envelope relay. No decision logic/secret.

The native receiver and LoopLabs verify HMAC end to end. Configure API Gateway
throttling before exposing this Lambda; it must not permit arbitrary runtimes,
sessions, native paths or methods from request input. One attempt, no write retry.
"""
import base64
import json
import re


def relay(event, client, *, runtime_arn, session_id, qualifier="DEFAULT"):
    failure = dict(statusCode=503, headers={"content-type":"application/json", "cache-control":"no-store"}, body='{"error":"Workflow response uncertain; read current approval before another decision."}')
    try:
        if not isinstance(qualifier,str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,47}",qualifier): raise ValueError()
        if not re.fullmatch(r"arn:aws:bedrock-agentcore:[a-z]{2}-[a-z]+-\d:\d{12}:runtime/[A-Za-z0-9_-]+", runtime_arn) or not isinstance(session_id,str) or not 33 <= len(session_id) <= 256:
            raise ValueError()
        if event.get("rawPath") != "/looplabs/approval-bridge" or event.get("requestContext",{}).get("http",{}).get("method") != "POST":
            return dict(statusCode=404,body="Not found")
        headers = {k.lower():v for k,v in event.get("headers",{}).items()}
        signature = headers.get("x-looplabs-signature", "")
        if not re.fullmatch(r"[a-f0-9]{64}",signature): return dict(statusCode=401,body="Signature required")
        body = event.get("body", "")
        if not isinstance(body,str) or len(body)>24000: return dict(statusCode=413,body="Body too large")
        raw = base64.b64decode(body,validate=True) if event.get("isBase64Encoded") else body.encode()
        if not 0 < len(raw) <= 16384: return dict(statusCode=413,body="Body too large")
        envelope = dict(method="POST",path="/looplabs/approval-bridge",headers={"x-looplabs-signature":signature,"x-looplabs-response-envelope":"1"},raw_body=raw.decode("utf8"))
        result = client.invoke_agent_runtime(agentRuntimeArn=runtime_arn,runtimeSessionId=session_id,qualifier=qualifier,contentType="application/json",payload=json.dumps(envelope).encode())
        stream=result["response"]
        try: data=stream.read(196609)
        finally: stream.close()
        if len(data)>196608: raise ValueError()
        reply=json.loads(data)
        if set(reply)!={"status","body","headers"} or reply["status"]!=200: raise ValueError()
        raw_response=base64.b64decode(reply["body"],validate=True)
        if len(raw_response)>131072: raise ValueError()
        signed=reply["headers"].get("x-looplabs-response-signature", "")
        if not re.fullmatch(r"[a-f0-9]{64}",signed): raise ValueError()
        return dict(statusCode=200,headers={"content-type":"application/json","cache-control":"no-store","x-looplabs-response-signature":signed},body=raw_response.decode("utf8"))
    except Exception:
        return failure


def lambda_handler(event, context):
    import os
    import boto3
    from botocore.config import Config
    client = boto3.client("bedrock-agentcore",region_name=os.environ["AWS_REGION"],config=Config(connect_timeout=2,read_timeout=8,retries={"total_max_attempts":1}))
    return relay(event,client,runtime_arn=os.environ["APPROVAL_RUNTIME_ARN"],session_id=os.environ["APPROVAL_RUNTIME_SESSION_ID"],qualifier=os.environ.get("APPROVAL_RUNTIME_QUALIFIER","DEFAULT"))
