# coding: utf-8
#
"""Minicap WebSocket bridge: streams Airtest minicap JPEG frames to the browser."""

from urllib.parse import quote

import tornado.ioloop
import tornado.websocket
from logzero import logger

from ..device import get_device


def build_screen_websocket_url(device_obj):
    """Derive the legacy atx-agent minicap WebSocket URL when available."""
    addr = getattr(device_obj, 'address', None)
    if not addr:
        return None
    ws_addr = str(addr).replace('https://', 'wss://').replace('http://', 'ws://')
    return ws_addr.rstrip('/') + '/minicap'


def build_minicap_websocket_url(request, device_id):
    """URL of the local bridge that streams Airtest minicap frames to the browser."""
    proto = 'wss' if request.protocol == 'https' else 'ws'
    return '%s://%s/ws/v1/minicap?deviceId=%s' % (
        proto, request.host, quote(device_id, safe=''))


class MinicapWebSocketHandler(tornado.websocket.WebSocketHandler):
    """Bridge Airtest minicap JPEG frames to the browser as binary WS messages."""

    def check_origin(self, origin):
        return True

    def open(self):
        self.device_id = self.get_query_argument('deviceId', '')
        self.running = False
        self.minicap = None
        self.io_loop = tornado.ioloop.IOLoop.current()
        try:
            device_obj = get_device(self.device_id).device
            adb = getattr(device_obj, 'adb', None)
            if adb is None:
                raise RuntimeError('device has no adb channel')
            try:
                from airtest.core.android.cap_methods.minicap import Minicap
            except ImportError:
                from airtest.core.android.minicap import Minicap
            self.minicap = Minicap(adb)
            self.running = True
            self.io_loop.run_in_executor(None, self._stream_frames)
        except Exception as e:
            logger.exception('minicap websocket open failed')
            self.close(1011, str(e))

    def _stream_frames(self):
        minicap = self.minicap
        while self.running:
            try:
                frame = minicap.get_frame_from_stream()
            except Exception as e:
                logger.warning('minicap stream stopped: %s', e)
                break
            if not frame:
                continue
            self.io_loop.add_callback(self._write_frame, bytes(frame))
        if self.running:
            self.running = False
            self.io_loop.add_callback(self.close, 1011, 'minicap stream ended')

    def _write_frame(self, frame):
        if self.ws_connection is None or self.ws_connection.is_closing():
            return
        try:
            self.write_message(frame, binary=True)
        except Exception as e:
            logger.warning('minicap write failed: %s', e)

    def on_close(self):
        self.running = False
        minicap = self.minicap
        self.minicap = None
        if minicap is not None:
            try:
                minicap.teardown_stream()
            except Exception as e:
                logger.warning('minicap teardown failed: %s', e)
