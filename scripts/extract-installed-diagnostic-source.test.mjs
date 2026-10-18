import {describe,it,expect} from 'vitest';
import {mkdtemp,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
// Actual file/mode extraction only; synthetic source bytes grant no runtime authority.
describe('owned source transport extraction',()=>{
 for(const kind of ['normal','wrong-mode','symlink','traversal'])it(kind==='normal'?'preserves readable nonroot build modes under private parent':'refuses '+kind,async()=>{const root=await realpath(await mkdtemp(join(tmpdir(),'ll-source-extract-')));try{const result=spawnSync('python3',['-c',`import os,pathlib,tarfile,io,json,hashlib,importlib.util,stat,sys
sys.dont_write_bytecode=True
root=pathlib.Path(${JSON.stringify(root)});os.chmod(root,0o700)
spec=importlib.util.spec_from_file_location('reader','scripts/extract-installed-diagnostic-source.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
kind=${JSON.stringify(kind)};name='public/logo.svg'if kind!='traversal'else '../escape';body=b'public source fixture';mode=0o644;freeze={'contract':'owned-installed-assembly-source-snapshot-3','sourceHashes':{name:hashlib.sha256(body).hexdigest()},'sourceFileModes':{name:mode},'sourceDirectoryModes':{'public':0o755},'fileCount':1}
f=root/'freeze.json';f.write_text(json.dumps(freeze));os.chmod(f,0o600);a=root/'source.tar.gz'
with tarfile.open(a,'w:gz')as t:
 m=tarfile.TarInfo(name);m.mode=0o600 if kind=='wrong-mode'else mode;m.size=len(body)
 if kind=='symlink':m.type=tarfile.SYMTYPE;m.linkname='/etc/passwd';m.size=0
 t.addfile(m,io.BytesIO(body)if m.isfile()else None)
os.chmod(a,0o600)
value=reader.extract(a,f,hashlib.sha256(a.read_bytes()).hexdigest(),hashlib.sha256(f.read_bytes()).hexdigest(),root/'out')
assert value['releaseAccepted']==False and stat.S_IMODE((root/'out/public/logo.svg').stat().st_mode)==0o644 and stat.S_IMODE((root/'out').stat().st_mode)==0o700 and stat.S_IMODE((root/'out/public').stat().st_mode)==0o755 and os.access(root/'out/public',os.X_OK)
`],{encoding:'utf8',timeout:15000});if(kind==='normal')expect(result.status,result.stderr).toBe(0);else expect(result.status).not.toBe(0);}finally{await rm(root,{recursive:true,force:true});}});
});
