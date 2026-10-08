"""Private FetchSandbox CRM/email fixture. No real systems or messages.

The action/effect journal and persisted atomic snapshot are LoopLabs fixture
extensions, not HubSpot/Resend API parity or a production multi-process store.
"""
import asyncio
import hashlib
import json
import os
import sys
import re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
backend = Path(os.environ.get("FETCHSANDBOX_BACKEND_PATH", str(Path.home()/"sandbox/backend")))
sys.path.insert(0,str(backend))
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.parser.spec_parser import parse_spec_file
from app.sandbox.engine import SandboxEngine
from app.sandbox.auth_simulator import AuthConfig, SandboxCredentials
from app.rules.engine import load_rules_from_config
import yaml
private = Path(os.environ.get("LOOPLABS_CONNECTOR_STATE_DIR",str(root/".local")))
private.mkdir(parents=True,exist_ok=True)
os.chdir(private)
secret = json.loads((private/"connector-twin-credentials.json").read_text())["token"]
# The test harness enrolls extra records offline, never through a public endpoint.
# Each recipient is checked atomically with the effect, not only in a prior read.
record_file=private/"connector-twin-records.json"
scopes={}
if record_file.exists():
 configured=json.loads(record_file.read_text())
 if not isinstance(configured,dict) or set(configured)!={"records"} or not isinstance(configured["records"],list) or not 1<=len(configured["records"])<=100:raise ValueError("Invalid fixture enrollment")
 for scope in configured["records"]:
  if not isinstance(scope,dict) or set(scope)!={"version","workspaceId","contactId","recipient"} or scope["version"]!="record-scope-1" or not isinstance(scope["contactId"],str) or not re.fullmatch(r"[0-9]{1,24}",scope["contactId"]) or scope["contactId"]=="1001" or not isinstance(scope["workspaceId"],str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}",scope["workspaceId"]) or not isinstance(scope["recipient"],str) or len(scope["recipient"])>254 or not re.fullmatch(r"[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test",scope["recipient"]) or scope["contactId"] in scopes:raise ValueError("Invalid fixture scope")
  scopes[scope["contactId"]]=scope
 if len({s["recipient"] for s in scopes.values()})!=len(scopes):raise ValueError("Duplicate fixture recipient")
engines={}
for name,provider in [("crm","hubspot"),("email","resend")]:
 cfg=yaml.safe_load((backend/f"configs/{provider}/sandbox_config.yaml").read_text())
 engines[name]=SandboxEngine(sandbox_id=f"looplabs-{name}-private",spec=parse_spec_file(backend/f"specs/{provider}/openapi.yaml",name=provider),rules=load_rules_from_config(cfg),resource_config=cfg["resources"],request_idempotency=cfg.get("request_idempotency"),request_validation_mode=cfg.get("request_validation_mode","strict"),auth_config=AuthConfig(enabled=True,mode="relaxed",credentials=[SandboxCredentials(api_key=secret,api_secret="")]))
state_file=private/"connector-twin-state.json"
effects={}
if state_file.exists():
 saved=json.loads(state_file.read_text());effects=saved["effects"]
 for name,engine in engines.items():engine.seed_data(saved[name])
else:
 engines["crm"].seed_data({"contacts":[{"id":"1001","properties":{"email":"customer@example.test","lifecyclestage":"lead"},"createdAt":"2026-10-04T00:00:00Z","updatedAt":"2026-10-04T00:00:00Z","archived":False}]})
# Never overwrite a restored record or its version; changed enrollment is refused.
for contact_id,scope in scopes.items():
 record=engines["crm"].state.collection("contacts").get(contact_id)
 if record is None:
  engines["crm"].state.collection("contacts").create({"id":contact_id,"properties":{"email":scope["recipient"],"lifecyclestage":"lead"},"createdAt":"2026-10-08T00:00:00Z","updatedAt":"enrolled-"+contact_id,"archived":False})
def persist():
 data={name:e.state.snapshot(include_internal=True) for name,e in engines.items()};data["effects"]=effects
 tmp=state_file.with_suffix(".tmp")
 with open(tmp,"w") as f:
  os.chmod(tmp,0o600);json.dump(data,f);f.flush();os.fsync(f.fileno())
 os.replace(tmp,state_file)
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
@app.api_route("/{path:path}",methods=["GET","POST","PATCH"])
async def route(path:str,request:Request):
 if request.headers.get("authorization")!=f"Bearer {secret}":return JSONResponse({"error":"Private fixture access required"},status_code=401)
 if path.startswith("proof/effects/") and request.method=="GET":
  e=effects.get(path.split("/")[-1]);return JSONResponse(e or {"error":"No effect proven"},status_code=200 if e else 404)
 name,_,rest=path.partition("/");api="/"+rest
 if name not in engines:return JSONResponse({"error":"Unknown connector"},status_code=403)
 match=re.fullmatch(r"/crm/v3/objects/contacts/([0-9]{1,24})",api)
 contact_id=match.group(1) if match else request.headers.get("x-looplabs-record-id","1001")
 scope=scopes.get(contact_id)
 if contact_id!="1001" and (not scope or request.method!="GET" and request.headers.get("x-looplabs-workspace-id")!=scope["workspaceId"]):return JSONResponse({"error":"Outside enrolled record scope"},status_code=403)
 allowed=(name=="crm" and match and (contact_id=="1001" or scope) and request.method in ["GET","PATCH"]) or (name=="email" and ((api=="/emails" and request.method=="POST") or (api.startswith("/emails/") and request.method=="GET")))
 if not allowed:return JSONResponse({"error":"Outside prepared connector scope"},status_code=403)
 body=None;action=None
 if request.method!="GET":
  raw=await request.body()
  if len(raw)>2048:return JSONResponse({"error":"Too large"},status_code=413)
  try:body=json.loads(raw)
  except ValueError:return JSONResponse({"error":"Invalid JSON"},status_code=400)
  key=request.headers.get("idempotency-key","")
  if not re.fullmatch(r"looplabs-[0-9a-fA-F-]{36}",key):return JSONResponse({"error":"Stable action key required"},status_code=400)
  action=key[9:]
  recipient=scope["recipient"] if scope else "customer@example.test"
  valid=(name=="crm" and body in [{"properties":{"lifecyclestage":"lead"}},{"properties":{"lifecyclestage":"customer"}}]) or (name=="email" and body=={"from":"LoopLabs <support@looplabs.example>","to":[recipient],"subject":"We received your case","text":"Your request was received. A team member will review it."})
  if not valid:return JSONResponse({"error":"Outside approved sample payload"},status_code=403)
  if action in effects:
   e=effects[action]
   if e["connector"]!=name or e["body"]!=body or e.get("recordId","1001")!=contact_id or e.get("resource",api)!=api:return JSONResponse({"error":"Changed request"},status_code=409)
   return JSONResponse(e["response"])
  if scope and request.headers.get("x-looplabs-proof-fault")=="recipient_changed":
   engines["crm"].state.collection("contacts").update(contact_id,{"properties":{"email":"changed@example.test","lifecyclestage":"lead"},"updatedAt":"recipient-changed-"+action});persist()
  current=engines["crm"].state.collection("contacts").get(contact_id)
  if scope and (not current or current.get("properties",{}).get("email")!=recipient):return JSONResponse({"error":"Contact recipient changed"},status_code=409)
  if name=="crm" and request.headers.get("if-match")!=current.get("updatedAt"):
   return JSONResponse({"error":"Contact version changed"},status_code=409)
  # Fixture-only fault controls. Never forward these to any live provider.
  fault=request.headers.get("x-looplabs-proof-fault")
  if fault in ["401","429","500"]:return JSONResponse({"error":"Injected provider failure"},status_code=int(fault))
 result=engines[name].process_request(request.method,api,dict(request.headers),dict(request.query_params),body)
 if action and 200<=result.status<300:
  ref=contact_id if name=="crm" else result.body.get("id")
  record=engines[name].state.collection("contacts" if name=="crm" else "emails").get(ref)
  if name=="crm":
   # A deterministic unique fixture version prevents same-value ABA writes
   # from hiding a later operation. This is not a live HubSpot CAS primitive.
   version=hashlib.sha256(action.encode()).hexdigest()
   engines[name].state.collection("contacts").update(ref,{"updatedAt":version})
  else:version=None
  effects[action]={"actionId":action,"connector":name,"body":body,"recordId":contact_id,"resource":api,"reference":ref,"observedVersion":version,"response":result.body}
  persist()
 if action and request.headers.get("x-looplabs-lose-response")=="true" and 200<=result.status<300:await asyncio.sleep(3)
 return JSONResponse(result.body,status_code=result.status)
if __name__=="__main__":
 import uvicorn
 persist();uvicorn.run(app,host="0.0.0.0" if os.environ.get("LOOPLABS_TWIN_CONTAINER")=="1" else "127.0.0.1",port=8018,access_log=False,log_level="warning")
