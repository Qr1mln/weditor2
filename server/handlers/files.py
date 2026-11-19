# coding: utf-8
#

import os
import shutil
import tempfile
from urllib.parse import urlparse

from logzero import logger
from tornado.escape import json_decode

from .page import BaseHandler

DEFAULT_ROOT = os.path.abspath(
    os.path.expanduser(os.environ.get("WEDITOR_WORKSPACE", "~/.weditor/workspace")))
workspace_root = DEFAULT_ROOT
MAX_DEPTH = 20


def _clean_relative(raw):
    text = str(raw or '').strip().replace('\\', '/')
    if not text or '\x00' in text:
        raise ValueError('empty or invalid path')
    if text.startswith('/') or (len(text) > 1 and text[1] == ':'):
        raise ValueError('absolute path is not allowed')
    parts = []
    for part in text.split('/'):
        if part in ('', '.'):
            continue
        if part == '..':
            raise ValueError('parent path is not allowed')
        parts.append(part)
    if not parts:
        raise ValueError('empty path')
    return '/'.join(parts)


def resolve_workspace_path(raw):
    relative = _clean_relative(raw)
    path = os.path.abspath(os.path.join(workspace_root, *relative.split('/')))
    if os.path.commonpath([workspace_root, path]) != workspace_root:
        raise ValueError('path outside workspace')
    return path


def display_relative(path):
    relative = os.path.relpath(path, workspace_root)
    return '' if relative == '.' else relative.replace('\\', '/')


def ensure_workspace():
    os.makedirs(workspace_root, exist_ok=True)


def set_project_root(raw):
    global workspace_root
    text = str(raw or '').strip()
    path = DEFAULT_ROOT if not text else os.path.abspath(os.path.expanduser(text))
    if not os.path.isdir(path):
        raise NotADirectoryError('project directory does not exist: %s' % path)
    workspace_root = path
    return path


def write_text_atomic(path, content):
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix='.weditor-', suffix='.tmp', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def describe_entry(path, relative, depth=0):
    if os.path.islink(path):
        return None
    stat = os.stat(path)
    is_dir = os.path.isdir(path)
    item = {
        'name': os.path.basename(path),
        'path': relative,
        'type': 'dir' if is_dir else 'file',
        'size': 0 if is_dir else stat.st_size,
        'modified': int(stat.st_mtime * 1000),
        'leaf': not is_dir,
    }
    if is_dir:
        children = []
        if depth < MAX_DEPTH:
            for name in os.listdir(path):
                child = describe_entry(
                    os.path.join(path, name),
                    (relative + '/' + name).lstrip('/'),
                    depth + 1)
                if child:
                    children.append(child)
        children.sort(key=lambda entry: (entry['type'] != 'dir', entry['name'].lower()))
        item['children'] = children
        item['size'] = len(children)
    return item


class WorkspaceBaseHandler(BaseHandler):
    def set_default_headers(self):
        self.set_header('Cache-Control', 'no-store')

    def check_origin(self, origin):
        if not origin:
            return True
        return urlparse(origin).netloc == self.request.host

    def fail(self, e):
        if isinstance(e, FileExistsError):
            status = 409
        elif isinstance(e, FileNotFoundError):
            status = 404
        elif isinstance(e, (ValueError, NotADirectoryError, IsADirectoryError)):
            status = 400
        elif isinstance(e, PermissionError):
            status = 403
        else:
            status = 500
        if status == 500:
            logger.exception('workspace operation failed')
        else:
            logger.warning('workspace operation failed: %s', e)
        self.set_status(status)
        self.write({'success': False, 'description': str(e)})


class ProjectHandler(WorkspaceBaseHandler):
    """Get or change the local project directory shown by the explorer."""

    def get(self):
        self.write({'success': True, 'root': workspace_root})

    def post(self):
        try:
            data = json_decode(self.request.body)
            root = set_project_root(data.get('path'))
            self.write({'success': True, 'root': root})
        except Exception as e:
            self.fail(e)


class WorkspaceFilesHandler(WorkspaceBaseHandler):
    """List/create/rename/delete files inside the local workspace."""

    def get(self):
        try:
            ensure_workspace()
            relative = self.get_query_argument('path', '').strip()
            path = workspace_root if not relative else resolve_workspace_path(relative)
            if not os.path.isdir(path):
                raise NotADirectoryError('not a directory')
            items = []
            for name in os.listdir(path):
                item = describe_entry(
                    os.path.join(path, name),
                    (relative.replace('\\', '/').rstrip('/') + '/' + name).lstrip('/'))
                if item:
                    items.append(item)
            items.sort(key=lambda entry: (entry['type'] != 'dir', entry['name'].lower()))
            self.write({
                'success': True,
                'path': display_relative(path),
                'root': workspace_root,
                'items': items,
            })
        except Exception as e:
            self.fail(e)

    def post(self):
        try:
            ensure_workspace()
            data = json_decode(self.request.body)
            path = resolve_workspace_path(data.get('path'))
            if os.path.exists(path):
                raise FileExistsError('path already exists')
            kind = data.get('type', 'file')
            if kind == 'dir':
                os.makedirs(path)
            elif kind == 'file':
                write_text_atomic(path, str(data.get('content', '')))
            else:
                raise ValueError('unsupported entry type: %s' % kind)
            self.set_status(201)
            self.write({'success': True, 'path': display_relative(path), 'type': kind})
        except Exception as e:
            self.fail(e)

    def patch(self):
        try:
            data = json_decode(self.request.body)
            source = resolve_workspace_path(data.get('path'))
            target = resolve_workspace_path(data.get('newPath'))
            if not os.path.exists(source):
                raise FileNotFoundError('source not found')
            if os.path.exists(target):
                raise FileExistsError('target already exists')
            os.makedirs(os.path.dirname(target), exist_ok=True)
            os.rename(source, target)
            self.write({
                'success': True,
                'path': display_relative(source),
                'newPath': display_relative(target),
            })
        except Exception as e:
            self.fail(e)

    def delete(self):
        try:
            path = resolve_workspace_path(self.get_query_argument('path', ''))
            if not os.path.exists(path):
                raise FileNotFoundError('path not found')
            recursive = self.get_query_argument('recursive', '0') in ('1', 'true', 'True')
            if os.path.isdir(path):
                if recursive:
                    shutil.rmtree(path)
                else:
                    os.rmdir(path)
            else:
                os.remove(path)
            self.write({'success': True, 'path': display_relative(path)})
        except Exception as e:
            self.fail(e)


class WorkspaceContentHandler(WorkspaceBaseHandler):
    """Read/write UTF-8 text files inside the local workspace."""

    def get(self):
        try:
            ensure_workspace()
            path = resolve_workspace_path(self.get_query_argument('path', ''))
            if not os.path.isfile(path):
                raise FileNotFoundError('file not found')
            with open(path, 'r', encoding='utf-8', newline='') as f:
                content = f.read()
            self.write({
                'success': True,
                'path': display_relative(path),
                'content': content,
                'encoding': 'utf-8',
            })
        except Exception as e:
            self.fail(e)

    def put(self):
        try:
            ensure_workspace()
            data = json_decode(self.request.body)
            path = resolve_workspace_path(data.get('path'))
            if os.path.isdir(path):
                raise IsADirectoryError('path is a directory')
            write_text_atomic(path, str(data.get('content', '')))
            self.write({
                'success': True,
                'path': display_relative(path),
                'size': os.path.getsize(path),
            })
        except Exception as e:
            self.fail(e)
