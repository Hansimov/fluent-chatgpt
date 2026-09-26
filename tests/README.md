# 浏览器回归测试

在项目目录执行：

```cmd
node tests/run-browser-tests.cjs
node tests/run-startup-tests.cjs
```

需要 Node.js 18+ 和 Chrome / Chromium。若无法自动找到浏览器，可通过 `CHROME_PATH` 指定可执行文件。

测试使用独立的临时浏览器配置，以 headless 模式运行，不连接账号，也不会操作已打开的 Chrome 窗口。临时配置在运行结束后删除。也可以直接在浏览器打开 `conversation-parsing.html` 查看逐项结果。

覆盖旧版消息结构、新版无 `main` 的 transcript、搜索单元及消息身份属性、`display:contents` 包装、`MarkdownRoot` 正文、读屏角色后备、新旧属性混合嵌套、隐藏/重复消息、章节和搜索、图片归属/标题/顺序、节点复用、反向滚动、API 分支映射与会话容器重新挂载。新版结构来自本机样本页的只读检查；测试使用合成内容，不保存私人会话或登录信息。

导航标题悬浮提示和宿主节点的 `data-script-version` 显示实际运行版本。项目文件更新不会自动替换已经运行的标签页脚本；需更新油猴中的脚本并刷新标签页。

`run-startup-tests.cjs` 额外启动仅监听 `127.0.0.1` 随机端口的测试服务器：保持 HTML 响应未完成，确认面板和问答/章节能在 `DOMContentLoaded` 之前出现。再验证延迟挂载、连续流式更新、动画帧暂停、路由检查延后、路由等待上限、旧会话隔离、分支/新建会话复用消息、面板被移除、main/body 重建，以及空白首页。API 请求在夹具中故意保持 pending，证明导航不依赖网络元数据完成。测试结束关闭服务器并删除临时 Chrome 配置，不访问真实会话。
