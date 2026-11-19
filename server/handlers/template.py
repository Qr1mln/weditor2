# coding: utf-8
#
"""Image template REST endpoints: crop, list and delete saved templates."""

import base64
import io
import os
import time
from urllib.parse import quote

from logzero import logger
from PIL import Image
from tornado.escape import json_decode

from .base import BaseHandler

STORE_DIR = os.path.expanduser("~/.weditor/templates")
IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.bmp', '.webp')


def _safe_path(name):
    name = os.path.basename(str(name or ''))
    store = os.path.abspath(STORE_DIR)
    path = os.path.abspath(os.path.join(store, name))
    if not name or os.path.commonpath([store, path]) != store:
        raise ValueError('invalid filename')
    return path


class DeviceTemplateHandler(BaseHandler):
    """Crop a control region from a screenshot and save it as an airtest Template image."""

    STORE_DIR = STORE_DIR
    IMAGE_EXTS = IMAGE_EXTS

    def post(self):
        try:
            data = json_decode(self.request.body)
            image_fd = io.BytesIO(base64.b64decode(data['screenshot']))
            im = Image.open(image_fd).convert("RGB")
            lx, ly, rx, ry = data['bounds']
            cropped = im.crop((lx, ly, rx, ry))

            os.makedirs(self.STORE_DIR, exist_ok=True)
            name = data.get('name') or ("tpl_%d" % int(time.time() * 1000))
            name = ''.join(c if c.isalnum() or c in '-_' else '_' for c in name)
            filename = name + ".png"
            abs_path = os.path.abspath(os.path.join(self.STORE_DIR, filename))
            cropped.save(abs_path)

            url = "http://%s/widgets/templates/%s" % (
                self.request.host, filename)
            self.write({
                "success": True,
                "path": abs_path.replace("\\", "/"),
                "filename": filename,
                "url": url,
                "size": [rx - lx, ry - ly],
            })
        except Exception as e:
            logger.exception("create template failed")
            self.set_status(500)
            self.write({"success": False, "description": str(e)})


class DeviceTemplateListHandler(BaseHandler):
    """List / delete saved template images shown in the resource manager."""

    STORE_DIR = STORE_DIR

    _safe_path = staticmethod(_safe_path)

    def get(self):
        try:
            os.makedirs(self.STORE_DIR, exist_ok=True)
            items = []
            for name in os.listdir(self.STORE_DIR):
                if not name.lower().endswith(DeviceTemplateHandler.IMAGE_EXTS):
                    continue
                path = os.path.join(self.STORE_DIR, name)
                if not os.path.isfile(path):
                    continue
                stat = os.stat(path)
                items.append({
                    "filename": name,
                    "path": os.path.abspath(path).replace("\\", "/"),
                    "url": "/widgets/templates/" + quote(name, safe=''),
                    "size": stat.st_size,
                    "created": int(stat.st_mtime * 1000),
                })
            items.sort(key=lambda item: item["created"], reverse=True)
            self.write({"success": True, "items": items})
        except Exception as e:
            logger.exception("list templates failed")
            self.set_status(500)
            self.write({"success": False, "description": str(e)})

    def delete(self):
        try:
            data = json_decode(self.request.body)
            path = self._safe_path(data.get('filename'))
            if not os.path.isfile(path):
                raise FileNotFoundError('template not found')
            os.remove(path)
            self.write({"success": True})
        except Exception as e:
            logger.exception("delete template failed")
            self.set_status(500)
            self.write({"success": False, "description": str(e)})
