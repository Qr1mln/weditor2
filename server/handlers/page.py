# coding: utf-8
#
"""Compatibility shim.

Handlers are now split by responsibility:

- ``base``      - BaseHandler (CORS)
- ``frontend``  - FrontendHandler, VersionHandler
- ``minicap``   - MinicapWebSocketHandler and screen WS URL helpers
- ``device``    - connect / hierarchy / screenshot / gesture endpoints
- ``template``  - image template crop / list / delete endpoints

Importing from ``server.handlers.page`` keeps existing callers working.
"""

from .base import BaseHandler
from .device import (DeviceConnectHandler, DeviceGestureHandler,
                     DeviceHierarchyHandler, DeviceHierarchyHandlerV2,
                     DeviceScreenshotHandler)
from .frontend import FrontendHandler, VersionHandler
from .minicap import (MinicapWebSocketHandler, build_minicap_websocket_url,
                      build_screen_websocket_url)
from .template import DeviceTemplateHandler, DeviceTemplateListHandler

__all__ = [
    "BaseHandler", "DeviceConnectHandler", "DeviceGestureHandler",
    "DeviceHierarchyHandler", "DeviceHierarchyHandlerV2",
    "DeviceScreenshotHandler", "FrontendHandler", "VersionHandler",
    "MinicapWebSocketHandler", "build_minicap_websocket_url",
    "build_screen_websocket_url", "DeviceTemplateHandler",
    "DeviceTemplateListHandler",
]
