"""Dedicated loopback FetchSandbox engine adapter; no real payment calls.

Uses the existing FetchSandbox engine and Stripe OpenAPI, with a documented
refund-only fixture contract. This does not claim complete live Stripe parity.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import parse_qsl

root = Path(__file__).resolve().parent.parent
backend = Path(os.environ.get("FETCHSANDBOX_BACKEND_PATH", str(Path.home() / "sandbox/backend")))
sys.path.insert(0, str(backend))
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.parser.spec_parser import parse_spec_file
from app.sandbox.engine import SandboxEngine
from app.sandbox.auth_simulator import AuthConfig, SandboxCredentials
from app.rules.engine import load_rules_from_config
import yaml

os.chdir(root / ".local")  # FetchSandbox archives stay inside ignored private local storage.

config = yaml.safe_load((backend / "configs/stripe/sandbox_config.yaml").read_text())
secret = json.loads((root / ".local/refund-twin-credentials.json").read_text())["token"]
config["resources"]["refunds"]["initial_state"] = "succeeded"
idem = {
 "source": "Controlled refund fixture based on https://docs.stripe.com/api/idempotent_requests; parameter equality, 24h TTL, concurrent behavior and errors are fixture contracts, not measured live parity.",
 "header": "Idempotency-Key", "ttl_seconds": 86400, "max_key_length": 255,
 "operations": ["POST /v1/refunds"],
 "errors": {name: {"status": status, "code": name, "detail": "Refund idempotency contract rejected this request."}
            for name, status in [("invalid_key",400),("conflict",409),("concurrent",409)]}
}
engine = SandboxEngine(sandbox_id="looplabs-refund-private",spec=parse_spec_file(backend / "specs/stripe/openapi.yaml",name="stripe"),
 rules=load_rules_from_config(config), resource_config=config["resources"], request_idempotency=idem,
 auth_config=AuthConfig(enabled=True,mode="relaxed",credentials=[SandboxCredentials(api_key=secret,api_secret="")]))
state_file = root / ".local/refund-twin-state.json"
if state_file.exists():
 engine.seed_data(json.loads(state_file.read_text()))
else:
 engine.seed_data({"charges":[{"id":"ch_looplabs_refund_demo","object":"charge","amount":100000,"currency":"usd","paid":True,"captured":True,"amount_refunded":0,"refunded":False,"livemode":False}]})

def persist():
 data = engine.state.snapshot(include_internal=True)
 temp=state_file.with_suffix(".tmp")
 with open(temp,"w") as f:
  os.chmod(temp,0o600)
  json.dump(data,f); f.flush(); os.fsync(f.fileno())
 os.replace(temp,state_file)

app = FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
@app.api_route("/{path:path}",methods=["GET","POST"])
async def route(path: str,request: Request):
 if request.headers.get("authorization")!=f"Bearer {secret}": return JSONResponse({"error":"Test twin credential required"},status_code=401)
 api="/"+path
 allowed=(request.method=="GET" and (api=="/v1/refunds" or api=="/v1/charges/ch_looplabs_refund_demo" or api.startswith("/v1/refunds/re_"))) or (request.method=="POST" and api=="/v1/refunds")
 if not allowed: return JSONResponse({"error":"Outside refund fixture scope"},status_code=403)
 body=None
 if request.method=="POST":
  raw=await request.body()
  if len(raw)>2048: return JSONResponse({"error":"Too large"},status_code=413)
  body=dict(parse_qsl(raw.decode()))
  if not request.headers.get("idempotency-key"): return JSONResponse({"error":"Idempotency-Key required"},status_code=400)
  try: amount=int(body.get("amount","0"))
  except ValueError: return JSONResponse({"error":"Invalid amount"},status_code=400)
  if body.get("charge")!="ch_looplabs_refund_demo" or amount<=0 or not body.get("metadata[looplabs_action]"):
   return JSONResponse({"error":"Invalid refund fixture payload"},status_code=400)
  body={"charge":body["charge"],"amount":amount,"currency":"usd","reason":body.get("reason"),"metadata":{"looplabs_action":body["metadata[looplabs_action]"]}}
  # Replay must resolve before balance checking: a full refund remains replayable.
  headers=dict(request.headers)
  ep=next(e for e in engine.spec.endpoints if e.method=="POST" and e.path==api)
  replay,replayed=engine._begin_idempotent_request(ep,"POST",api,headers,body,None)
  if replayed is not None: return JSONResponse(replayed.body,status_code=replayed.status)
  if replay: engine._idempotency_inflight.discard(replay[0])
  # Legacy fixture state may predate persisted protocol replay. Never blindly
  # create another refund when matching action evidence already exists.
  existing=[r for r in engine.state.collection("refunds").list_all() if r.get("metadata",{}).get("looplabs_action")==body["metadata"]["looplabs_action"]]
  if existing: return JSONResponse({"error":"Existing refund requires reconciliation; replay evidence unavailable"},status_code=409)
  charge=engine.state.collection("charges").get("ch_looplabs_refund_demo")
  if amount+charge["amount_refunded"]>charge["amount"]: return JSONResponse({"error":"Amount exceeds remaining balance"},status_code=400)
 result=engine.process_request(request.method,api,dict(request.headers),dict(request.query_params),body)
 if request.method=="POST" and 200<=result.status<300:
  refunds=engine.state.collection("refunds").list_all()
  total=sum(r["amount"] for r in refunds if r.get("status")=="succeeded")
  engine.state.collection("charges").update("ch_looplabs_refund_demo",{"amount_refunded":total,"refunded":total==100000})
  persist()
 if api=="/v1/refunds" and request.method=="GET":
  # Authoritative complete list for this bounded single-payment fixture.
  return JSONResponse({"object":"list","data":engine.state.collection("refunds").list_all(),"has_more":False})
 if request.method=="POST" and request.headers.get("x-looplabs-lose-response")=="true" and 200<=result.status<300:
  await asyncio.sleep(3)
 return JSONResponse(result.body,status_code=result.status)

if __name__=="__main__":
 import uvicorn
 persist()
 uvicorn.run(app,host="0.0.0.0" if os.environ.get("LOOPLABS_TWIN_CONTAINER")=="1" else "127.0.0.1",port=8017,access_log=False,log_level="warning")
