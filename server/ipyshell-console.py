# coding: utf-8
#
# WRT:{"level": "...", "value": "..."} 输出，level 为 debug/info/warning/error
# EOF:{running milliseconds} 结束标记
# DBG:{debug string}
# LNO:{line number} # 从1开始，与 Monaco 行号一致

# 使用方法
# python3 {__file__}.py
# >>> print("hello", end="")
# LNO:1
# DBG:  1 print("hello", end="")
# WRT:{"level": "info", "value": "hello"}
# EOF:1

import base64
import contextlib
import linecache
import json
import logging
import os
import subprocess
import sys
import traceback
import time
from typing import Union, Any


def exec_code(code: str, globals) -> Union[Any, None]:
    try:
        ccode = compile(code, "<string>", "eval")
        _eval = True
    except SyntaxError:
        ccode = compile(code, "<string>", "exec")
        _eval = False

    if _eval:
        return eval(ccode, globals)
    exec(ccode, globals)


_file_contents = {}


def getline(filename: str, lineno: int) -> str:
    """
    Args:
        lineno starts from 0

    Note:
        linecache.getline starts from 1
    """
    if os.path.isfile(filename):
        return linecache.getline(filename, lineno + 1)
    if filename == "<string>":
        lines = _file_contents[filename].splitlines()
        if lineno < len(lines):
            return lines[lineno]
        return ''


def gen_tracefunc(sys_stdout):
    """
    Ref: http://www.dalkescientific.com/writings/diary/archive/2005/04/20/tracing_python_code.html
    """

    def _trace(frame, event, arg):
        if event == "line":
            if frame.f_code.co_filename != "<string>":
                return _trace
            lineno = frame.f_lineno - 1  # getline() starts from 0
            line = getline("<string>", lineno).rstrip()
            display_lineno = lineno + 1  # Monaco line numbers start from 1

            sys_stdout.write("LNO:{}\n".format(display_lineno))
            sys_stdout.write(f"DBG:{display_lineno:3d} {line}\n")
            sys_stdout.flush()

        return _trace

    return _trace


class QuitError(Exception):
    """ quit for this program """


def write_output(stream, data: str, level: str = "info", prefix: str = "WRT:"):
    """Emit one console chunk tagged with a log level."""
    if not data:
        return
    stream.write(prefix + json.dumps({"level": level, "value": data}) + "\n")
    stream.flush()


class ConsoleLogHandler(logging.Handler):
    """Forward logging records to the console using the record's own level."""
    _LEVELS = ("debug", "info", "warning", "error", "critical")

    def __init__(self, stream):
        super().__init__()
        self.stream = stream

    def emit(self, record):
        try:
            level = record.levelname.lower()
            if level not in self._LEVELS:
                level = "info"
            write_output(self.stream, self.format(record) + "\n", level)
        except Exception:
            self.handleError(record)


@contextlib.contextmanager
def mock_stdout_stderr(prefix="WRT:"):
    _stdout = sys.stdout
    _stderr = sys.stderr
    try:

        class MockStream:
            def __init__(self, level: str):
                self.level = level

            def isatty(self) -> bool:
                return False

            def write(self, data: str):
                try:
                    write_output(_stdout, data, self.level, prefix)
                except Exception as e:
                    raise QuitError("Output exception", str(e))

            def flush(self):
                _stdout.flush()

        # stdout is regular info, stderr carries errors and warnings
        sys.stdout = MockStream("info")
        sys.stderr = MockStream("error")
        yield _stdout, _stderr
    finally:
        sys.stdout = _stdout
        sys.stderr = _stderr


def input_text(value, dev=None):
    """Type text (including CJK) via Yosemite IME's ADB_INPUT_B64 broadcast.

    airtest's adb.shell() mangles non-ASCII arguments (UTF-8 read as GBK), so
    we call the adb binary directly with a pure-ASCII base64 payload instead.
    Requires Yosemite IME enabled (airtest enables it on first text() call).
    """
    if dev is None:
        from airtest.core.api import device as _dev
        dev = _dev()
    adb = dev.adb
    payload = base64.b64encode(value.encode("utf-8")).decode("ascii")
    cmd = [adb.adb_path, "-s", adb.serialno, "shell", "am", "broadcast",
           "-a", "ADB_INPUT_B64", "--es", "msg", payload]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError("adb broadcast failed: " + result.stderr.decode("utf-8", "replace"))
    return value


