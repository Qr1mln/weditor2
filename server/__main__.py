#! /usr/bin/env python
# -*- encoding: utf-8 -*-

from __future__ import absolute_import, print_function

import argparse
import base64
import hashlib
import io
import json
import os
import platform
import queue
import re
import signal
import socket
import subprocess
import sys
import time
import traceback
import uuid
import webbrowser
# `pip install futures` for python2
from concurrent.futures import ThreadPoolExecutor
from subprocess import PIPE

import requests
import six
import tornado.escape
import tornado.ioloop
import tornado.web
import tornado.websocket
from logzero import logger
from tornado import gen
from tornado.concurrent import run_on_executor
from tornado.escape import json_encode
from tornado.log import enable_pretty_logging

from .handlers.page import (
    BaseHandler, DeviceConnectHandler,
    DeviceGestureHandler, DeviceHierarchyHandler, DeviceHierarchyHandlerV2,
    DeviceScreenshotHandler, DeviceTemplateHandler, DeviceTemplateListHandler,
    FrontendHandler, MinicapWebSocketHandler, VersionHandler)
from .handlers.shell import PythonShellHandler
from .utils import current_ip, tostr
from .version import __version__

enable_pretty_logging()

__dir__ = os.path.dirname(os.path.abspath(__file__))

is_closing = False

if os.name == "nt":
    os.environ["HOME"] = os.path.expanduser("~")
PID_FILEPATH = os.path.expandvars("$HOME/.weditor/weditor.pid")
os.makedirs(os.path.dirname(PID_FILEPATH), exist_ok=True)


def signal_handler(signum, frame):
    global is_closing
    print('exiting...')
    is_closing = True


def stop_server():
    tornado.ioloop.IOLoop.instance().stop()


def try_exit():
    global is_closing
    if is_closing:  # clean up here
        stop_server()
        logger.info('exit success')


class QuitHandler(BaseHandler):
    def get(self):
        stop_server()
        self.write({"success": True, "description": "Successfully quited"})


class CropHandler(BaseHandler):
    def get(self):
        """ used for crop image """
        pass


def resolve_project_path(root, relative):
    """Resolve a relative path and guarantee it stays inside the project root."""
    value = str(relative or '').strip().replace('\\', '/')
    if not value or value.startswith('/') or re.match(r'^[A-Za-z]:', value):
        raise ValueError('路径必须是项目目录下的相对路径')
    parts = [part for part in value.split('/') if part]
    if not parts or any(part in ('.', '..') for part in parts):
        raise ValueError('路径不能包含 . 或 ..')
    candidate = os.path.abspath(os.path.join(root, *parts))
    root_norm = os.path.normcase(os.path.abspath(root))
    candidate_norm = os.path.normcase(candidate)
    if os.path.commonpath([root_norm, candidate_norm]) != root_norm:
        raise ValueError('路径超出项目目录')
    return candidate, '/'.join(parts)


class ProjectHandler(BaseHandler):
    def get(self):
        root = self.application.settings.get('project_root') or os.getcwd()
        self.write({
            'success': True,
            'root': root,
            'name': os.path.basename(os.path.normpath(root)) or root,
        })


