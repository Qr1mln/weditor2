# coding: utf-8
#

import abc

import wda
from airtest.core.api import connect_device as at_connect_device
from airtest.core.api import device as at_device
from logzero import logger
from PIL import Image

from . import uidumplib
from .proto import PlatformEnum


class DeviceMeta(metaclass=abc.ABCMeta):
    @abc.abstractmethod
    def screenshot(self) -> Image.Image:
        pass

    @abc.abstractmethod
    def dump_hierarchy(self) -> str:
        pass

    @abc.abstractmethod
    def dump_hierarchy2(self) -> dict:
        pass

    @abc.abstractproperty
    def device(self):
        pass

    def tap(self, x, y):
        raise NotImplementedError

    def swipe(self, x1, y1, x2, y2, duration=0.5):
        raise NotImplementedError


def _xml_from_uiautomator(dev):
    """Run ``uiautomator dump`` through an airtest Android device and return XML text."""
    try:
        xml = dev.adb.shell(
            "uiautomator dump /sdcard/window.xml >/dev/null 2>&1 && cat /sdcard/window.xml")
        return xml or ""
    except Exception:
        logger.exception("uiautomator dump failed")
        return ""


def _blank_image():
    return Image.new("RGB", (1, 1), "white")


def _pil_from_airtest_snapshot(snapshot) -> Image.Image:
    """airtest Android snapshot() returns a cv2-style BGR array."""
    if isinstance(snapshot, Image.Image):
        return snapshot.convert("RGB")

    if getattr(snapshot, "ndim", None) == 3 and snapshot.shape[2] >= 3:
        if snapshot.shape[2] == 3:
            snapshot = snapshot[:, :, ::-1]
        elif snapshot.shape[2] == 4:
            snapshot = snapshot[:, :, [2, 1, 0, 3]]
        snapshot = snapshot.copy()

    return Image.fromarray(snapshot).convert("RGB")


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


cached_devices = {}


def connect_device(platform: PlatformEnum, device_url: str):
    """
    Returns:
        deviceId (string), lowercase prefix: android:/ios:/androidadb:
    """
    prefix = platform.value.lower()
    device_id = prefix + ":" + device_url
    if platform == PlatformEnum.AndroidAirTest:
        d = _AndroidAirTestDevice(device_url)
    elif platform == PlatformEnum.AndroidADB:
        d = _AndroidADB(device_url)
    elif platform == PlatformEnum.IOS:
        d = _AppleDevice(device_url)
    else:
        raise ValueError("Unknown platform", platform)

    cached_devices[device_id] = d
    return device_id


def get_device(id):
    d = cached_devices.get(id)
    if d is None:
        platform, uri = id.split(":", maxsplit=1)
        # deviceId prefix is lowercase (android/ios/androidadb); map by value.
        for candidate in PlatformEnum:
            if candidate.value.lower() == platform:
                connect_device(candidate, uri)
                break
        else:
            raise ValueError("Unknown platform prefix in deviceId", platform)
    return cached_devices[id]
