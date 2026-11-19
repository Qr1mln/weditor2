# coding: utf-8
#
"""Static frontend page and version endpoint."""

import os

from ..version import __version__
from .base import BaseHandler


class VersionHandler(BaseHandler):
    def get(self):
        ret = {
            'name': "weditor",
            'version': __version__,
        }
        self.write(ret)


class FrontendHandler(BaseHandler):
    """Serve the zero-build Vue 3 single-page frontend (script-tag vendor libs)."""

    def get(self):
        # __file__ = server/handlers/frontend.py -> dirname x3 = project root -> weditor/
        page = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), "weditor", "index.html")
        if not os.path.isfile(page):
            self.set_status(404)
            self.write({"error": "frontend index.html not found"})
            return
        with open(page, "r", encoding="utf-8") as f:
            self.write(f.read())
