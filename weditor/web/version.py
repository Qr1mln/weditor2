# coding: utf-8
#

try:
    from importlib.metadata import version as _dist_version
    __version__ = _dist_version("weditor")
except Exception:
    __version__ = "unknown"
