# coding: utf-8
"""Entry point for ``python -m weditor2``.

Delegates to :mod:`server.__main__`. The older ``python -m server`` and
``python -m weditor`` commands remain available.
"""
from server.__main__ import main

if __name__ == '__main__':
    main()
