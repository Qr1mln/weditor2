# coding: utf-8
#
"""Device abstraction and shared helpers for every platform adapter."""

import abc

from logzero import logger
from PIL import Image


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
