"""Refuse missing, changed or empty installed fixture dependencies."""
import base64
import hashlib
import importlib.metadata
import re
import sys
from pathlib import Path


def verify_distribution(distribution, expected_version):
    if distribution.version != expected_version or not distribution.files:
        raise ValueError("Dependency metadata missing or version differs")
    checked = 0
    for entry in distribution.files:
        if not entry.hash:
            if str(entry).endswith((".py", ".so", ".pyd")):
                raise ValueError("Executable dependency file has no integrity record")
            continue
        data = distribution.locate_file(entry).read_bytes()
        if entry.hash.mode != "sha256":
            raise ValueError("Unsupported dependency integrity algorithm")
        actual = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("=")
        if actual != entry.hash.value or entry.size != len(data):
            raise ValueError("Installed dependency content differs from its wheel record")
        checked += 1
    if not checked:
        raise ValueError("Dependency integrity records absent")
    return checked


def check_requirements(path):
    checked = 0
    for line in Path(path).read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-zA-Z0-9_-]+)==([0-9]+(?:\.[0-9]+)+)", line)
        if not match:
            raise ValueError("Exact dependency versions required")
        name, version = match.groups()
        checked += verify_distribution(importlib.metadata.distribution(name), version)
    if not checked:
        raise ValueError("Dependency requirements empty")
    # Import the actual runtime symbols too; metadata alone cannot prove imports.
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    import uvicorn
    import yaml
    from pydantic import BaseModel
    import jsonschema
    from faker import Faker
    import httpx
    assert FastAPI and uvicorn.Config and BaseModel and Faker and httpx.Request
    assert JSONResponse({"fixture": True}).status_code == 200
    assert yaml.safe_load("fixture: true")["fixture"] is True
    jsonschema.validate({"fixture": True}, {"type": "object"})
    return checked


def self_test():
    import csv
    import tempfile
    import unittest

    class IntegrityTest(unittest.TestCase):
        def test_content_metadata_and_records_fail_closed(self):
            with tempfile.TemporaryDirectory(prefix="ll-dependency-test-") as directory:
                root = Path(directory)
                package = root / "fixture.py"
                package.write_bytes(b"working runtime symbol\n")
                info = root / "fixture-1.0.dist-info"
                info.mkdir()
                (info / "METADATA").write_text("Name: fixture\nVersion: 1.0\n")
                digest = base64.urlsafe_b64encode(hashlib.sha256(package.read_bytes()).digest()).decode().rstrip("=")
                with (info / "RECORD").open("w", newline="") as stream:
                    csv.writer(stream).writerows([["fixture.py", "sha256=" + digest, package.stat().st_size], ["fixture-1.0.dist-info/RECORD", "", ""]])
                distribution = importlib.metadata.PathDistribution(info)
                self.assertEqual(verify_distribution(distribution, "1.0"), 1)
                with self.assertRaises(ValueError):
                    verify_distribution(distribution, "2.0")
                package.write_bytes(b"")
                with self.assertRaises(ValueError):
                    verify_distribution(distribution, "1.0")
                (info / "RECORD").write_text("")
                with self.assertRaises(ValueError):
                    verify_distribution(distribution, "1.0")
                (info / "METADATA").write_text("")
                with self.assertRaises(ValueError):
                    verify_distribution(distribution, "1.0")

    result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(IntegrityTest))
    return result.wasSuccessful()


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        sys.exit(0 if self_test() else 1)
    try:
        if len(sys.argv) != 2:
            raise ValueError("Requirements path required")
        count = check_requirements(sys.argv[1])
        print(f"Fixture dependencies imported; {count} recorded files verified.")
    except Exception:
        # No dependency/source contents or environment values in failure output.
        print("Fixture dependency integrity/import check failed. No acceptance claimed.", file=sys.stderr)
        sys.exit(1)
