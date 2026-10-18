"""Owned loopback TLS listener around the exact existing private fixture app.
No handler, journal or provider authority is implemented a second time.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import ssl
import stat
import subprocess
import sys
import time

def refuse():
    raise ValueError("Owned quote-email TLS generation refused")

def owned(path, limit=16384):
    path=Path(path)
    if not path.is_absolute() or str(path.resolve())!=str(path):refuse()
    for ancestor in [path,*path.parents]:
        if ancestor.is_symlink():refuse()
    parent=path.parent.stat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=os.getuid() or stat.S_IMODE(parent.st_mode)!=0o700:refuse()
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    identity=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_uid,s.st_mode,s.st_nlink)
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_nlink!=1 or stat.S_IMODE(before.st_mode)!=0o600 or not 1<=before.st_size<=limit:refuse()
        chunks=[];size=0
        while size<=limit:
            chunk=os.read(fd,min(4096,limit+1-size))
            if not chunk:break
            chunks.append(chunk);size+=len(chunk)
        if size!=before.st_size or identity(before)!=identity(os.fstat(fd)):refuse()
        def stable():
            try:
                p=path.parent.stat()
                if str(path.resolve())!=str(path) or identity(path.lstat())!=identity(before) or (p.st_dev,p.st_ino,p.st_uid,stat.S_IMODE(p.st_mode))!=(parent.st_dev,parent.st_ino,parent.st_uid,0o700):refuse()
            except Exception:refuse()
        stable();return b"".join(chunks),stable
    finally:os.close(fd)

def main():
    parser=argparse.ArgumentParser(add_help=False);parser.add_argument("--tls-generation",required=True);parser.add_argument("--owned-container-quote-email",action="store_true");args=parser.parse_args()
    if args.owned_container_quote_email and not Path("/.dockerenv").is_file():refuse()
    host="0.0.0.0" if args.owned_container_quote_email else "127.0.0.1"
    hostname="quote-email.looplabs.test" if args.owned_container_quote_email else "127.0.0.1"
    file=Path(args.tls_generation)
    if file.name!="tls.json":refuse()
    config,config_stable=owned(file);ready,ready_stable=owned(file.parent/"ready.json");cert,cert_stable=owned(file.parent/"cert.pem");key,key_stable=owned(file.parent/"key.pem")
    c=json.loads(config);r=json.loads(ready);digest=lambda value:hashlib.sha256(value).hexdigest()
    if not isinstance(c,dict) or set(c)!={"version","purpose","workspaceId","quoteId","quoteBinding","emailBinding","certSha256","keySha256","executionCredentialSha256","provisionerCredentialSha256","port"} or c["version"]!=1 or c["purpose"]!="quote-email-server" or type(c["port"]) is not int or not 1<=c["port"]<=65535 or c["port"] in [8018,8019] or any(not isinstance(c[k],str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}",c[k]) for k in ["workspaceId","quoteId"]) or any(not isinstance(c[k],str) or not re.fullmatch(r"[a-f0-9]{64}",c[k]) for k in ["quoteBinding","emailBinding","certSha256","keySha256","executionCredentialSha256","provisionerCredentialSha256"]) or c["quoteBinding"]==c["emailBinding"] or c["certSha256"]!=digest(cert) or c["keySha256"]!=digest(key) or r!={"version":1,"purpose":"quote-email-server","sha256":digest(config)}:refuse()
    if not re.fullmatch(rb"-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*",cert) or not re.fullmatch(rb"-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PRIVATE KEY-----\s*",key):refuse()
    # Only the public certificate is inspected; private key bytes never leave
    # the owned process. SSLContext enforces certificate/private-key match.
    result=subprocess.run(["openssl","x509","-in",str(file.parent/"cert.pem"),"-noout","-startdate","-enddate","-ext","basicConstraints,subjectAltName"],capture_output=True,timeout=3,check=True)
    if len(result.stdout)>131072:refuse()
    public=result.stdout.decode("ascii");expected_san=r"(?m)^\s*IP Address:127\.0\.0\.1, DNS:quote-email\.looplabs\.test\s*$" if args.owned_container_quote_email else r"(?m)^\s*IP Address:127\.0\.0\.1\s*$";start=re.search(r"notBefore=(.+)",public);end=re.search(r"notAfter=(.+)",public)
    if not start or not end or not ssl.cert_time_to_seconds(start.group(1))<=time.time()<ssl.cert_time_to_seconds(end.group(1)) or not re.search(r"(?m)^\s*CA:FALSE\s*$",public) or not re.search(expected_san,public):refuse()
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2;context.load_cert_chain(str(file.parent/"cert.pem"),str(file.parent/"key.pem"))
    state=Path(os.environ.get("LOOPLABS_CONNECTOR_STATE_DIR",""))
    execution,execution_stable=owned(state/"connector-twin-credentials.json");provisioning,provisioning_stable=owned(state/"connector-twin-quote-provisioner.json")
    e=json.loads(execution);p=json.loads(provisioning)
    if c["executionCredentialSha256"]!=digest(execution) or c["provisionerCredentialSha256"]!=digest(provisioning) or not isinstance(e,dict) or set(e)!={"token"} or not isinstance(e["token"],str) or not re.fullmatch(r"[A-Za-z0-9_-]{32,128}",e["token"]) or not isinstance(p,dict) or p.get("token")==e["token"] or any(p.get(k)!=c[k] for k in ["workspaceId","quoteId","quoteBinding","emailBinding"]):refuse()
    if args.owned_container_quote_email and c["port"]!=9444:refuse()
    # Import the real retained app once. It owns all source, journal, pin and
    # simulated acceptance semantics; TLS middleware creates none of them.
    spec=importlib.util.spec_from_file_location("owned_connector_twin",Path(__file__).with_name("connector-twin.py"));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    if module.secret!=e["token"] or module.provisioner!=p or module.opaque_offline:refuse()
    checks=[config_stable,ready_stable,cert_stable,key_stable,execution_stable,provisioning_stable,module.provisioner_stable,module.provisioner_ready_stable]
    def stable():
        for check in checks:check()
        if sorted(x.name for x in file.parent.iterdir())!=["cert.pem","key.pem","ready.json","tls.json"] or ssl.cert_time_to_seconds(end.group(1))<=time.time():refuse()
    stable()
    class Boundary:
        async def __call__(self,scope,receive,send):
            if scope["type"]!="http":return await module.app(scope,receive,send)
            async def unavailable(status=503):
                await send({"type":"http.response.start","status":status,"headers":[(b"content-type",b"application/json"),(b"cache-control",b"no-store")]});await send({"type":"http.response.body","body":b'{"error":"Exact TLS quote endpoint unavailable"}'})
            try:
                stable();path=scope["path"]
                if scope.get("query_string"):return await unavailable(403)
                if path not in ["/quote-email/enroll","/quote-email/emails"] and not re.fullmatch(r"/quote-email/effects/[0-9a-f-]{36}",path):return await unavailable(403)
                headers={}
                for k,v in scope["headers"]:
                    if k in [b"authorization",b"x-looplabs-workspace",b"x-looplabs-quote",b"x-looplabs-binding",b"idempotency-key"] and k in headers:return await unavailable(403)
                    headers[k]=v
                if any(headers.get(key)!=value.encode() for key,value in [(b"x-looplabs-workspace",c["workspaceId"]),(b"x-looplabs-quote",c["quoteId"]),(b"x-looplabs-binding",c["emailBinding"])]):return await unavailable(403)
                messages=[];size=0
                async def capture(message):
                    nonlocal size
                    size+=len(message.get("body",b""))
                    if size>16384 or len(messages)>32:refuse()
                    messages.append(message)
                await module.app(scope,receive,capture);stable()
                for message in messages:await send(message)
            except Exception:return await unavailable()
    import uvicorn
    stable();module.persist();sock=socket.socket(socket.AF_INET,socket.SOCK_STREAM);sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
    try:
        sock.bind((host,c["port"]));sock.listen(32);stable()
        configuration=uvicorn.Config(Boundary(),host=host,port=c["port"],access_log=False,log_level="warning",ssl_keyfile=str(file.parent/"key.pem"),ssl_certfile=str(file.parent/"cert.pem"),ssl_version=ssl.PROTOCOL_TLS_SERVER,timeout_keep_alive=3,timeout_graceful_shutdown=5)
        configuration.load();configuration.ssl.minimum_version=ssl.TLSVersion.TLSv1_2;stable()
        print(json.dumps({"origin":"https://"+hostname+":"+str(c["port"])}),flush=True);uvicorn.Server(configuration).run(sockets=[sock])
    finally:sock.close()

if __name__=="__main__":
    try:main()
    except Exception:
        print("Owned quote-email TLS startup refused",file=sys.stderr)
        sys.exit(1)
