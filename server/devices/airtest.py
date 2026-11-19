# coding: utf-8
#
"""Android devices backed by airtest (ADB channel)."""

from airtest.core.api import connect_device as at_connect_device
from airtest.core.api import device as at_device
from logzero import logger
from PIL import Image

from .. import uidumplib
from .base import (DeviceMeta, _blank_image, _pil_from_airtest_snapshot,
                   _xml_from_uiautomator)


class _AndroidAirTestDevice(DeviceMeta):
    """Android device backed by airtest (ADB channel), replacing uiautomator2."""

    def __init__(self, device_url: str):
        uri = "Android:///" + device_url if device_url else "Android:///"
        at_connect_device(uri)
        self._d = at_device()

    def screenshot(self) -> Image.Image:
        try:
            arr = self._d.snapshot()
            return _pil_from_airtest_snapshot(arr)
        except Exception:
            logger.exception("snapshot failed, fallback to blank image")
            return _blank_image()

    def dump_hierarchy(self) -> str:
        return _xml_from_uiautomator(self._d)

    def dump_hierarchy2(self) -> dict:
        page_xml = self.dump_hierarchy()
        page_json = uidumplib.android_hierarchy_to_json(
            page_xml.encode('utf-8')) if page_xml else None
        package, activity = "", ""
        try:
            top = self._d.get_top_activity()
            if isinstance(top, (tuple, list)) and len(top) >= 2:
                package, activity = top[0], top[1]
        except Exception:
            logger.exception("get_top_activity failed")
        w, h = self._d.get_current_resolution()
        return {
            "xmlHierarchy": page_xml,
            "jsonHierarchy": page_json,
            "activity": activity,
            "packageName": package,
            "windowSize": "%d,%d" % (w, h),
        }

    @property
    def device(self):
        return self._d

    def tap(self, x, y):
        self._d.touch((x, y))

    def swipe(self, x1, y1, x2, y2, duration=0.5):
        self._d.swipe((x1, y1), (x2, y2), duration=duration)


class _AndroidADB(DeviceMeta):
    """Android ADB-only device, using airtest's bundled ADB instead of adbutils."""

    def __init__(self, device_url: str):
        self._serial = device_url
        at_connect_device("Android:///" + device_url if device_url else "Android:///")
        self._d = at_device()

    def screenshot(self) -> Image.Image:
        try:
            arr = self._d.snapshot()
            return _pil_from_airtest_snapshot(arr)
        except Exception:
            logger.exception("snapshot failed, fallback to blank image")
            return _blank_image()

    def dump_hierarchy(self) -> str:
        return _xml_from_uiautomator(self._d)

    def dump_hierarchy2(self) -> dict:
        page_xml = self.dump_hierarchy()
        page_json = uidumplib.android_hierarchy_to_json(
            page_xml.encode('utf-8')) if page_xml else None
        package, activity = "", ""
        try:
            top = self._d.get_top_activity()
            if isinstance(top, (tuple, list)) and len(top) >= 2:
                package, activity = top[0], top[1]
        except Exception:
            logger.exception("get_top_activity failed")
        w, h = self._d.get_current_resolution()
        return {
            "xmlHierarchy": page_xml,
            "jsonHierarchy": page_json,
            "activity": activity,
            "packageName": package,
            "windowSize": "%d,%d" % (w, h),
        }

    @property
    def device(self):
        return self._d

    def tap(self, x, y):
        self._d.touch((x, y))

    def swipe(self, x1, y1, x2, y2, duration=0.5):
        self._d.swipe((x1, y1), (x2, y2), duration=duration)
