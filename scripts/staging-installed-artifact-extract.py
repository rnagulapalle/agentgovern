"""Strict owned ZIP input: no arbitrary paths, links, credentials or overwrites."""
import os, stat, sys, zipfile
from pathlib import Path
limits={'images.tar':8*1024**3,'manifest.json':65536,'installed-platform-observation-receipt.json':2*1024**2}
archive,destination=map(Path,sys.argv[1:])
assert len(sys.argv)==3 and archive.is_absolute() and destination.is_absolute()
assert archive.resolve()==archive and destination.resolve()==destination
for path in (archive,destination):
    state=path.lstat();assert state.st_uid==os.getuid() and not stat.S_ISLNK(state.st_mode)
assert stat.S_ISREG(archive.lstat().st_mode) and archive.lstat().st_nlink==1 and stat.S_IMODE(archive.lstat().st_mode)==0o600
assert stat.S_ISDIR(destination.lstat().st_mode) and stat.S_IMODE(destination.lstat().st_mode)==0o700
assert not list(destination.iterdir())
with zipfile.ZipFile(archive) as bundle:
    entries=bundle.infolist();assert len(entries)==3 and {e.filename for e in entries}==set(limits)
    for entry in entries:
        assert not entry.is_dir() and not entry.flag_bits&1 and entry.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED)
        mode=entry.external_attr>>16;assert stat.S_IFMT(mode) in (0,stat.S_IFREG)
        assert 0<entry.file_size<=limits[entry.filename]
    for entry in entries:
        output=destination/entry.filename;fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as target,bundle.open(entry) as source:
            count=0
            while chunk:=source.read(1024*1024):
                count+=len(chunk);assert count<=limits[entry.filename];target.write(chunk)
            assert count==entry.file_size
