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
    """Serve the Vue 3 build output (FE-0+). Kept at /new until FE-4 switches '/'."""

    def get(self):
        # __file__ = weditor/web/handlers/page.py -> dirname x3 = weditor/
        dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), "static", "dist", "index.html")
        if not os.path.isfile(dist):
            self.set_status(404)
            self.write({"error": "frontend not built; run `npm run build` in web/"})
            return
        with open(dist, "r", encoding="utf-8") as f:
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


class WidgetPreviewHandler(BaseHandler):
    def get(self, id):
        self.render("widget_preview.html", id=id)


class DeviceWidgetListHandler(BaseHandler):
    __store_dir = os.path.expanduser("~/.weditor/widgets")

    def generate_id(self):
        os.makedirs(self.__store_dir, exist_ok=True)
        names = [
            name for name in os.listdir(self.__store_dir)
            if os.path.isdir(os.path.join(self.__store_dir, name))
        ]
        return "%05d" % (len(names) + 1)

    def get(self, widget_id: str):
        data_dir = os.path.join(self.__store_dir, widget_id)
        with open(pathjoin(data_dir, "hierarchy.xml"), "r",
                  encoding="utf-8") as f:
            hierarchy = f.read()

        with open(os.path.join(data_dir, "meta.json"), "rb") as f:
            meta_info = json.load(f)
            meta_info['hierarchy'] = hierarchy
            self.write(meta_info)

    def json_parse(self, source):
        with open(source, "r", encoding="utf-8") as f:
            return json.load(f)

    def put(self, widget_id: str):
        """ update widget data """
        data = json_decode(self.request.body)
        target_dir = os.path.join(self.__store_dir, widget_id)
        with open(pathjoin(target_dir, "hierarchy.xml"), "w",
                  encoding="utf-8") as f:
            f.write(data['hierarchy'])

        # update meta (airtest: no xpath semantics, keep bounds/template info)
        meta_path = pathjoin(target_dir, "meta.json")
        meta = self.json_parse(meta_path)
        if 'bounds' in data:
            lx, ly, rx, ry = data['bounds']
            meta["rect"] = dict(x=lx, y=ly, width=rx-lx, height=ry-ly)
        with open(meta_path, "w", encoding="utf-8") as f:
            f.write(json.dumps(meta, indent=4, ensure_ascii=False))

        self.write({
            "success": True,
            "description": f"widget {widget_id} updated",
        })

    def post(self):
        data = json_decode(self.request.body)
        widget_id = self.generate_id()
        target_dir = os.path.join(self.__store_dir, widget_id)
        os.makedirs(target_dir, exist_ok=True)

        image_fd = io.BytesIO(base64.b64decode(data['screenshot']))
        im = Image.open(image_fd)
        im.save(pathjoin(target_dir, "screenshot.jpg"))

        lx, ly, rx, ry = bounds = data['bounds']
        im.crop(bounds).save(pathjoin(target_dir, "template.jpg"))

        cx, cy = (lx + rx) // 2, (ly + ry) // 2
        # TODO(ssx): missing offset
        # pprint(data)
        widget_data = {
            "resource_id": data["resourceId"],
            "text": data['text'],
            "description": data["description"],
            "target_size": [rx - lx, ry - ly],
            "package": data["package"],
            "activity": data["activity"],
            "class_name": data['className'],
            "rect": dict(x=lx, y=ly, width=rx-lx, height=ry-ly),
            "window_size": data['windowSize'],
            "template_path": os.path.abspath(pathjoin(target_dir, "template.jpg")).replace("\\", "/"),
            "target_image": {
                "size": [rx - lx, ry - ly],
                "url": f"http://localhost:17310/widgets/{widget_id}/template.jpg",
            },
            "device_image": {
                "size": im.size,
                "url": f"http://localhost:17310/widgets/{widget_id}/screenshot.jpg",
            },
            # "hierarchy": data['hierarchy'],
        } # yapf: disable

        with open(pathjoin(target_dir, "meta.json"), "w",
                  encoding="utf-8") as f:
            json.dump(widget_data, f, ensure_ascii=False, indent=4)

        with open(pathjoin(target_dir, "hierarchy.xml"), "w",
                  encoding="utf-8") as f:
            f.write(data['hierarchy'])

        self.write({
            "success": True,
            "id": widget_id,
            "note": data['text'] or data['description'],  # 备注
            "data": widget_data,
        })


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

