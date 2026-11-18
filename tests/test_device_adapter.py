# -*- coding: utf-8 -*-
"""Tests for the airtest device adapter (mocked, no real device needed)."""
from unittest import mock

import numpy as np
from PIL import Image

from server import device as devmod
from server.handlers import page as page_handlers
from server.proto import PlatformEnum


class FakeAdb:
    def shell(self, cmd):
        from server import uidumplib
        return uidumplib.sample_android_page_xml


class FakeDevice:
    def snapshot(self):
        arr = np.zeros((1920, 1080, 3), dtype=np.uint8)
        arr[0, 0] = [10, 20, 200]  # BGR: strong blue
        return arr

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


def test_screenshot_swaps_bgr_to_rgb_for_both_android_adapters():
    for cls in (devmod._AndroidAirTestDevice, devmod._AndroidADB):
        d = object.__new__(cls)
        d._d = FakeDevice()
        assert d.screenshot().getpixel((0, 0)) == (200, 20, 10)


def test_screenshot_converts_bgra_snapshot_to_rgb():
    class BGRADevice(FakeDevice):
        def snapshot(self):
            arr = np.zeros((1, 1, 4), dtype=np.uint8)
            arr[0, 0] = [10, 20, 200, 255]
            return arr

    img = devmod._pil_from_airtest_snapshot(BGRADevice().snapshot())
    assert img.getpixel((0, 0)) == (200, 20, 10)


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


def test_build_screen_websocket_url():
    class LegacyDevice:
        address = 'http://127.0.0.1:7912/'

    class AirtestDevice:
        pass

    assert page_handlers.build_screen_websocket_url(LegacyDevice()) == \
        'ws://127.0.0.1:7912/minicap'
    assert page_handlers.build_screen_websocket_url(AirtestDevice()) is None


def test_build_minicap_websocket_url():
    class Request:
        protocol = 'http'
        host = '127.0.0.1:17310'

    assert page_handlers.build_minicap_websocket_url(Request(), 'androidadb:serial-01') == \
        'ws://127.0.0.1:17310/ws/v1/minicap?deviceId=androidadb%3Aserial-01'
