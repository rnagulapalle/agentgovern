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
import stat
import hmac
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
# Offline, private fault injection used only by reproducible connector drills.
fault_file=private/"connector-twin-faults.json"
lose_records=set()
if fault_file.exists():
 faults=json.loads(fault_file.read_text())
 if not isinstance(faults,dict) or set(faults)!={"loseResponseRecords"} or not isinstance(faults["loseResponseRecords"],list) or any(not isinstance(r,str) or r not in scopes for r in faults["loseResponseRecords"]):raise ValueError("Invalid private fixture fault selection")
 lose_records=set(faults["loseResponseRecords"])
# Native quote-mail enrollment is optional/offline and never enables generic mail.
quote_mail={}
full_offline_pins={}
opaque_offline=False
full_offline_config=None
quote_mail_file=private/"connector-twin-quote-mail.json"
def quote_digest(value):
 return hashlib.sha256(("looplabs-quote-proposal-1\n"+json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False)).encode()).hexdigest()
if quote_mail_file.exists():
 configured=json.loads(quote_mail_file.read_text())
 if isinstance(configured,dict) and set(configured)=={"version","pins"} and configured["version"]=="native-quote-mail-enrollment-2":
  full_offline_config=configured
  configured={"version":"native-quote-mail-enrollment-1","entries":[]}
 else:opaque_offline=True
 if not isinstance(configured,dict) or set(configured)!={"version","entries"} or configured["version"]!="native-quote-mail-enrollment-1" or not isinstance(configured["entries"],list) or not (0 if full_offline_config else 1)<=len(configured["entries"])<=20:raise ValueError("Invalid quote email enrollment")
 for entry in configured["entries"]:
  if not isinstance(entry,dict) or set(entry)!={"request","requestIdentity","quoteRequestIdentity"}:raise ValueError("Invalid exact quote email pin")
  r=entry["request"]
  if not isinstance(r,dict) or set(r)!={"contract","binding","workspaceId","quoteId","method","resource","idempotencyKey","body"} or r["contract"]!="quote-email-request-1" or r["method"]!="POST" or r["resource"]!="/emails" or not all(isinstance(r[k],str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}",r[k]) for k in ["workspaceId","quoteId"]) or not re.fullmatch(r"[a-f0-9]{64}",r["binding"]) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",r["idempotencyKey"]) or entry["requestIdentity"]!=quote_digest(r) or not isinstance(entry["quoteRequestIdentity"],str) or not re.fullmatch(r"[a-f0-9]{64}",entry["quoteRequestIdentity"]):raise ValueError("Invalid quote mail identity")
  b=r["body"]
  if not isinstance(b,dict) or set(b)!={"from","to","subject","text"} or not isinstance(b["from"],str) or not re.fullmatch(r"[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test",b["from"]) or not isinstance(b["to"],list) or len(b["to"])!=1 or not isinstance(b["to"][0],str) or not re.fullmatch(r"[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test",b["to"][0]) or not isinstance(b["subject"],str) or not 1<=len(b["subject"])<=120 or not isinstance(b["text"],str) or not 1<=len(b["text"])<=800:raise ValueError("Invalid pinned message")
  if r["idempotencyKey"] in quote_mail:raise ValueError("Duplicate quote email action")
  quote_mail[r["idempotencyKey"]]=entry
# Separately credentialed local pin provisioner; never an execution credential.
provisioner=None
provisioner_file=private/"connector-twin-quote-provisioner.json"
def read_owned_provisioner(path):
 if str(path.resolve())!=str(path.absolute()) or str(path.parent.resolve())!=str(path.parent.absolute()):raise ValueError("Private generation path")
 directory=path.parent.stat()
 if not stat.S_ISDIR(directory.st_mode) or directory.st_uid!=os.getuid() or stat.S_IMODE(directory.st_mode)!=0o700:raise ValueError("Private generation directory")
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_nlink!=1 or stat.S_IMODE(before.st_mode)!=0o600 or before.st_size>16384:raise ValueError("Private generation file")
  value=os.read(fd,16385);after=os.fstat(fd);actual=path.lstat()
  identity=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_uid,s.st_mode,s.st_nlink)
  if identity(before)!=identity(after) or identity(before)!=identity(actual):raise ValueError("Private generation changed")
  def check():
   if str(path.resolve())!=str(path.absolute()) or str(path.parent.resolve())!=str(path.parent.absolute()) or identity(path.lstat())!=identity(before):raise ValueError("Private generation changed")
   current=path.parent.stat()
   if (current.st_dev,current.st_ino,current.st_uid,stat.S_IMODE(current.st_mode))!=(directory.st_dev,directory.st_ino,directory.st_uid,0o700):raise ValueError("Private generation changed")
  check();return value,check
 finally:os.close(fd)

