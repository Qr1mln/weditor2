# coding: utf-8
#
"""Compatibility shim.

The device layer now lives in :mod:`server.devices`, split by responsibility:

- ``base``      - abstract interface and shared helpers
- ``airtest``   - Android adapters backed by airtest
- ``ios``       - iOS adapter backed by facebook-wda
- ``registry``  - connection cache and lookup

Importing from ``server.device`` keeps existing callers working.
"""

from .devices.airtest import (_AndroidADB, _AndroidAirTestDevice,
                              at_connect_device, at_device)
from .devices.base import (_blank_image, _pil_from_airtest_snapshot,
                           _xml_from_uiautomator, DeviceMeta)
from .devices.registry import cached_devices, connect_device, get_device

__all__ = [
    "DeviceMeta", "cached_devices", "connect_device", "get_device",
    "_AndroidADB", "_AndroidAirTestDevice", "_pil_from_airtest_snapshot",
    "_xml_from_uiautomator", "_blank_image", "at_connect_device", "at_device",
]
