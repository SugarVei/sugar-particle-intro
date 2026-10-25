# SUGAR 粒子开场

原站参考：https://cn.streamax.com/ 。按提供的开场规格实现，品牌图形改为横排 SUGAR。

## 直接打开

双击 `dist/index.html` 即可离线运行，不需要安装依赖。也可以从本目录运行：

```powershell
python -m http.server 8741 --bind 127.0.0.1 --directory dist
```

打开 http://127.0.0.1:8741/ 。每次刷新完整重播，没有 localStorage、Cookie 或会话跳过逻辑。

## 接入现有首页

把 `dist/sugar-intro.js` 复制到网站静态资源目录，在首页加载脚本，并将元素放在 body 最后一层：

```html
<script src="/sugar-intro.js" defer></script>
<!-- 现有首页的全部内容继续保留 -->
<sugar-intro slogan="滑动解锁智慧交通之旅"></sugar-intro>
```

如需替换口号，只改 `slogan` 属性；无需修改 Canvas 或动画。`dist/index.html` 中的 `<main>` 是进入后的演示 Hero，可直接替换为真实首页。没有改动任何现有网站。

组件使用 Shadow DOM 隔离样式。进入时清除全部动画、监听器与遮罩，恢复背景滚动及原有 inert 状态，不改变 URL。需要指定退出后的键盘焦点，可在首页标题添加 `tabindex="-1" data-intro-focus`。

```js
document.addEventListener('sugar:intro-complete', () => {
  // 可选：在这里启动首页本身的内容。
});
```

## 行为与参数

- 纯黑全屏遮罩；圆点以 #C6FF00 / #B8E600 为主，约 6% 白色。
- 开场散布约 0.36 秒，随后以 2.46–2.64 秒缓动和 0–0.18 秒错峰延迟汇聚；约 3.2 秒定型。
- 桌面 1000–1800 粒子，移动端 480–850 粒子；字形宽约视口 76%。
- 离屏 Canvas 用 900 字重无衬线绘字、按透明度采样，保留五个字母的全部笔画。
- 定型后不改目标点，不旋转、不呼吸；单轴漂移上限 1.55px，仅亮度闪烁。
- 定型后降到约 30fps 绘制，汇聚 / 退出约 60fps；DPR 最高为 2。
- 窗口变化后重新采样，约 0.65 秒过渡；页面隐藏时停止 requestAnimationFrame，返回时续播。
- 仅“进入”按钮响应；文案没有点击、拖拽、滑块、鼠标追踪逻辑。
- 点击后约 0.9 秒径向散开并移除遮罩，文字和按钮同步淡出；重复点击被忽略。
- 支持键盘 Tab → Enter；背景在遮罩显示期间 inert。

## 文件

- `dist/index.html`：可离线运行的演示首页。
- `dist/sugar-intro.js`：可复用的完整开场组件，无第三方依赖。
- `dist/favicon.svg`：演示图标。

低端真机流畅度和不同系统的字体栅格表现仍需在目标设备确认；模拟视口和 CPU 降速不能替代真机测试。
