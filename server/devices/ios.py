# coding: utf-8
#
"""iOS device adapter backed by facebook-wda."""

from logzero import logger
import wda

from .. import uidumplib
from .base import DeviceMeta


class _AppleDevice(DeviceMeta):
    def __init__(self, device_url):
        logger.info("ios connect: %s", device_url)
        if device_url == "":
            c = wda.USBClient()
        else:
            c = wda.Client(device_url)
        self._client = c
        self.__scale = c.scale

    def screenshot(self):
        try:
            return self._client.screenshot(format='pillow')
        except Exception:
            import tidevice
            return tidevice.Device().screenshot()

    def dump_hierarchy(self):
        return uidumplib.get_ios_hierarchy(self._client, self.__scale)

    def dump_hierarchy2(self):
        w, h = self._client.window_size()
        return {
            "jsonHierarchy":
            uidumplib.get_ios_hierarchy(self._client, self.__scale),
            "windowSize":
            "%d,%d" % (w, h),
        }

    @property
    def device(self):
        return self._client

    def tap(self, x, y):
        self._client.tap(x, y)

    def swipe(self, x1, y1, x2, y2, duration=0.5):
        self._client.swipe(x1, y1, x2, y2)
