#!/usr/bin/env python3
"""Small JSON checks shared by the Linux deployment script and its self-test."""
import json
import re
import sys


def metadata(role, config):
    service = config["services"][role]
    image = service["image"]
    version = service.get("environment", {}).get("APP_VERSION", "database")
    if role != "database":
        match = re.fullmatch(r"ghcr\.io/[a-z0-9._/-]+:(sha-[a-f0-9]{7,40}|v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)", image)
        if not match or version != match.group(1):
            raise ValueError("Use an explicit GHCR sha-<commit> or version tag, with matching APP_VERSION")
    elif image != "postgres:17.6-alpine":
        raise ValueError("Unexpected PostgreSQL image")
    port = service["ports"][0]
    host = port.get("host_ip", "127.0.0.1")
    if host in ("0.0.0.0", "::"):
        host = "127.0.0.1"
    if ":" in host:
        host = f"[{host}]"
    return image, version, f"http://{host}:{port['published']}"


def check(role, version, payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object")
    if role == "api":
        if payload.get("status") != "ok" or payload.get("version") != version:
            raise ValueError("API is unhealthy or reports the wrong release")
    elif role == "frontend":
        if payload.get("appVersion") != version or payload.get("apiUrl") != "" or payload.get("historyEnabled") is not True:
            raise ValueError("Frontend runtime configuration is incorrect or reports the wrong release")
    else:
        raise ValueError("Unknown role")


if __name__ == "__main__":
    try:
        mode, role, *args = sys.argv[1:]
        if mode == "config":
            with open(args[0], encoding="utf-8") as handle:
                print("\t".join(metadata(role, json.load(handle))))
        elif mode == "check":
            with open(args[1], encoding="utf-8") as handle:
                check(role, args[0], json.load(handle))
        else:
            raise ValueError("Unknown verification operation")
    except (ValueError, KeyError, IndexError, TypeError) as error:
        sys.exit(f"Verification failed: {error}")
