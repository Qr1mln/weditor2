# coding: utf-8
#
# WRT:{quoted output string}
# EOF:{running milliseconds} 结束标记
# DBG:{debug string}
# LNO:{line number} # 从0开始

# 使用方法
# python3 {__file__}.py
# >>> print("hello", end="")
# LNO:0
# DBG:  0 print("hello", end="")
# WRT:"hello"
# EOF:1

import base64
import contextlib
import linecache
import json
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


def gen_tracefunc(trace_filename: str, sys_stdout):
    """
    Ref: http://www.dalkescientific.com/writings/diary/archive/2005/04/20/tracing_python_code.html
    """

    def _trace(frame, event, arg):
        if event == "line":
            lineno = frame.f_lineno - 1  # set lineno starts from 0
            filename = frame.f_globals.get("__file__")

            if filename == trace_filename:
                line = getline(filename, lineno).rstrip()

                sys_stdout.write("LNO:{}\n".format(lineno))
                sys_stdout.write(f"DBG:{lineno:3d} {line}\n")
                sys_stdout.flush()
                # time.sleep(.5)

        return _trace

    return _trace


class QuitError(Exception):
    """ quit for this program """


@contextlib.contextmanager
def mock_stdout_stderr(prefix="WRT:"):
    _stdout = sys.stdout
    _stderr = sys.stderr
    try:

        class MockStdout:
            def isatty(self) -> bool:
                return False

            def write(self, data: str):
                try:
                    if data != "":
                        _stdout.write(prefix + json.dumps(data) + "\n")
                        _stdout.flush()
                except Exception as e:
                    raise QuitError("Output exception", str(e))
            def flush(self):
                _stdout.flush()
        sys.stdout = sys.stderr = MockStdout()
        yield _stdout, _stderr  # lambda s: _stdout.write(s+"\n")
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
    try:
        line = sys.stdin.readline().rstrip()
        if line.startswith("\""):
            line = json.loads(line)
        _file_contents["<string>"] = line
        # print(repr(line))
        return line
    except Exception as e:
        raise QuitError("readline", str(e))


def main():
    sigint_twice = False
    _globals = {
        "__file__": "<string>",
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
        _globals['airtest'] = airtest
        _globals['input_text'] = input_text
        for _name in ('connect_device', 'device', 'snapshot', 'touch',
                      'double_click', 'swipe', 'wait', 'keyevent', 'text',
                      'sleep', 'install', 'uninstall', 'start_app', 'stop_app',
                      'clear_app', 'Template', 'exists', 'find_all', 'log',
                      'logwrap', 'assert_exists', 'assert_not_exists'):
            if hasattr(_atapi, _name):
                _globals[_name] = getattr(_atapi, _name)

        sys.settrace(gen_tracefunc("<string>", stdout))
        stdout.write("DBG:Python (pid: {})\n".format(os.getpid()))
        while True:
            start = None

            try:
                # Read exec-code from stdin
                if stderr.isatty():
                    stderr.write(">>> ")
                stderr.flush()
                line = stdin_readline()

                start = time.time()
                sigint_twice = False

                ret = exec_code(line, _globals)
                if ret is not None:
                    print(ret)
            except KeyboardInterrupt:
                # Cancel running
                if sigint_twice:
                    break
                sigint_twice = True
                if start:
                    stdout.write(
                        "WRT:" +
                        json.dumps(">>> Catch Signal KeyboardInterrupt\n"))
                    stdout.write("\n")
                # stdout.write("INFO:KeyboardInterrupt catched, twice quit\n")
            except QuitError as e:
                stdout.write("DBG:{!r}".format(e))
                # Read error from stdin
                stdout.write("QUIT\n")
                break
            except:
                # Show traceback
                # https://docs.python.org/3/library/traceback.html
                flines = traceback.format_exc().splitlines(keepends=True)
                print(flines[0] +
                      "".join(flines[5:]).rstrip())  # ignore top 2 stack-frame
            finally:
                # Code block finished running
                millis = 0 if start is None else (time.time() - start) * 1000
                stdout.write("EOF:{}\n".format(int(millis)))
                stdout.flush()


if __name__ == "__main__":
    main()
