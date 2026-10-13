"""Owned quote-email readiness: exact private journal + authenticated TLS GET.
No enrollment, simulated delivery, effect creation or reconciliation is performed.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import ssl
import sys
from urllib.request import Request,build_opener,HTTPRedirectHandler,HTTPSHandler
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location('owned_quote_tls_reader',Path(__file__).with_name('connector-twin-tls.py'))
boundary=importlib.util.module_from_spec(spec);spec.loader.exec_module(boundary)
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def ready(file,container=False,open_request=None):
    try:
        path=Path(file)
        if path.name!='tls.json':return False
        config,config_stable=boundary.owned(path);marker,marker_stable=boundary.owned(path.parent/'ready.json');cert,cert_stable=boundary.owned(path.parent/'cert.pem')
        c=json.loads(config);r=json.loads(marker)
        if not isinstance(c,dict) or set(c)!={'version','purpose','workspaceId','quoteId','quoteBinding','emailBinding','certSha256','keySha256','executionCredentialSha256','provisionerCredentialSha256','port'}:return False
        if r!={'version':1,'purpose':'quote-email-server','sha256':hashlib.sha256(config).hexdigest()} or c.get('version')!=1 or c.get('purpose')!='quote-email-server' or c.get('certSha256')!=hashlib.sha256(cert).hexdigest():return False
        if type(c.get('port')) is not int or not 1<=c['port']<=65535 or c['port'] in [8018,8019] or container and c['port']!=9444:return False
        private=Path(os.environ.get('LOOPLABS_CONNECTOR_STATE_DIR',''))
        execution,execution_stable=boundary.owned(private/'connector-twin-credentials.json');journal,journal_stable=boundary.owned(private/'connector-twin-state.json',1048576)
        e=json.loads(execution);state=json.loads(journal)
        if c.get('executionCredentialSha256')!=hashlib.sha256(execution).hexdigest() or set(e)!={'token'} or not isinstance(e['token'],str) or not boundary.re.fullmatch(r'[A-Za-z0-9_-]{32,128}',e['token']):return False
        if not isinstance(state,dict) or set(state)!={'crm','email','effects','quotePins'} or not isinstance(state['effects'],dict) or not isinstance(state['quotePins'],dict) or not isinstance(state['email'],dict) or not isinstance(state['email'].get('emails'),list):return False
        host='quote-email.looplabs.test' if container else '127.0.0.1'
        # Trust precisely the source-owned leaf pinned in this sealed generation.
        # PARTIAL_CHAIN permits that exact leaf trust anchor; hostname, lifetime
        # and peer-chain verification remain mandatory. No verify=False bypass.
        context=ssl.create_default_context(cafile=str(path.parent/'cert.pem'));context.verify_flags|=ssl.VERIFY_X509_PARTIAL_CHAIN;context.minimum_version=ssl.TLSVersion.TLSv1_2
        request=Request('https://'+host+':'+str(c['port'])+'/quote-email/effects/00000000-0000-4000-8000-000000000001',headers={'Authorization':'Bearer '+e['token'],'x-looplabs-workspace':c['workspaceId'],'x-looplabs-quote':c['quoteId'],'x-looplabs-binding':c['emailBinding']})
        opener=open_request or build_opener(NoRedirect(),HTTPSHandler(context=context)).open
        try:response=opener(request,timeout=2)
        except HTTPError as error:response=error
        with response:
            body=response.read(4097)
            if len(body)>4096 or response.headers.get('Content-Type','').split(';')[0]!='application/json':return False
            value=json.loads(body)
            if (response.status,value) not in [(403,{'error':'No enrolled quote email'}),(404,{'error':'No retained email effect'})]:return False
        for check in [config_stable,marker_stable,cert_stable,execution_stable,journal_stable]:check()
        return True
    except Exception:return False

if __name__=='__main__':
    args=sys.argv[1:];container=len(args)==2 and args[0]=='--container'
    if len(args)==1 or container:sys.exit(0 if ready(args[-1],container) else 1)
    sys.exit(1)
