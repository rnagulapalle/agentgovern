"""Preparation only: exact regular source bytes/modes in a new owned directory.
Never establishes image, worker, CI, provider, execution or release authority.
"""
import hashlib, json, os, pathlib, stat, sys, tarfile

def private_parent(path):
    parent=path.parent
    facts=parent.lstat()
    assert parent.resolve()==parent and stat.S_ISDIR(facts.st_mode) and facts.st_uid==os.getuid() and stat.S_IMODE(facts.st_mode)==0o700

def owned_read(path,limit):
    assert path.is_absolute() and path.resolve()==path
    private_parent(path)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        assert stat.S_ISREG(before.st_mode) and before.st_uid==os.getuid() and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==0o600 and before.st_size<=limit
        with os.fdopen(os.dup(fd),'rb')as stream:body=stream.read(limit+1)
        after=os.fstat(fd)
        assert (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns)
        assert len(body)==before.st_size
        return body
    finally:os.close(fd)

def extract(archive,freeze,archive_digest,freeze_digest,destination):
    assert len(archive_digest)==64 and len(freeze_digest)==64 and all(c in '0123456789abcdef'for c in archive_digest+freeze_digest)
    freeze_bytes=owned_read(freeze,4*1024*1024);archive_bytes=owned_read(archive,256*1024*1024)
    assert hashlib.sha256(freeze_bytes).hexdigest()==freeze_digest and hashlib.sha256(archive_bytes).hexdigest()==archive_digest
    expected=json.loads(freeze_bytes);assert set(expected)=={'contract','sourceHashes','sourceFileModes','sourceDirectoryModes','fileCount'} and expected['contract']=='owned-installed-assembly-source-snapshot-3'
    hashes=expected['sourceHashes'];modes=expected['sourceFileModes'];directories=expected['sourceDirectoryModes'];assert set(hashes)==set(modes) and len(hashes)==expected['fileCount'] and len(hashes)<=4096
    expected_directories=set()
    for name in hashes:
        p=pathlib.PurePosixPath(name)
        assert not p.is_absolute() and '..'not in p.parts and str(p)==name
        expected_directories.update(str(parent)for parent in p.parents if str(parent)!='.')
    assert expected_directories.issubset(set(directories)) and len(directories)<=4096 and all(mode==0o755 for mode in directories.values())
    for name in directories:
        p=pathlib.PurePosixPath(name)
        assert not p.is_absolute() and '..'not in p.parts and str(p)==name and all(part and not part.startswith('.env')for part in p.parts)
        assert all(str(parent)=='.' or str(parent)in directories for parent in p.parents)
    private_parent(destination);assert destination.is_absolute() and destination.parent.resolve()==destination.parent
    # tar is fully inspected before creating the destination, then each regular
    # member is written exclusively. No links, special modes or path traversal.
    import io
    with tarfile.open(fileobj=io.BytesIO(archive_bytes),mode='r:gz')as tar:
        members=tar.getmembers();assert len(members)==len(hashes) and {m.name for m in members}==set(hashes)
        total=0
        for member in members:
            name=pathlib.PurePosixPath(member.name)
            assert member.isfile() and not member.issym() and not member.islnk() and not name.is_absolute() and '..'not in name.parts and all(p and not p.startswith('.env')for p in name.parts)
            assert str(name)==member.name and member.size<=32*1024*1024 and member.mode==modes[member.name] and member.mode in (0o644,0o755)
            total+=member.size;assert total<=256*1024*1024
        destination.mkdir(mode=0o700)
        for name in sorted(directories,key=lambda n:(len(pathlib.PurePosixPath(n).parts),n)):
            parent=destination/name;parent.mkdir(mode=0o755)
            os.chmod(parent,0o755)
            assert not parent.is_symlink() and stat.S_IMODE(parent.stat().st_mode)==0o755
        for member in members:
            body=tar.extractfile(member).read();assert len(body)==member.size and hashlib.sha256(body).hexdigest()==hashes[member.name]
            target=destination/member.name;assert target.parent.is_dir() and not target.parent.is_symlink()
            fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,member.mode)
            with os.fdopen(fd,'wb')as out:out.write(body)
            os.chmod(target,member.mode)
            assert stat.S_IMODE(target.lstat().st_mode)==modes[member.name]
    return {'scope':'source preparation only','regularFiles':len(hashes),'sourceModesPreserved':True,'nestedSourceDirectoriesTraversable':True,'releaseAccepted':False}

if __name__=='__main__':
    try:
        assert len(sys.argv)==6
        print(json.dumps(extract(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),sys.argv[3],sys.argv[4],pathlib.Path(sys.argv[5]))))
    except Exception:
        print('Owned diagnostic source extraction refused; preserve private partial input/output for review.',file=sys.stderr)
        sys.exit(1)
