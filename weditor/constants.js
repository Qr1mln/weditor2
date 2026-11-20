/* WEditor constants: localStorage keys, log levels and coding actions. */
(function () {
  'use strict'
  const SPLIT_RATIO_KEY = 'weditor.splitRatio'
  const CONSOLE_HEIGHT_KEY = 'weditor.consoleHeight'
  const TOOLBAR_POS_KEY = 'weditor.toolbarPos'
  const SCREEN_MODE_KEY = 'weditor.screenMode'
  const ACTIONS_COLLAPSED_KEY = 'weditor.actionsCollapsed'
  const ACTION_GROUP_LABELS = { action: '交互操作', assert: '等待与断言', utility: '辅助工具' }
  const CONSOLE_LEVELS_KEY = 'weditor.consoleLevels'
  const EXPLORER_WIDTH_KEY = 'weditor.explorerWidth'
  const DEBUG_MODE_KEY = 'weditor.debugMode'
  const LOG_LEVELS = [
    { key: 'debug', label: 'DEBUG' },
    { key: 'info', label: 'INFO' },
    { key: 'warning', label: 'WARNING' },
    { key: 'error', label: 'ERROR' },
  ]
  const LOG_LEVEL_ALIASES = {
    debug: 'debug', trace: 'debug',
    info: 'info', notice: 'info',
    warn: 'warning', warning: 'warning',
    error: 'error', err: 'error', critical: 'error', fatal: 'error',
  }

  const CODING_ACTIONS = [
    {
      id: 'coord', label: '坐标', name: '插入坐标', group: 'action',
      description: '双击 Screen 获取坐标，替换为 (x, y)；无选中时插入到光标处。',
      code: '(x, y)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
    },
    {
      id: 'template', label: '模板', name: '插入模板', group: 'action',
      description: '在 Screen 框选图像并双击确认，保存模板后替换当前选中内容为模板路径。',
      code: 'tpl.png',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" stroke-dasharray="3 2"/><path d="m5 16 4.5-4.5 3.5 3 2.5-2.5L21 17"/><circle cx="9" cy="8.5" r="1.2"/></svg>',
    },
    {
      id: 'touch', label: 'touch', name: '坐标点击', group: 'action',
      description: '插入 touch((x, y)) 代码，双击 Screen 填充坐标。',
      code: 'touch((x, y))',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10"/><path d="M12 10V4.5a1.5 1.5 0 0 1 3 0V10"/><path d="M15 10V6a1.5 1.5 0 0 1 3 0v8c0 4.2-2.6 7-6.5 7S6 18.4 6 14v-3a1.5 1.5 0 0 1 3 0v2"/></svg>',
    },
    {
      id: 'touchTemplate', label: 'touch 模板', name: '模板点击', group: 'action',
      description: '插入 touch(Template(...)) 代码，框选 Screen 图像保存模板并填充路径。',
      code: 'touch(Template("tpl.png"))',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M15 4h4a1 1 0 0 1 1 1v4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/><path d="M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="2.5"/><path d="M12 7v2M12 15v2M7 12h2M15 12h2"/></svg>',
    },
    {
      id: 'wait', label: 'wait', name: '等待图像', group: 'assert',
      description: '等待图像模板出现，超时时间为 10 秒。',
      code: 'wait(Template("tpl.png"), timeout=10)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h5"/><path d="M12 2.5v2"/><circle cx="12" cy="13" r="8"/><path d="M12 9v4.2l2.8 1.8"/></svg>',
    },
    {
      id: 'swipe', label: 'swipe', name: '滑动', group: 'action',
      description: '从起点滑动到终点，duration 为持续时间（秒）。',
      code: 'swipe((x1, y1), (x2, y2), duration=0.5)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 21v-8a2 2 0 0 1 4 0v8"/><path d="M9.5 13V6.5a2 2 0 0 1 4 0V13"/><path d="M5.5 10V4.5"/><path d="m3.5 6.5 2-2 2 2"/><path d="M16 13V8"/><path d="m14 10 2-2 2 2"/></svg>',
    },
    {
      id: 'exists', label: 'exists', name: '图像存在', group: 'assert',
      description: '判断图像模板是否出现在当前屏幕；框选范围后自动填充模板路径。',
      code: 'exists(Template("tpl.png"))',
      templateCode: 'exists(Template("tpl.png"))',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="m7.5 10.5 2 2 4-4"/></svg>',
    },
    {
      id: 'text', label: 'text', name: '输入文本', group: 'action',
      description: '向当前焦点输入英文文本；中文请改用 input_text。',
      code: 'text("hello")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6.5 9.5h7M10 9.5V16M15 9.5h3.5M16.75 9.5V16M15 16h3.5"/></svg>',
    },
    {
      id: 'keyevent', label: 'keyevent', name: '系统按键', group: 'action',
      description: '发送系统按键，例如 HOME、BACK、POWER。',
      code: 'keyevent("HOME")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 13.5h.01M17 13.5h.01M10 13.5h4"/></svg>',
    },
    {
      id: 'snapshot', label: 'snapshot', name: '保存截图', group: 'utility',
      description: '保存当前设备屏幕到文件，便于后续 Template 匹配。',
      code: 'snapshot("screen.png")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h2l1.5-2.5h5L16 6h2a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    },
    {
      id: 'sleep', label: 'sleep', name: '休眠等待', group: 'assert',
      description: '暂停脚本执行指定的秒数。',
      code: 'sleep(1)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>',
    },
    {
      id: 'log', label: 'log', name: '打印日志', group: 'utility',
      description: '向控制台输出一条日志；Run 后内容显示在下方 Console。',
      code: 'log("message")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z"/><path d="M8 9h8M8 12h5"/></svg>',
    },
  ]

  window.WEditorConstants = {
    SPLIT_RATIO_KEY, CONSOLE_HEIGHT_KEY, TOOLBAR_POS_KEY, SCREEN_MODE_KEY,
    ACTIONS_COLLAPSED_KEY, ACTION_GROUP_LABELS, CONSOLE_LEVELS_KEY,
    EXPLORER_WIDTH_KEY, DEBUG_MODE_KEY,
    LOG_LEVELS, LOG_LEVEL_ALIASES, CODING_ACTIONS,
  }
})()