def stdin_readline():
    """Read one execution request.

    New protocol: {"code": "...", "debug": true|false}
    Legacy protocol: a JSON-encoded code string.
    """
    try:
        line = sys.stdin.readline().rstrip()
        if not line:
            raise QuitError("readline", "empty input")
        try:
            payload = json.loads(line)
        except (TypeError, ValueError):
            payload = line
        if isinstance(payload, dict):
            code = payload.get("code", "")
            debug = bool(payload.get("debug", False))
        else:
            code = payload if isinstance(payload, str) else str(payload)
            debug = False
        _file_contents["<string>"] = code
        # print(repr(code))
        return code, debug
    except QuitError:
        raise
    except Exception as e:
        raise QuitError("readline", str(e))


def main():
    sigint_twice = False
    project_root = os.path.abspath(
        os.environ.get('WEDITOR_PROJECT_ROOT') or os.getcwd())
    script_file = os.environ.get('WEDITOR_SCRIPT_FILE', '')
    if not (script_file and os.path.isfile(script_file)):
        script_file = project_root
    _globals = {
        "__file__": script_file,
        "__name__": "__main__",
        "os": os,
        "sys": sys,
        "time": time,
        "json": json,
    }

    with mock_stdout_stderr() as (stdout, stderr):
        # preload airtest into the REPL global namespace
        import airtest
        import airtest.core.api as _atapi
        import airtest.core.helper as _helper
        from airtest.core.settings import Settings as _settings
        for _base in (project_root, os.path.join(project_root, 'asserts')):
            if os.path.isdir(_base) and _base not in _helper.G.BASEDIR:
                _helper.G.BASEDIR.append(_base)
        _settings.PROJECT_ROOT = project_root
        # airtest.core.api installs a StreamHandler on sys.stderr at import time,
        # which is our "error" stream here; replace it so every record keeps
        # its own level instead of being reported as an error
        airtest_logger = logging.getLogger("airtest")
        _old_handlers = list(airtest_logger.handlers)
        _formatter = _old_handlers[0].formatter if _old_handlers else None
        if _formatter is None:
            _formatter = logging.Formatter(
                fmt='[%(asctime)s][%(levelname)s]<%(name)s> %(message)s',
                datefmt='%H:%M:%S')
        for _handler in _old_handlers:
            airtest_logger.removeHandler(_handler)
        _console_handler = ConsoleLogHandler(stdout)
        _console_handler.setFormatter(_formatter)
        airtest_logger.addHandler(_console_handler)
        airtest_logger.propagate = False
        _globals['airtest'] = airtest
        _globals['input_text'] = input_text
        for _name in ('connect_device', 'device', 'snapshot', 'touch',
                      'double_click', 'swipe', 'wait', 'keyevent', 'text',
                      'sleep', 'install', 'uninstall', 'start_app', 'stop_app',
                      'clear_app', 'Template', 'exists', 'find_all', 'log',
                      'logwrap', 'assert_exists', 'assert_not_exists'):
            if hasattr(_atapi, _name):
                _globals[_name] = getattr(_atapi, _name)

        stdout.write("DBG:Python (pid: {})\n".format(os.getpid()))
        while True:
            start = None

            try:
                # Read exec-code from stdin
                if stderr.isatty():
                    stderr.write(">>> ")
                stderr.flush()
                line, debug = stdin_readline()

                start = time.time()
                sigint_twice = False

                sys.settrace(gen_tracefunc(stdout) if debug else None)
                ret = exec_code(line, _globals)
                if ret is not None:
                    print(ret)
            except KeyboardInterrupt:
                # Cancel running
                if sigint_twice:
                    break
                sigint_twice = True
                if start:
                    write_output(stdout,
                                 ">>> Catch Signal KeyboardInterrupt\n",
                                 "warning")
            except QuitError as e:
                stdout.write("DBG:{!r}".format(e))
                # Read error from stdin
                stdout.write("QUIT\n")
                break
            except:
                # Show traceback as error level
                # https://docs.python.org/3/library/traceback.html
                flines = traceback.format_exc().splitlines(keepends=True)
                write_output(stdout,
                             flines[0] + "".join(flines[5:]).rstrip(),
                             "error")  # ignore top 2 stack-frame
            finally:
                sys.settrace(None)
                # Code block finished running
                millis = 0 if start is None else (time.time() - start) * 1000
                stdout.write("EOF:{}\n".format(int(millis)))
                stdout.flush()


if __name__ == "__main__":
    main()
