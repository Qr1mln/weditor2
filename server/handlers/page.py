# coding: utf-8
#

import base64
import io
import json
import os
import time
import traceback
from urllib.parse import quote

import tornado
import tornado.ioloop
import tornado.websocket
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
        # __file__ = server/handlers/page.py -> dirname x3 = project root -> weditor/
        page = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), "weditor", "index.html")
        if not os.path.isfile(page):
            self.set_status(404)
            self.write({"error": "frontend index.html not found"})
            return
        with open(page, "r", encoding="utf-8") as f:
            self.write(f.read())


def build_screen_websocket_url(device_obj):
    """Derive the legacy atx-agent minicap WebSocket URL when available."""
    addr = getattr(device_obj, 'address', None)
    if not addr:
        return None
    ws_addr = str(addr).replace('https://', 'wss://').replace('http://', 'ws://')
    return ws_addr.rstrip('/') + '/minicap'


def build_minicap_websocket_url(request, device_id):
    """URL of the local bridge that streams Airtest minicap frames to the browser."""
    proto = 'wss' if request.protocol == 'https' else 'ws'
    return '%s://%s/ws/v1/minicap?deviceId=%s' % (
        proto, request.host, quote(device_id, safe=''))


class MinicapWebSocketHandler(tornado.websocket.WebSocketHandler):
    """Bridge Airtest minicap JPEG frames to the browser as binary WS messages."""

    def check_origin(self, origin):
        return True

    def open(self):
        self.device_id = self.get_query_argument('deviceId', '')
        self.running = False
        self.minicap = None
        self.io_loop = tornado.ioloop.IOLoop.current()
        try:
            device_obj = get_device(self.device_id).device
            adb = getattr(device_obj, 'adb', None)
            if adb is None:
                raise RuntimeError('device has no adb channel')
            try:
                from airtest.core.android.cap_methods.minicap import Minicap
            except ImportError:
                from airtest.core.android.minicap import Minicap
            self.minicap = Minicap(adb)
            self.running = True
            self.io_loop.run_in_executor(None, self._stream_frames)
        except Exception as e:
            logger.exception('minicap websocket open failed')
            self.close(1011, str(e))

    def _stream_frames(self):
        minicap = self.minicap
        while self.running:
            try:
                frame = minicap.get_frame_from_stream()
            except Exception as e:
                logger.warning('minicap stream stopped: %s', e)
                break
            if not frame:
                continue
            self.io_loop.add_callback(self._write_frame, bytes(frame))
        if self.running:
            self.running = False
            self.io_loop.add_callback(self.close, 1011, 'minicap stream ended')

    def _write_frame(self, frame):
        if self.ws_connection is None or self.ws_connection.is_closing():
            return
        try:
            self.write_message(frame, binary=True)
        except Exception as e:
            logger.warning('minicap write failed: %s', e)

    def on_close(self):
        self.running = False
        minicap = self.minicap
        self.minicap = None
        if minicap is not None:
            try:
                minicap.teardown_stream()
            except Exception as e:
                logger.warning('minicap teardown failed: %s', e)


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
                device_obj = get_device(id).device
                if getattr(device_obj, 'adb', None) is not None:
                    ret['screenWebSocketUrl'] = build_minicap_websocket_url(self.request, id)
                else:
                    ret['screenWebSocketUrl'] = build_screen_websocket_url(device_obj)
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
    IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.bmp', '.webp')

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

    STORE_DIR = os.path.expanduser("~/.weditor/templates")

    def _safe_path(self, name):
        name = os.path.basename(str(name or ''))
        store = os.path.abspath(self.STORE_DIR)
        path = os.path.abspath(os.path.join(store, name))
        if not name or os.path.commonpath([store, path]) != store:
            raise ValueError('invalid filename')
        return path

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


class DeviceGestureHandler(BaseHandler):
    """Run screen gestures directly on the connected device."""

    def post(self, serial):
        try:
            data = json_decode(self.request.body)
            action = data.get('action')
            d = get_device(serial)
            if action == 'tap':
                d.tap(int(data['x']), int(data['y']))
            elif action == 'swipe':
                d.swipe(
                    int(data['x1']),
                    int(data['y1']),
                    int(data['x2']),
                    int(data['y2']),
                    float(data.get('duration', 0.5)),
                )
            elif action == 'keyevent':
                d.keyevent(data['key'])
            else:
                raise ValueError('unsupported gesture action: %s' % action)
            self.write({"success": True})
        except Exception as e:
            logger.exception("gesture failed")
            self.set_status(500)
            self.write({"success": False, "description": str(e)})

