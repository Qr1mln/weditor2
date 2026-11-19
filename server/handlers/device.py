# coding: utf-8
#
"""Device REST endpoints: connect, hierarchy, screenshot, gesture."""

import base64
import io
import traceback

from airtest.core.error import DeviceConnectionError
from logzero import logger
from tornado.escape import json_decode

from ..device import connect_device, get_device
from ..proto import PlatformEnum
from .base import BaseHandler
from .minicap import build_minicap_websocket_url, build_screen_websocket_url


class DeviceConnectHandler(BaseHandler):
    def post(self):
        _platform = self.get_argument("platform")
        device_url = self.get_argument("deviceUrl")

        platform = PlatformEnum(_platform)
        del _platform
        try:
            id = connect_device(platform, device_url)
        except DeviceConnectionError as e:
            reason = getattr(e, 'value', None) or str(e)
            logger.warning("device connect error: %s", reason)
            self.set_status(500)
            self.write({
                "success": False,
                "description": (
                    "设备 %s 未就绪：%s。请确认模拟器或真机已启动并完成开机，"
                    "且 adb devices 中显示为 device（非 offline / unauthorized）。"
                    % (device_url or "默认设备", reason)
                ),
            })
        except RuntimeError as e:
            logger.exception("connect failed")
            self.set_status(500)
            self.write({
                "success": False,
                "description": str(e),
            })
        except Exception as e:
            logger.exception("device connect error")
            self.set_status(500)
            self.write({
                "success": False,
                "description": str(e),
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
            else:
                raise ValueError('unsupported gesture action: %s' % action)
            self.write({"success": True})
        except Exception as e:
            logger.exception("gesture failed")
            self.set_status(500)
            self.write({"success": False, "description": str(e)})
