# coding: utf-8
"""Compatibility entry point: ``python -m weditor`` delegates to ``server``.

The real implementation lives in :mod:`server.__main__`. Both commands work:

    python -m server      # primary
    python -m weditor     # backward compatible
"""
from server.__main__ import main

if __name__ == '__main__':
    main()
