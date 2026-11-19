# coding: utf-8
#
"""Device connection registry: create, cache and resolve devices by id."""

from ..proto import PlatformEnum
from .airtest import _AndroidADB, _AndroidAirTestDevice
from .ios import _AppleDevice

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
