# -*- coding: utf-8 -*-
"""Tests for the airtest device adapter (mocked, no real device needed)."""
from unittest import mock

import numpy as np
from PIL import Image

from server import device as devmod
from server.proto import PlatformEnum


class FakeAdb:
    def shell(self, cmd):
        from server import uidumplib
        return uidumplib.sample_android_page_xml


class FakeDevice:
    def snapshot(self):
        return np.zeros((1920, 1080, 3), dtype=np.uint8)

    def get_top_activity(self):
        return ("com.example.app", ".MainActivity", "1234")

    def get_current_resolution(self):
        return (1080, 1920)

    adb = FakeAdb()


def test_screenshot_converts_ndarray_to_rgb_pil():
    d = object.__new__(devmod._AndroidAirTestDevice)
    d._d = FakeDevice()
    img = d.screenshot()
    assert isinstance(img, Image.Image)
    assert img.mode == "RGB"
    assert img.size == (1080, 1920)


def test_dump_hierarchy_returns_xml():
    d = object.__new__(devmod._AndroidAirTestDevice)
    d._d = FakeDevice()
    xml = d.dump_hierarchy()
    assert "<hierarchy" in xml
    assert "com.huawei.android.launcher" in xml


def test_dump_hierarchy2_structure():
    d = object.__new__(devmod._AndroidAirTestDevice)
    d._d = FakeDevice()
    r = d.dump_hierarchy2()
    assert set(r.keys()) == {
        "xmlHierarchy", "jsonHierarchy", "activity", "packageName", "windowSize"}
    assert r["packageName"] == "com.example.app"
    assert r["activity"] == ".MainActivity"
    assert r["windowSize"] == "1080,1920"
    assert r["jsonHierarchy"]["children"][0]["_type"] == "android.widget.FrameLayout"


def test_snapshot_failure_falls_back_to_blank_image():
    class BrokenDevice(FakeDevice):
        def snapshot(self):
            raise RuntimeError("no screen")

    d = object.__new__(devmod._AndroidAirTestDevice)
    d._d = BrokenDevice()
    img = d.screenshot()
    assert isinstance(img, Image.Image)
    assert img.size == (1, 1)


def test_connect_device_lowercase_prefix_and_cache():
    fake = FakeDevice()
    with mock.patch.object(devmod, "at_connect_device"), \
         mock.patch.object(devmod, "at_device", return_value=fake):
        devmod.cached_devices.clear()
        did = devmod.connect_device(PlatformEnum.AndroidAirTest, "serial-001")
        assert did == "android:serial-001"
        assert devmod.get_device(did).device is fake


def test_get_device_rebuilds_from_lowercase_prefix():
    fake = FakeDevice()
    with mock.patch.object(devmod, "at_connect_device"), \
         mock.patch.object(devmod, "at_device", return_value=fake):
        devmod.cached_devices.clear()
        devmod.connect_device(PlatformEnum.AndroidADB, "serial-002")
        devmod.cached_devices.clear()
        d = devmod.get_device("androidadb:serial-002")
        assert d.device is fake
