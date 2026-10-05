"""Private cancellation fixture and FetchSandbox Resend engine. No live APIs.
Orders, action receipts and read-back are bounded LoopLabs fixture contracts.
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
backend=Path(os.environ.get("FETCHSANDBOX_BACKEND_PATH",str(Path.home()/"sandbox/backend")))
sys.path.insert(0,str(backend))
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.parser.spec_parser import parse_spec_file
from app.sandbox.engine import SandboxEngine
from app.sandbox.auth_simulator import AuthConfig, SandboxCredentials
from app.rules.engine import load_rules_from_config
import yaml
private=root/".local";os.chdir(private)
secret=json.loads((private/"backoffice-twin-credentials.json").read_text())["token"]
cfg=yaml.safe_load((backend/"configs/resend/sandbox_config.yaml").read_text())
engine=SandboxEngine(sandbox_id="looplabs-backoffice-email",spec=parse_spec_file(backend/"specs/resend/openapi.yaml",name="resend"),rules=load_rules_from_config(cfg),resource_config=cfg["resources"],request_validation_mode=cfg.get("request_validation_mode","strict"),auth_config=AuthConfig(enabled=True,mode="relaxed",credentials=[SandboxCredentials(api_key=secret,api_secret="")]))
file=private/"backoffice-twin-state.json"
orders={};messages={}
if file.exists():
 data=json.loads(file.read_text());orders=data["orders"];messages=data["messages"];engine.seed_data(data["email"])
def persist():
 tmp=file.with_suffix(".tmp")
 with open(tmp,"w") as f:
  os.chmod(tmp,0o600);json.dump({"orders":orders,"messages":messages,"email":engine.state.snapshot(include_internal=True)},f);f.flush();os.fsync(f.fileno())
 os.replace(tmp,file)
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
@app.api_route("/{path:path}",methods=["GET","POST"])
async def route(path:str,request:Request):
 if request.headers.get("authorization")!=f"Bearer {secret}":return JSONResponse({"error":"Private fixture credential required"},status_code=401)
 kind,_,id=path.partition("/")
 if kind not in ["orders","messages"] or not re.fullmatch(r"[0-9a-f-]{36}",id):return JSONResponse({"error":"Outside fixture scope"},status_code=403)
 if request.method=="GET":
  if kind=="orders":
   # Creating a prepared sample record is fixture setup, not a customer order lookup.
   orders.setdefault(id,{"id":id,"status":"open","version":1,"actionId":None});persist();return JSONResponse(orders[id])
  return JSONResponse(messages.get(id))
 raw=await request.body()
 if len(raw)>2048:return JSONResponse({"error":"Too large"},status_code=413)
 try:body=json.loads(raw)
 except ValueError:return JSONResponse({"error":"Malformed payload"},status_code=400)
 if kind=="orders":
  o=orders.get(id)
  if not o or set(body)!={"version"}:return JSONResponse({"error":"Missing order evidence"},status_code=409)
  if o["status"]=="cancelled" and o["actionId"]==id:return JSONResponse(o)
  if o["status"]!="open" or o["version"]!=body["version"]:return JSONResponse({"error":"Order changed"},status_code=409)
  o.update({"status":"cancelled","version":o["version"]+1,"actionId":id});persist()
 else:
  valid=set(body)=={"caseId","refundId","amount","recipient","status"} and body["caseId"]==id and body["recipient"]=="customer@example.test" and body["status"]=="accepted" and isinstance(body["amount"],int) and 0<body["amount"]<=10000 and isinstance(body["refundId"],str) and body["refundId"].startswith("re_")
  if not valid:return JSONResponse({"error":"Outside approved message fixture"},status_code=403)
  if id in messages:return JSONResponse(messages[id] if messages[id]==body else {"error":"Changed replay"},status_code=200 if messages[id]==body else 409)
  payload={"from":"LoopLabs <support@looplabs.example>","to":["customer@example.test"],"subject":"Your cancellation and refund","text":f"Your order was cancelled. The payment provider confirms a ${body['amount']/100:.2f} refund ({body['refundId']}). Your bank may take additional time to credit it."}
  result=engine.process_request("POST","/emails",dict(request.headers),{},payload)
  if not 200<=result.status<300:return JSONResponse({"error":"Email twin rejected request"},status_code=result.status)
  messages[id]=body;persist()
 if request.headers.get("x-looplabs-lose-response")=="true":await asyncio.sleep(3)
 return JSONResponse(orders[id] if kind=="orders" else messages[id])
if __name__=="__main__":
 import uvicorn
 persist();uvicorn.run(app,host="127.0.0.1",port=8019,access_log=False,log_level="warning")
