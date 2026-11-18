# coding: utf-8
#

import base64
import io
import json
import os
import time
import traceback

import tornado
from logzero import logger
from PIL import Image
from tornado.escape import json_decode

from ..device import connect_device, get_device
from ..version import __version__
from ..proto import PlatformEnum

pathjoin = os.path.join


class BaseHandler(tornado.web.RequestHandler):
    def set_default_headers(self):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header("Access-Control-Allow-Credentials",
                        "true")  # allow cookie
        self.set_header('Access-Control-Allow-Methods',
                        'POST, GET, PUT, DELETE, OPTIONS')

    def options(self, *args):
        self.set_status(204)  # no body
        self.finish()

    def check_origin(self, origin):
        """ allow cors request """
        return True


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
        # __file__ = server/handlers/page.py -> dirname x3 = project root
        # (or site-packages when installed); static assets live under weditor/static/.
        page = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), "weditor", "static", "index.html")
        if not os.path.isfile(page):
            self.set_status(404)
            self.write({"error": "frontend index.html not found"})
            return
        with open(page, "r", encoding="utf-8") as f:
            self.write(f.read())


class DeviceConnectHandler(BaseHandler):
    def post(self):
        _platform = self.get_argument("platform")
        device_url = self.get_argument("deviceUrl")

        platform = PlatformEnum(_platform)
        del _platform
        try:
            id = connect_device(platform, device_url)
        except RuntimeError as e:
            logger.exception("connect failed")
            self.set_status(500)
            self.write({
                "success": False,
                "description": str(e),
            })
        except Exception as e:
            logger.warning("device connect error: %s", e)
            self.set_status(500)
            self.write({
                "success": False,
                "description": traceback.format_exc(),
            })
        else:
            ret = {
                "deviceId": id,
                'success': True,
            }
            if platform in (PlatformEnum.AndroidAirTest, PlatformEnum.AndroidADB):
                # ws_addr = get_device(id).device.address.replace("http://", "ws://") # yapf: disable
                ret['screenWebSocketUrl'] = None #ws_addr + "/minicap"
            self.write(ret)


class DeviceHierarchyHandler(BaseHandler):
    def get(self, device_id):
        d = get_device(device_id)
        self.write(d.dump_hierarchy())


class DeviceHierarchyHandlerV2(BaseHandler):
    def get(self, device_id):
        d = get_device(device_id)
        self.write(d.dump_hierarchy2())


class DeviceTemplateHandler(BaseHandler):
    """Crop a control region from a screenshot and save it as an airtest Template image."""

    STORE_DIR = os.path.expanduser("~/.weditor/templates")

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


class DeviceScreenshotHandler(BaseHandler):
    def get(self, serial):
        logger.info("Serial: %s", serial)
        try:
            d = get_device(serial)
            buffer = io.BytesIO()
            d.screenshot().convert("RGB").save(buffer, format='JPEG')
            b64data = base64.b64encode(buffer.getvalue())
            response = {
                "type": "jpeg",
                "encoding": "base64",
                "data": b64data.decode('utf-8'),
            }
            self.write(response)
        except EnvironmentError as e:
            traceback.print_exc()
            self.set_status(500, "Environment Error")
            self.write({"description": str(e)})
        except RuntimeError as e:
            self.set_status(500)  # Gone
            self.write({"description": traceback.format_exc()})

