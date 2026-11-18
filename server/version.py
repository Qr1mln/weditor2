# coding: utf-8
#

import os
import subprocess

try:
    from importlib.metadata import version as _dist_version
    __version__ = _dist_version("weditor")
except Exception:
    try:
        # source checkout without installed dist metadata: fall back to git tag
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        r = subprocess.run(
            ["git", "describe", "--tags", "--always"],
            capture_output=True, text=True, timeout=2, cwd=root)
        __version__ = r.stdout.strip() or "unknown"
    except Exception:
        __version__ = "unknown"
