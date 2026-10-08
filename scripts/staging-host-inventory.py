"""Read-only Linux/Docker memory inventory; never emits names or environment."""
import datetime
import json
import pathlib
import subprocess
import sys


def docker(*args):
    return subprocess.check_output(["docker", *args], timeout=15, stderr=subprocess.DEVNULL).decode()


try:
    memory = {}
    for line in pathlib.Path("/proc/meminfo").read_text().splitlines():
        parts = line.split()
        if parts[0] in ("MemTotal:", "MemAvailable:"):
            memory[parts[0]] = int(parts[1]) * 1024
    ids = sorted(docker("ps", "--no-trunc", "-q").split())
    containers = []
    for container_id in ids:
        # A template avoids reading or exporting container credentials.
        limit = int(docker("inspect", "--format", "{{.HostConfig.Memory}}", container_id).strip())
        containers.append({"id": container_id, "memoryBytes": limit})
    if ids != sorted(docker("ps", "--no-trunc", "-q").split()):
        raise ValueError("Container membership changed")
    print(json.dumps({"observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      "totalBytes": memory["MemTotal:"], "availableBytes": memory["MemAvailable:"],
                      "containerIds": ids, "containers": containers}))
except Exception:
    print("Host inventory unavailable or changed during inspection; nothing was modified.", file=sys.stderr)
    sys.exit(1)