class WorkspaceFilesHandler(BaseHandler):
    def _root(self):
        return self.application.settings.get('project_root') or os.getcwd()

    def _fail(self, status, message):
        self.set_status(status)
        self.write({'success': False, 'error': message})

    def _resolve(self, relative):
        try:
            return resolve_project_path(self._root(), relative)
        except ValueError as exc:
            self._fail(400, str(exc))
            return None

    def _body(self):
        try:
            data = json.loads(self.request.body or b'{}')
        except (TypeError, ValueError):
            self._fail(400, '请求体不是合法 JSON')
            return None
        if not isinstance(data, dict):
            self._fail(400, '请求体必须是 JSON 对象')
            return None
        return data

    def get(self):
        resolved = self._resolve(self.get_query_argument('path', ''))
        if not resolved:
            return
        path, rel = resolved
        if not os.path.isfile(path):
            return self._fail(404, '文件不存在：' + rel)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            return self._fail(400, '文件不是 UTF-8 文本，无法在编辑器中打开')
        except OSError as exc:
            return self._fail(500, '读取文件失败：' + str(exc))
        self.write({
            'success': True,
            'path': rel,
            'name': os.path.basename(path),
            'content': content,
        })

    def put(self):
        data = self._body()
        if data is None:
            return
        content = data.get('content')
        if not isinstance(content, str):
            return self._fail(400, 'content 必须是字符串')
        resolved = self._resolve(data.get('path'))
        if not resolved:
            return
        path, rel = resolved
        if not os.path.isfile(path):
            return self._fail(404, '文件不存在：' + rel)
        tmp = path + '.weditor.tmp'
        try:
            with open(tmp, 'w', encoding='utf-8', newline='') as f:
                f.write(content)
            os.replace(tmp, path)
        except OSError as exc:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass
            return self._fail(500, '保存失败：' + str(exc))
        self.write({'success': True, 'path': rel})

    def post(self):
        data = self._body()
        if data is None:
            return
        resolved = self._resolve(data.get('path'))
        if not resolved:
            return
        path, rel = resolved
        if os.path.exists(path):
            return self._fail(409, '文件已存在：' + rel)
        parent = os.path.dirname(path)
        try:
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(path, 'x', encoding='utf-8'):
                pass
        except FileExistsError:
            return self._fail(409, '文件已存在：' + rel)
        except OSError as exc:
            return self._fail(500, '新建文件失败：' + str(exc))
        self.set_status(201)
        self.write({'success': True, 'path': rel, 'name': os.path.basename(path)})


def make_app(settings={}):
    application = tornado.web.Application(
        [
            (r"/", FrontendHandler),
            (r"/new", FrontendHandler),
            (r"/new/", FrontendHandler),
            (r"/api/v1/version", VersionHandler),
            (r"/api/v1/project", ProjectHandler),
            (r"/api/v1/files", WorkspaceFilesHandler),
            (r"/api/v1/files/content", WorkspaceFilesHandler),
            (r"/api/v1/connect", DeviceConnectHandler),
            (r"/api/v1/crop", CropHandler),
            (r"/api/v1/template", DeviceTemplateHandler),
            (r"/api/v1/templates", DeviceTemplateListHandler),
            (r"/api/v1/devices/([^/]+)/screenshot", DeviceScreenshotHandler),
            (r"/api/v1/devices/([^/]+)/gesture", DeviceGestureHandler),
            (r"/api/v1/devices/([^/]+)/hierarchy", DeviceHierarchyHandler),
            # (r"/api/v1/devices/([^/]+)/exec", DeviceCodeDebugHandler),
            # v2
            (r"/api/v2/devices/([^/]+)/hierarchy", DeviceHierarchyHandlerV2),
            # image templates (still used by the frontend "template" tap mode)
            (r"/widgets/templates/(.+)", tornado.web.StaticFileHandler, {
                "path": os.path.expanduser("~/.weditor/templates")
            }),
            # (r"/ws/v1/build", BuildWSHandler),
            (r"/ws/v1/python", PythonShellHandler),
            (r"/ws/v1/minicap", MinicapWebSocketHandler),
            (r"/quit", QuitHandler),
        ],
        **settings)
    return application


def get_running_version(addr: str):
    """
    Returns:
        None if not running
        version string if running
    """
    try:
        r = requests.get(f"{addr}/api/v1/version",
                         timeout=2.0)
        if r.status_code == 200:
            return r.json().get("version", "dev")
    except requests.exceptions.ConnectionError:
        pass
    except Exception as e:
        print("Unknown error: %r" % e)


def cmd_quit(port=17310):
    try:
        requests.get(f"http://127.0.0.1:{port}/quit", timeout=3)
        logger.info("weditor quit successfully")
    except requests.ConnectionError:
        logger.info("weditor already stopped")
    except requests.Timeout:
        logger.info("kill through pid file")
        if not os.path.isfile(PID_FILEPATH):
            logger.warning("Pidfile: %s not exist", PID_FILEPATH)
            return
        
        with open(PID_FILEPATH, "r") as f:
            pid = int(f.read())
            if os.name == "nt": # windows
                subprocess.call(f"taskkill /PID {pid} /T /F") # /F: 强制 /T: 包含子进程
            else:
                os.kill(pid, signal.SIGKILL)
        os.unlink(PID_FILEPATH)
        logger.info("weditor was killed")


