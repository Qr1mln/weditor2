# WEditor
Editor Driver for ATX

Port: 17310

To memorize the create day: 2017/03/10

# Installation
```
pip install weditor
```

# Usage
```
python -m weditor2 --workspace D:\work\myproject
```
也可把目录作为位置参数 `python -m weditor2 D:\work\myproject`。省略时使用启动命令所在的工作目录。旧的 `python -m server` / `python -m weditor` 入口仍然可用。启动后文件栏的“项目”会显示该目录名。

# API
### Get Version
This method returns local server version

```
GET /api/v1/version
```

#### Response
Status: 200

```json
{
	"name": "0.0.2"
}
```

## File operations

文件读写根目录由启动命令的 `--workspace` 参数（或位置参数）决定，所有接口只接受该目录内的相对路径，服务端会拒绝 `..`、绝对路径与越界路径。

### Get project info
```
GET /api/v1/project
```
返回 `{"success": true, "root": "绝对路径", "name": "目录名"}`。

### List directory
```
GET /api/v1/files/list?dir=scripts
```
`dir` 省略时列出根目录。返回 `{"success": true, "dir": "scripts", "entries": [{"name": "demo.py", "path": "scripts/demo.py", "type": "file"}]}`；目录项 `type` 为 `dir`，文件项为 `file`，目录排在前面。符号链接会被忽略。

### Read file
```
GET /api/v1/files/content?path=scripts/demo.py
```
返回 `{"success": true, "path": "...", "name": "...", "content": "文件文本"}`。文件必须是 UTF-8 文本。

### Save file
```
PUT /api/v1/files/content
Content-Type: application/json

{"path": "scripts/demo.py", "content": "新的内容"}
```
将内容写回已存在的文件（同目录临时文件 + 原子替换），不创建、不下载。

### Create file
```
POST /api/v1/files
Content-Type: application/json

{"path": "scripts/new.py"}
```
在根目录下创建空文件；若文件已存在返回 409。

## Device API
### Get device list
This method returns devices connected to PC

```
GET /api/v1/devices
```

### Get current using device
```
GET /api/v1/user/device
```

### Set current using device
```
PUT /api/v1/user/device
```

#### Example Input
```json
{
	"serial": "cff12345"
}
```

### Get device screenshot
```
GET /api/v1/devices/:serial/screenshot
```

#### Response
```json
{
	"type": "jpeg",
	"data": "bXkgbmV3IGZpbGUgY29udGVudHM"
}
```

#### Response if error
Status: 403

```json
{
	"description": "Some reason"
}
```

### Get UIView
Get uiview with json response

```
GET /api/v1/devices/{serial}/uiview
```

#### Response
Status: 200

Every node will always has an `id` field. iOS and Android got the some response structure.


```json
{
	"nodes": [{
		"id": 0,
		"text": "Hello",
		"description": "hello",
		"other...": "..."
	}, {
		"id": 1,
		"other...": ".."
	}]
}
```

## Python Debug WebSocket API
### Run code
This method run and get the live output

```
WebSocket CONNECT /api/v1/build
```

SEND json data

```json
{
	"content": "print('hello')"
}
```

RECV json data when running

```json
{
	"buffer": "hello"
}
```

RECV json data when finished. __duration unit is ms.__

```json
{
	"buffer": "end ...",
	"result": {
		"duration": 1002,
		"exitCode": 1
	}
}
```

# LICENSE
[MIT](../LICENSE)