if provisioner_file.exists():
 provisioner_bytes,provisioner_stable=read_owned_provisioner(provisioner_file)
 provisioner_ready_bytes,provisioner_ready_stable=read_owned_provisioner(private/"connector-twin-quote-provisioner-ready.json")
 provisioner_ready=json.loads(provisioner_ready_bytes)
 if provisioner_ready!={"version":1,"purpose":"quote-pin-provisioner","sha256":hashlib.sha256(provisioner_bytes).hexdigest()}:raise ValueError("Provisioner generation mismatch")
 provisioner=json.loads(provisioner_bytes)
 if not isinstance(provisioner,dict) or set(provisioner)!={"version","purpose","token","workspaceId","quoteId","quoteBinding","emailBinding"} or provisioner["version"]!="native-quote-pin-provisioner-1" or provisioner["purpose"]!="quote-pin-provisioner" or not isinstance(provisioner["token"],str) or len(provisioner["token"])<32 or provisioner["token"]==secret or any(not isinstance(provisioner[k],str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}",provisioner[k]) for k in ["workspaceId","quoteId"]) or any(not isinstance(provisioner[k],str) or not re.fullmatch(r"[a-f0-9]{64}",provisioner[k]) for k in ["quoteBinding","emailBinding"]) or provisioner["quoteBinding"]==provisioner["emailBinding"]:raise ValueError("Invalid private provisioning generation")
def valid_dynamic_pin(pin,scope=None):
 if not isinstance(pin,dict) or set(pin)!={"quoteRequest","messageRequest"}:return False
 q=pin["quoteRequest"];m=pin["messageRequest"]
 if not isinstance(q,dict) or set(q)!={"contract","binding","method","resource","workspaceId","sourceVersion","idempotencyKey","body"} or q["contract"]!="quote-conditional-write-1" or q["method"]!="PATCH" or not isinstance(m,dict) or set(m)!={"contract","binding","workspaceId","quoteId","method","resource","idempotencyKey","body"} or m["contract"]!="quote-email-request-1" or m["method"]!="POST" or m["resource"]!="/emails":return False
 scope=scope or provisioner
 if not scope or q["workspaceId"]!=scope["workspaceId"] or m["workspaceId"]!=scope["workspaceId"] or m["quoteId"]!=scope["quoteId"] or q["resource"]!="/quotes/"+scope["quoteId"] or q["binding"]!=scope["quoteBinding"] or m["binding"]!=scope["emailBinding"] or not isinstance(q["sourceVersion"],str) or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}",q["sourceVersion"]):return False
 if any(not isinstance(r["idempotencyKey"],str) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",r["idempotencyKey"]) for r in [q,m]) or q["idempotencyKey"]==m["idempotencyKey"]:return False
 b=q["body"];e=m["body"]
 if not isinstance(b,dict) or set(b)!={"distributorId","currency","subtotalMinor","discountBps","totalMinor"} or not isinstance(b["distributorId"],str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}",b["distributorId"]) or b["currency"]!="USD" or any(type(b[k]) is not int or not 0<=b[k]<=9007199254740991 for k in ["subtotalMinor","discountBps","totalMinor"]) or b["subtotalMinor"]<1 or b["discountBps"]>10000 or b["subtotalMinor"]*(10000-b["discountBps"])!=b["totalMinor"]*10000:return False
 if not isinstance(e,dict) or set(e)!={"from","to","subject","text"} or not isinstance(e["from"],str) or not re.fullmatch(r"[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test",e["from"]) or not isinstance(e["to"],list) or len(e["to"])!=1 or not isinstance(e["to"][0],str) or not re.fullmatch(r"[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test",e["to"][0]) or not isinstance(e["subject"],str) or not 1<=len(e["subject"])<=120 or e["subject"].strip()!=e["subject"] or re.search(r"[\x00-\x1f\x7f]",e["subject"]) or not isinstance(e["text"],str) or not 1<=len(e["text"])<=800 or e["text"].strip()!=e["text"] or re.search(r"[\x00-\x09\x0b-\x1f\x7f<>]",e["text"]) or re.search(r"\b(?:sk[-_](?:live|test)|ghp_|AKIA|password\s*[:=]|api[_ -]?key\s*[:=])|-----BEGIN",e["subject"]+"\n"+e["text"],re.I):return False
 return True
def enrollment_receipt(pin):
 return {"contract":"native-quote-email-enrollment-1","workspaceId":pin["messageRequest"]["workspaceId"],"quoteId":pin["messageRequest"]["quoteId"],"quoteActionId":pin["quoteRequest"]["idempotencyKey"],"messageActionId":pin["messageRequest"]["idempotencyKey"],"requestIdentity":quote_digest(pin["messageRequest"]),"quoteRequestIdentity":quote_digest(pin["quoteRequest"]),"pinDigest":quote_digest(pin)}
def mail_entry(pin):return {"request":pin["messageRequest"],"requestIdentity":quote_digest(pin["messageRequest"]),"quoteRequestIdentity":quote_digest(pin["quoteRequest"])}
def consistent_pins(pins):
 messages={};updates={}
 for pin in pins:
  q=pin["quoteRequest"];m=pin["messageRequest"];action=m["idempotencyKey"];update=q["idempotencyKey"]
  if action in updates or update in messages or action in messages and messages[action]!=pin or update in updates and updates[update]!=q:return False
  messages[action]=pin;updates[update]=q
 return True
if opaque_offline and provisioner:raise ValueError("Opaque offline pins cannot coexist with dynamic provisioning")
if full_offline_config:
 full_bytes,full_stable=read_owned_provisioner(quote_mail_file)
 if json.loads(full_bytes)!=full_offline_config:raise ValueError("Offline generation changed")
 full_stable()
 if not isinstance(full_offline_config["pins"],list) or not 1<=len(full_offline_config["pins"])<=20:raise ValueError("Invalid full offline pins")
 for pin in full_offline_config["pins"]:
  if not isinstance(pin,dict) or not isinstance(pin.get("quoteRequest"),dict) or not isinstance(pin.get("messageRequest"),dict):raise ValueError("Invalid full offline pin")
  q=pin["quoteRequest"];m=pin["messageRequest"]
  scope={"workspaceId":m.get("workspaceId"),"quoteId":m.get("quoteId"),"quoteBinding":q.get("binding"),"emailBinding":m.get("binding")}
  if any(not isinstance(scope[k],str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}",scope[k]) for k in ["workspaceId","quoteId"]) or any(not isinstance(scope[k],str) or not re.fullmatch(r"[a-f0-9]{64}",scope[k]) for k in ["quoteBinding","emailBinding"]) or scope["quoteBinding"]==scope["emailBinding"] or not valid_dynamic_pin(pin,scope) or provisioner and not valid_dynamic_pin(pin):raise ValueError("Invalid full offline pin")
  action=m["idempotencyKey"]
  if action in full_offline_pins:raise ValueError("Duplicate offline pin")
  full_offline_pins[action]=pin;quote_mail[action]=mail_entry(pin)
 if not consistent_pins(full_offline_pins.values()):raise ValueError("Contradictory offline pin collection")
provision_fault=None
provision_fault_file=private/"connector-twin-provisioning-fault.json"
if provision_fault_file.exists():
 if not provisioner:raise ValueError("Provisioning fixture required")
 fault_bytes,_=read_owned_provisioner(provision_fault_file);provision_fault=json.loads(fault_bytes)
 if not isinstance(provision_fault,dict) or set(provision_fault)!={"version","stage","action"} or provision_fault["version"]!="owned-provisioning-checkpoint-1" or provision_fault["stage"] not in ["after_body","after_persist"] or not isinstance(provision_fault["action"],str) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",provision_fault["action"]):raise ValueError("Invalid owned provisioning checkpoint")
async def provision_checkpoint(stage,action):
 if not provision_fault or provision_fault["stage"]!=stage or provision_fault["action"]!=action:return
 checkpoint=private/"provisioning-checkpoint.json"
 with open(checkpoint,"x") as f:os.chmod(checkpoint,0o600);json.dump({"stage":stage,"action":action},f)
 for _ in range(100):
  if (private/"provisioning-release").exists():return
  await asyncio.sleep(0.05)
 raise ValueError("Owned provisioning checkpoint unreleased")
dynamic_quote_pins={}
engines={}
for name,provider in [("crm","hubspot"),("email","resend")]:
 cfg=yaml.safe_load((backend/f"configs/{provider}/sandbox_config.yaml").read_text())
 engines[name]=SandboxEngine(sandbox_id=f"looplabs-{name}-private",spec=parse_spec_file(backend/f"specs/{provider}/openapi.yaml",name=provider),rules=load_rules_from_config(cfg),resource_config=cfg["resources"],request_idempotency=cfg.get("request_idempotency"),request_validation_mode=cfg.get("request_validation_mode","strict"),auth_config=AuthConfig(enabled=True,mode="relaxed",credentials=[SandboxCredentials(api_key=secret,api_secret="")]))
state_file=private/"connector-twin-state.json"
# Private copied fixture opt-in only; no change to released fixture capability.
content_file=private/"connector-twin-content.json"
reviewed_content=False
if content_file.exists():
 content=json.loads(content_file.read_text())
 if content!={"version":"reviewed-acknowledgement-2"}:raise ValueError("Invalid copied fixture content contract")
 reviewed_content=True
def valid_reviewed_email(body,recipient):
 if not reviewed_content or not isinstance(body,dict) or set(body)!={"from","to","subject","text"} or body["from"]!="LoopLabs <support@looplabs.example>" or body["to"]!=[recipient]:return False
 subject=body["subject"];text=body["text"]
 return isinstance(subject,str) and 1<=len(subject)<=120 and subject.strip()==subject and not re.search(r"[\x00-\x1f\x7f]",subject) and isinstance(text,str) and 1<=len(text)<=800 and text.strip()==text and not re.search(r"[\x00-\x09\x0b-\x1f\x7f<>]",text) and not re.search(r"\b(?:sk[-_](?:live|test)|ghp_|AKIA|password\s*[:=]|api[_ -]?key\s*[:=])|-----BEGIN",subject+"\n"+text,re.I)
effects={}
if state_file.exists():
 saved=json.loads(state_file.read_text());effects=saved["effects"]
 dynamic_quote_pins=saved.get("quotePins",{})
 if not isinstance(dynamic_quote_pins,dict) or len(dynamic_quote_pins)>100 or opaque_offline and dynamic_quote_pins:raise ValueError("Invalid persisted pins")
 for action,pin in dynamic_quote_pins.items():
  if not valid_dynamic_pin(pin) or action!=pin["messageRequest"]["idempotencyKey"] or action in quote_mail and quote_mail[action]!=mail_entry(pin):raise ValueError("Restored pin differs")
  quote_mail[action]=mail_entry(pin)
 if not consistent_pins([*full_offline_pins.values(),*dynamic_quote_pins.values()]):raise ValueError("Contradictory restored pin collection")
 for name,engine in engines.items():engine.seed_data(saved[name])
else:
 engines["crm"].seed_data({"contacts":[{"id":"1001","properties":{"email":"customer@example.test","lifecyclestage":"lead"},"createdAt":"2026-10-04T00:00:00Z","updatedAt":"2026-10-04T00:00:00Z","archived":False}]})
# Never overwrite a restored record or its version; changed enrollment is refused.
for contact_id,scope in scopes.items():
 record=engines["crm"].state.collection("contacts").get(contact_id)
 if record is None:
  engines["crm"].state.collection("contacts").create({"id":contact_id,"properties":{"email":scope["recipient"],"lifecyclestage":"lead"},"createdAt":"2026-10-08T00:00:00Z","updatedAt":"enrolled-"+contact_id,"archived":False})
persistence_failed=False
def persist(inject_failure=False):
 global persistence_failed
 try:
  if inject_failure:raise OSError("Injected fixture persistence failure")
  data={name:e.state.snapshot(include_internal=True) for name,e in engines.items()};data["effects"]=effects;data["quotePins"]=dynamic_quote_pins
  tmp=state_file.with_suffix(".tmp")
  with open(tmp,"w") as f:
   os.chmod(tmp,0o600);json.dump(data,f);f.flush();os.fsync(f.fileno())
  os.replace(tmp,state_file)
  directory=os.open(private,os.O_RDONLY)
  try:os.fsync(directory)
  finally:os.close(directory)
 except Exception:
  # A volatile native-engine effect is not a durable verification receipt.
  # Refuse all further evidence/writes until a fresh process reads persisted state.
  persistence_failed=True
  raise
app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
@app.api_route("/{path:path}",methods=["GET","POST","PATCH"])
async def route(path:str,request:Request):
 if path=="quote-email/enroll":
  if not provisioner or not hmac.compare_digest(request.headers.get("authorization",""),"Bearer "+provisioner["token"]):return JSONResponse({"error":"Private provisioner required"},status_code=401)
  try:provisioner_stable();provisioner_ready_stable()
  except Exception:return JSONResponse({"error":"Provisioner generation unavailable"},status_code=503)
  if persistence_failed:return JSONResponse({"error":"Provisioning persistence unavailable"},status_code=503)
  if request.method!="POST":return JSONResponse({"error":"Provisioning operation differs"},status_code=403)
  raw=await request.body()
  if len(raw)>16384:return JSONResponse({"error":"Bounded pin required"},status_code=413)
  try:
   pin=json.loads(raw)
   await provision_checkpoint("after_body",pin.get("messageRequest",{}).get("idempotencyKey"))
   provisioner_stable();provisioner_ready_stable()
  except Exception:return JSONResponse({"error":"Invalid pin or generation"},status_code=400)
  if not valid_dynamic_pin(pin):return JSONResponse({"error":"Exact scoped pin required"},status_code=409)
  action=pin["messageRequest"]["idempotencyKey"];update=pin["quoteRequest"]["idempotencyKey"]
  if request.headers.get("x-looplabs-workspace")!=provisioner["workspaceId"] or request.headers.get("x-looplabs-quote")!=provisioner["quoteId"] or request.headers.get("x-looplabs-binding")!=provisioner["emailBinding"] or request.headers.get("idempotency-key")!=action:return JSONResponse({"error":"Provisioning scope differs"},status_code=403)
  if action in dynamic_quote_pins:
   if dynamic_quote_pins[action]!=pin:return JSONResponse({"error":"Changed retained pin"},status_code=409)
   return JSONResponse(enrollment_receipt(pin))
  if action in quote_mail and quote_mail[action]!=mail_entry(pin):return JSONResponse({"error":"Changed offline pin"},status_code=409)
  for prior in [*full_offline_pins.values(),*dynamic_quote_pins.values()]:
   if prior["messageRequest"]["idempotencyKey"]==update or prior["quoteRequest"]["idempotencyKey"]==action or prior["quoteRequest"]["idempotencyKey"]==update and prior["quoteRequest"]!=pin["quoteRequest"]:return JSONResponse({"error":"Reused action identity"},status_code=409)
  if len(dynamic_quote_pins)>=100:return JSONResponse({"error":"Bounded enrollment capacity"},status_code=409)
  dynamic_quote_pins[action]=pin;quote_mail[action]=mail_entry(pin)
  try:
   persist(request.headers.get("x-looplabs-proof-fault")=="storage_failure")
   await provision_checkpoint("after_persist",action)
   provisioner_stable();provisioner_ready_stable()
  except Exception:return JSONResponse({"error":"Enrollment outcome unavailable"},status_code=503)
  return JSONResponse(enrollment_receipt(pin))
 if request.headers.get("authorization")!=f"Bearer {secret}":return JSONResponse({"error":"Private fixture access required"},status_code=401)
 if persistence_failed:return JSONResponse({"error":"Fixture persistence unavailable; no durable effect can be attested"},status_code=503)
 if path.startswith("quote-email/"):
  action=path.split("/")[-1] if path.startswith("quote-email/effects/") else None
  raw=None
  if request.method=="POST" and path=="quote-email/emails":
   raw=await request.body()
   if len(raw)>16384:return JSONResponse({"error":"Exact bounded mail required"},status_code=413)
   try:raw=json.loads(raw)
   except ValueError:return JSONResponse({"error":"Invalid mail"},status_code=400)
   action=raw.get("idempotencyKey") if isinstance(raw,dict) else None
  entry=quote_mail.get(action)
  if not entry:return JSONResponse({"error":"No enrolled quote email"},status_code=403)
  pinned=entry["request"]
  if request.headers.get("x-looplabs-workspace")!=pinned["workspaceId"] or request.headers.get("x-looplabs-quote")!=pinned["quoteId"] or request.headers.get("x-looplabs-binding")!=pinned["binding"]:return JSONResponse({"error":"Quote email scope differs"},status_code=403)
  if request.method=="GET" and path=="quote-email/effects/"+action:
   e=effects.get(action)
   if not e or e.get("contract")!="quote-email-effect-1":return JSONResponse({"error":"No retained email effect"},status_code=404)
   if e.get("requestIdentity")!=entry["requestIdentity"] or e.get("quoteRequestIdentity")!=entry["quoteRequestIdentity"]:return JSONResponse({"error":"Restored email enrollment differs"},status_code=409)
   current=engines["email"].state.collection("emails").get(e["reference"])
   return JSONResponse({"contract":"quote-email-lookup-1","effect":e,"currentEmail":current})
  if request.method!="POST" or path!="quote-email/emails":return JSONResponse({"error":"Unsupported quote email route"},status_code=403)
  if raw!=pinned or request.headers.get("idempotency-key")!="looplabs-"+action:return JSONResponse({"error":"Exact pinned quote email differs"},status_code=409)
  if action in effects:
   e=effects[action]
   if e.get("contract")!="quote-email-effect-1" or e.get("requestIdentity")!=entry["requestIdentity"] or e.get("quoteRequestIdentity")!=entry["quoteRequestIdentity"]:return JSONResponse({"error":"Changed email action"},status_code=409)
   return JSONResponse({"id":e["reference"]})
  result=engines["email"].process_request("POST","/emails",dict(request.headers),{},pinned["body"])
  if 200<=result.status<300:
   ref=result.body.get("id")
   if not isinstance(ref,str) or not engines["email"].state.collection("emails").get(ref):return JSONResponse({"error":"Email evidence unavailable"},status_code=503)
   effects[action]={"contract":"quote-email-effect-1","binding":pinned["binding"],"workspaceId":pinned["workspaceId"],"quoteId":pinned["quoteId"],"actionId":action,"requestIdentity":entry["requestIdentity"],"quoteRequestIdentity":entry["quoteRequestIdentity"],"reference":ref,"body":pinned["body"]}
   try:persist(request.headers.get("x-looplabs-proof-fault")=="storage_failure")
   except Exception:return JSONResponse({"error":"Email outcome unavailable"},status_code=503)
   if request.headers.get("x-looplabs-lose-response")=="true":await asyncio.sleep(3)
  return JSONResponse(result.body,status_code=result.status)
 if path.startswith("proof/effects/") and request.method=="GET":
  e=effects.get(path.split("/")[-1]);
  if e and e.get("contract")=="quote-email-effect-1":return JSONResponse({"error":"Use bound quote lookup"},status_code=403)
  return JSONResponse(e or {"error":"No effect proven"},status_code=200 if e else 404)
 name,_,rest=path.partition("/");api="/"+rest
 if name=="email" and request.method=="GET" and any(e.get("contract")=="quote-email-effect-1" and api=="/emails/"+e["reference"] for e in effects.values()):return JSONResponse({"error":"Use bound quote lookup"},status_code=403)
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
  valid=(name=="crm" and body in [{"properties":{"lifecyclestage":"lead"}},{"properties":{"lifecyclestage":"customer"}}]) or (name=="email" and (body=={"from":"LoopLabs <support@looplabs.example>","to":[recipient],"subject":"We received your case","text":"Your request was received. A team member will review it."} or valid_reviewed_email(body,recipient)))
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
  try:persist(request.headers.get("x-looplabs-proof-fault")=="storage_failure")
  except Exception:return JSONResponse({"error":"Fixture persistence failed; outcome requires review"},status_code=503)
 if action and (request.headers.get("x-looplabs-lose-response")=="true" or name=="crm" and contact_id in lose_records) and 200<=result.status<300:await asyncio.sleep(3)
 return JSONResponse(result.body,status_code=result.status)
if __name__=="__main__":
 import uvicorn
 persist();uvicorn.run(app,host="0.0.0.0" if os.environ.get("LOOPLABS_TWIN_CONTAINER")=="1" else "127.0.0.1",port=8018,access_log=False,log_level="warning")