def run_web(debug=False, port=17310, open_browser=False, force_quit=False, project_root=None):
    base_url = f"http://localhost:{port}"
    version = get_running_version(base_url)
    if version:
        if force_quit:
            logger.info(f"quit previous weditor server (version: {version})")
            requests.get(base_url + "/quit")
            time.sleep(.5)
        else:
            sys.exit(f"Another weditor({version}) is already running")

    if open_browser:
        webbrowser.open(f'http://localhost:{port}', new=2)

    root = os.path.abspath(project_root or os.getcwd())
    application = make_app({
        'static_path': os.path.abspath(os.path.join(__dir__, '..', 'weditor')),
        'debug': debug,
        'project_root': root,
    })
    print('project root: %s' % root)
    print('listening on http://%s:%d' % (current_ip(), port))
    if debug:
        logger.info("enable debug mode")
    signal.signal(signal.SIGINT, signal_handler)
    application.listen(port)

    with open(PID_FILEPATH, "w") as f:
        f.write(str(os.getpid()))

    tornado.ioloop.PeriodicCallback(try_exit, 100).start()
    tornado.ioloop.IOLoop.instance().start()
    # tornado.ioloop.IOLoop.instance().add_callback(consume_queue)

    if os.path.exists(PID_FILEPATH):
        os.unlink(PID_FILEPATH)


def create_shortcut():
    if os.name != 'nt':
        sys.exit("Shortcut only available in Windows")

    import pythoncom  # pyint: disable=import-error
    from win32com.shell import shell
    from win32com.shell import shellcon
    # Refs
    # - https://github.com/pearu/iocbio/blob/master/installer/utils.py
    # - https://blog.csdn.net/thundor/article/details/5968581
    ilist = shell.SHGetSpecialFolderLocation(0, shellcon.CSIDL_DESKTOP)
    dtpath = shell.SHGetPathFromIDList(ilist).decode('utf-8')

    shortcut = pythoncom.CoCreateInstance(shell.CLSID_ShellLink, None,
                                          pythoncom.CLSCTX_INPROC_SERVER,
                                          shell.IID_IShellLink)
    launch_path = sys.executable
    shortcut.SetPath(launch_path)
    shortcut.SetArguments("-m weditor2")
    shortcut.SetDescription(launch_path)
    shortcut.SetIconLocation(sys.executable, 0)
    shortcut.QueryInterface(pythoncom.IID_IPersistFile).Save(
        dtpath + "\\WEditor.lnk", 0)
    print("Shortcut created. " + dtpath + "\\WEditor.lnk")


def main():
    # yapf: disable
    ap = argparse.ArgumentParser(
        prog='weditor2',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    ap.add_argument("-v", "--version", action="store_true", help="show version")
    ap.add_argument('-q', '--quiet', action='store_true', help='quite mode, no open new browser')
    ap.add_argument('-p', '--port', type=int, default=17310, help='local listen port for weditor')
    ap.add_argument("-f", "--force-quit", action='store_true', help="force quit before start")
    ap.add_argument('--debug', action='store_true', help='open debug mode')
    ap.add_argument('--shortcut', action='store_true', help='create shortcut in desktop')
    ap.add_argument("--quit", action="store_true", help="stop weditor")
    ap.add_argument("--workspace", dest="workspace_option", default=None,
                    help="workspace folder for file operations (default: current working directory)")
    ap.add_argument("project_dir", nargs="?", default=None,
                    help="workspace folder (positional alternative to --workspace)")
    args = ap.parse_args()
    # yapf: enable

    if args.version:
        print(__version__)
        return

    if args.shortcut:
        create_shortcut()
        return
    
    if args.quit:
        cmd_quit(args.port)
        return

    selected_dir = args.workspace_option or args.project_dir
    project_root = os.path.abspath(os.path.expanduser(selected_dir or os.getcwd()))
    if not os.path.isdir(project_root):
        sys.exit('项目目录不存在或不是文件夹: ' + project_root)

    if sys.platform == 'win32' and sys.version_info[:2] >= (3, 8):
        import asyncio
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    open_browser = not args.quiet and not args.debug
    run_web(args.debug, args.port, open_browser, args.force_quit, project_root)


if __name__ == '__main__':
    main()
