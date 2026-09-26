# 浏览器回归测试

在项目目录执行：

```cmd
node tests/run-browser-tests.cjs
```

需要 Node.js 18+ 和 Chrome / Chromium。若无法自动找到浏览器，可通过 `CHROME_PATH` 指定可执行文件。

测试使用独立的临时浏览器配置，以 headless 模式运行，不连接账号，也不会操作已打开的 Chrome 窗口。临时配置在运行结束后删除。也可以直接在浏览器打开 `conversation-parsing.html` 查看逐项结果。

覆盖旧版消息结构、新版无 `main` 的 transcript、读屏角色后备、隐藏/重复消息、章节和搜索、图片归属/标题/顺序、节点复用、反向滚动、API 分支映射与会话容器重新挂载。新版结构来自本机样本页的只读检查；测试使用合成内容，不保存私人会话或登录信息。
