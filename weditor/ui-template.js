/* WEditor Vue template string, kept out of app.js for readability. */
window.WEditorTemplate = `      <el-container class="layout">
        <el-header class="header menu-bar">
          <span class="brand">WEditor <small>{{ version }}</small></span>
          <div class="menu-groups">
            <div class="menu-switch" :title="screenModeTitle">
              <span class="menu-label">投屏</span>
              <el-switch
                :model-value="screenMode === 'minicap'"
                :disabled="minicapConnecting"
                active-text="minicap"
                inactive-text="截图"
                @change="toggleScreenMode"
              />
            </div>

            <el-button size="small" type="primary" :loading="device.connecting.value" @click="doConnect">Connect</el-button>
            <el-button size="small" :loading="device.loading.value" @click="dumpHierarchy">Dump</el-button>
          </div>
        </el-header>

        <el-container class="main">
          <el-aside :width="screenPaneWidth" class="pane screen-pane">
            <div class="screen-toolbar">
              <el-select v-model="device.platform.value" size="small" style="width: 128px">
                <el-option label="Android AirTest" value="Android" />
                <el-option label="Android ADB" value="AndroidADB" />
                <el-option label="iOS" value="iOS" />
              </el-select>
              <el-input v-model="device.serial.value" size="small" placeholder="device url" style="width: 150px" />
              <span v-if="device.deviceId.value" class="devid">{{ device.deviceId.value }}</span>
            </div>
            <div class="panel-title">
              Screen
              <div class="screen-meta" :title="screenMetaText">{{ screenMetaText }}</div>
            </div>
            <div class="screen-area" ref="screenAreaEl">
              <div v-if="screenImg" class="screen-frame" :style="frameStyle">
                <img
                  ref="screenImgEl"
                  :src="screenImg"
                  class="screen-img"
                  draggable="false"
                  @load="fitScreen"
                  @mousedown="onScreenMouseDown"
                  @mousemove="onScreenMouseMove"
                  @mouseleave="onScreenMouseLeave"
                  @contextmenu.prevent
                />
                <div
                  v-if="activeMode === 'template' && templateRect"
                  class="template-selection"
                  :style="templateRect"
                ></div>
                <div v-if="cursorPoint" class="coord-tip" :style="coordTipStyle">
                  {{ cursorPoint.x }}, {{ cursorPoint.y }}
                </div>
              </div>
              <div v-else class="placeholder">No screenshot. Connect &amp; Dump.</div>
            </div>
          </el-aside>

          <div
            class="splitter"
            :class="{ active: splitterActive }"
            title="Drag to resize"
            @mousedown="startSplitResize"
          ></div>

          <el-aside width="auto" class="pane code-pane">
            <div ref="codeWorkspaceEl" class="code-workspace">
              <el-tabs v-model="rightTab" class="right-tabs">
                <el-tab-pane label="Coding" name="coding">
                  <div class="panel-title coding-toolbar">
                    Coding
                    <el-switch
                      v-model="codingMode"
                      class="coding-mode-switch"
                      size="small"
                      active-text="编程"
                      inactive-text="操作"
                    />
                    <el-radio-group v-model="editor.tapMode.value" size="small">
                      <el-radio-button value="coordinate" :disabled="pendingTemplateFill">坐标</el-radio-button>
                      <el-radio-button value="template">模板</el-radio-button>
                    </el-radio-group>
                    <el-button size="small" type="primary" @click="runCode">Run</el-button>
                    <el-button size="small" @click="runSelected">Sel</el-button>
                    <el-button size="small" @click="runCurrentLine">Line</el-button>
                    <el-button size="small" type="warning" :disabled="!shell.running.value" @click="shellInterrupt">Stop</el-button>
                    <el-button size="small" :loading="shell.restarting.value" @click="shellRestart">Restart</el-button>
                    <span v-if="pendingCoordHint" class="coord-fill-hint">{{ coordHintText }}</span>
                    <span v-else-if="pendingTemplateFill" class="coord-fill-hint">{{ templateHintText }}</span>
                  </div>
                  <div class="coding-body">
                    <div class="coding-explorer" aria-label="Explorer">
                      <div class="explorer-panel">
                        <div class="explorer-title">
                          <span :title="projectPath || 'Explorer'">{{ projectLabel }}</span>
                          <span class="explorer-actions" aria-hidden="true">···</span>
                        </div>
                        <div class="explorer-toolbar">
                          <div class="explorer-toolbar-row">
                            <button type="button" class="explorer-toolbar-button" title="打开项目目录" @click="openProject">打开项目</button>
                            <button type="button" class="explorer-toolbar-button" title="浏览服务端工作区文件" @click="openServerFileBrowser">服务文件</button>
                            <button type="button" class="explorer-toolbar-button primary" title="保存到工作区" @click="saveCodeFile">保存</button>
                          </div>
                          <div class="explorer-toolbar-row">
                            <button type="button" class="explorer-toolbar-button" title="新建文件" @click="createWorkspaceEntry('file')">新建</button>
                            <button type="button" class="explorer-toolbar-button" title="新建目录" @click="createWorkspaceEntry('dir')">目录</button>
                            <button type="button" class="explorer-toolbar-button" title="重命名" @click="renameWorkspaceEntry">改名</button>
                            <button type="button" class="explorer-toolbar-button danger" title="删除" @click="deleteWorkspaceEntry">删除</button>
                          </div>
                        </div>
                        <div class="explorer-tree">
                          <el-tree
                            v-loading="workspaceLoading"
                            :data="fileTreeData"
                            node-key="path"
                            :props="{ children: 'children', label: 'name', isLeaf: 'leaf' }"
                            highlight-current
                            :default-expand-all="true"
                            @node-click="onFileTreeNodeClick"
                          >
                            <template #default="{ node, data }">
                              <span class="explorer-tree-node" :title="data.path">
                                <span class="explorer-tree-icon" :class="data.type === 'dir' ? 'folder-icon' : 'python-icon'">
                                  <svg v-if="data.type === 'dir'" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h7l2 2h11v12H2V5zm2 2v10h16V9H9.41L7.41 7H4z"/></svg>
                                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6V2zm2 2v16h8V7h-3V4H8zm2 3h3v3h-3V7zm0 5h5v2h-5v-2zm0 4h5v2h-5v-2z"/></svg>
                                </span>
                                <span class="explorer-tree-label" :class="{ dirty: data.path === currentFilePath && fileDirty }">{{ node.label }}</span>
                              </span>
                            </template>
                          </el-tree>
                          <div v-if="!fileTreeData.length && !workspaceLoading" class="placeholder">工作区为空</div>
                        </div>
                      </div>
                    </div>
                    <div class="coding-editor-area">
                      <div class="coding-actions" :class="{ compact: actionsCompact }">
                      <el-tooltip
                        placement="top"
                        effect="dark"
                        :show-after="200"
                        :popper-options="{ modifiers: [{ name: 'flip', enabled: false }] }"
                      >
                        <template #content>
                          <div class="action-tip">
                            <div class="action-tip-title">Code Actions · 代码快捷插入</div>
                            <div class="action-tip-desc">{{ actionsCollapsed ? '展开工具栏' : '收起工具栏（仅保留图标）' }}</div>
                          </div>
                        </template>
                        <button
                          type="button"
                          class="coding-actions-toggle"
                          :aria-label="actionsCollapsed ? '展开工具栏' : '收起工具栏'"
                          @click="toggleActions"
                        >
                          <span class="coding-actions-toggle-icon">{{ actionsCollapsed ? '»' : '«' }}</span>
                          <span class="coding-actions-toggle-text">工具</span>
                        </button>
                      </el-tooltip>
                      <el-tooltip
                        v-for="action in codingActions"
                        :key="action.id"
                        placement="top"
                        effect="dark"
                        :show-after="300"
                        :popper-options="{ modifiers: [{ name: 'flip', enabled: false }] }"
                      >
                        <template #content>
                          <div class="action-tip">
                            <div class="action-tip-title">{{ action.label }} · {{ action.name }}</div>
                            <div class="action-tip-group">分组：{{ actionGroupName(action.group) }}</div>
                            <div class="action-tip-desc">{{ action.description }}</div>
                            <div class="action-tip-code">{{ action.code }}</div>
                            <div v-if="!codingMode" class="action-tip-warn">请先将上方模式切换为「编程」</div>
                          </div>
                        </template>
                        <span class="coding-action-wrap">
                          <button
                            type="button"
                            class="coding-action"
                            :class="{ active: activeSnippet === action.id }"
                            :data-group="action.group"
                            :disabled="!codingMode"
                            :aria-pressed="activeSnippet === action.id"
                            :aria-label="action.label + ' ' + action.name"
                            @click="useAction(action)"
                          >
                            <span class="coding-action-icon" v-html="action.icon" aria-hidden="true"></span>
                            <span class="coding-action-label">{{ action.label }}</span>
                          </button>
                        </span>
                      </el-tooltip>
                      </div>
                      <div ref="codeContainer" class="editor-container"></div>
                    </div>
                  </div>
                </el-tab-pane>
                <el-tab-pane label="Hierarchy" name="hierarchy">
                  <el-tree :data="hierarchyTree" node-key="_id" default-expand-all
                    :props="{ children: 'children', label: (d) => treeLabel(d) }"
                    @node-click="onNodeClick" />
                  <div class="selected-pane">
                    <div class="panel-title">
                      Selected Element
                      <el-button size="small" :disabled="!selectedNode" @click="doTap">Tap</el-button>
                    </div>
                    <el-descriptions :column="1" size="small" border v-if="selectedNode">
                      <el-descriptions-item label="class">{{ selectedInfo._type }}</el-descriptions-item>
                      <el-descriptions-item label="resource-id">{{ selectedInfo.resourceId }}</el-descriptions-item>
                      <el-descriptions-item label="text">{{ selectedInfo.text }}</el-descriptions-item>
                      <el-descriptions-item label="bounds">{{ JSON.stringify(selectedInfo.rect) }}</el-descriptions-item>
                    </el-descriptions>
                    <div v-else class="placeholder">Click a node in the hierarchy tree.</div>
                    <div class="code-hint">
                      <div>Generated code</div>
                      <el-input size="small" :model-value="editor.generatedCode.value" readonly />
                    </div>
                  </div>
                </el-tab-pane>
                <el-tab-pane label="Assets" name="assets">
                  <div class="panel-title resource-toolbar">
                    模板图片
                    <el-button size="small" :loading="templateAssetsLoading" @click="loadTemplateAssets">刷新</el-button>
                  </div>
                  <div v-if="templateAssets.length" class="asset-grid">
                    <div v-for="item in templateAssets" :key="item.filename" class="asset-card">
                      <div class="asset-thumb" @click="useTemplateAsset(item)" :title="'插入模板代码：' + item.filename">
                        <img :src="item.url" :alt="item.filename" />
                      </div>
                      <div class="asset-name" :title="item.filename">{{ item.filename }}</div>
                      <div class="asset-meta">{{ (item.size / 1024).toFixed(1) }} KB</div>
                      <el-button class="asset-delete" size="small" type="danger" plain @click="deleteTemplateAsset(item)">删除</el-button>
                    </div>
                  </div>
                  <div v-else class="placeholder">暂无模板图片。在 Hierarchy 中选中节点，切到模板模式后点击 Tap，生成的图片会保存在这里。</div>
                </el-tab-pane>
              </el-tabs>
              <div
                class="splitter splitter-horizontal"
                :class="{ active: consoleSplitterActive }"
                title="Drag to resize console"
                @mousedown="startConsoleResize"
              ></div>
              <div class="console-panel" :style="{ height: consoleHeight }">
                <div class="panel-title">Console</div>
                <div class="console-toolbar">
                  <label
                    v-for="lv in LOG_LEVELS"
                    :key="'filter-' + lv.key"
                    class="console-level-chip"
                    :class="{ off: !consoleLevels.includes(lv.key) }"
                    :title="'显示/隐藏 ' + lv.label + ' 日志'"
                  >
                    <input
                      type="checkbox"
                      :checked="consoleLevels.includes(lv.key)"
                      @change="toggleConsoleLevel(lv.key, $event)"
                    />
                    <span>{{ lv.label }}</span>
                  </label>
                  <button type="button" class="console-reset" title="重置级别过滤" @click="resetConsoleSettings">重置</button>
                </div>
                <div class="console">
                  <span
                    v-for="(line, i) in visibleConsoleOutput"
                    :key="i"
                    class="console-line"
                    :class="'log-' + line.level"
                  >{{ line.value }}</span>
                </div>
              </div>
            </div>
          </el-aside>
        </el-container>

        <div
          ref="toolbarEl"
          class="floating-toolbar"
          :class="{ dragging: toolbarDragging }"
          :style="toolbarStyle"
          title="拖拽移动工具栏"
          @mousedown="startToolbarDrag"
        >
          <el-button
            class="toolbar-key"
            size="small"
            circle
            aria-label="返回键"
            title="模拟返回键 (BACK)"
            @click="sendToolbarKey('BACK')"
          >
            <svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" />
            </svg>
          </el-button>
          <el-button
            class="toolbar-key"
            size="small"
            circle
            aria-label="HOME 键"
            title="模拟 HOME 键"
            @click="sendToolbarKey('HOME')"
          >
            <svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 2 11h3v9h6v-6h2v6h6v-9h3z" />
            </svg>
          </el-button>
          <el-button
            class="toolbar-refresh"
            size="small"
            circle
            aria-label="刷新截图"
            :title="screenshotLoading ? '截图中...' : '刷新截图'"
            :loading="screenshotLoading"
            @click="refreshScreenshotFromToolbar"
          >
            <svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
          </el-button>
        </div>

        <el-dialog v-model="fileBrowserVisible" title="服务端工作区文件" width="560px" class="file-browser-dialog">
          <div class="file-browser-bar">
            <el-button size="small" :disabled="!fileBrowserDir" @click="loadFileBrowserDir(browserParentDir(fileBrowserDir))">上级</el-button>
            <span class="file-browser-path" :title="fileBrowserDir">{{ fileBrowserDir || '项目根目录' }}</span>
            <el-button size="small" @click="loadFileBrowserDir(fileBrowserDir)">刷新</el-button>
          </div>
          <div v-loading="fileBrowserLoading" class="file-browser-list">
            <div
              v-for="entry in fileBrowserEntries"
              :key="entry.path"
              class="file-browser-item"
              :title="entry.path"
              @click="onFileBrowserEntryClick(entry)"
            >
              <span class="file-browser-icon" :class="entry.type === 'dir' ? 'folder' : 'file'">
                {{ entry.type === 'dir' ? '目录' : '文件' }}
              </span>
              <span class="file-browser-name">{{ entry.name }}</span>
            </div>
            <div v-if="!fileBrowserEntries.length && !fileBrowserLoading" class="placeholder">当前目录为空</div>
          </div>
          <p v-if="fileBrowserError" class="file-browser-error">{{ fileBrowserError }}</p>
          <template #footer>
            <el-button size="small" @click="fileBrowserVisible = false">取消</el-button>
          </template>
        </el-dialog>
      </el-container>
`
