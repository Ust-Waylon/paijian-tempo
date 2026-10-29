# 拍间 Tempo

**留一点时间，给练习。**

一款离线运行的 Windows / macOS 节拍器与简易鼓机。没有账号、广告和网络音频，打开就能开始练习。

[English](README.en.md) · [使用指南](docs/USER_GUIDE.zh-CN.md) · [参与开发](CONTRIBUTING.md) · [MIT License](LICENSE)

![拍间 Tempo 浅色界面](docs/images/metronome-light.png)

## 下载安装

**普通用户直接下载安装包即可，不需要安装 Node.js 或下载源码。**

| 系统 / 芯片                   | 安装包                                                                                                                      | 免安装 / 压缩包                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Windows · Intel / AMD（x64）  | [下载 EXE 安装程序](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-x64.exe)   | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-x64.zip)   |
| Windows · ARM64               | [下载 EXE 安装程序](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-arm64.exe) | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-win-arm64.zip) |
| Mac · Apple Silicon（M 系列） | [下载 DMG](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-arm64.dmg)          | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-arm64.zip) |
| Mac · Intel                   | [下载 DMG](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-x64.dmg)            | [ZIP](https://github.com/Ust-Waylon/paijian-tempo/releases/download/v1.2.0/Paijian-Tempo-1.2.0-mac-x64.zip)   |

[全部版本与 SHA-256 校验值](https://github.com/Ust-Waylon/paijian-tempo/releases/latest)

Windows 运行 `.exe` 按向导安装，默认安装到当前用户。免安装版解压后运行「拍间 Tempo.exe」。Mac 打开 `.dmg`，将「拍间 Tempo」拖入 Applications。

安装包目前未使用受信任的开发者证书签名，Mac 未做 Apple 公证。若系统要求确认开发者，请先确认文件来自本仓库，再按系统提示允许打开。

## 能做什么

- **30–240 BPM**：拖动圆环、输入数字、使用加减按钮，或拍击定速。
- **节拍器**：自由拍和多种拍号，每拍 1–4 声，逐拍切换重音、轻音或静音。
- **六种鼓组**：摇滚、流行、放克、迪斯科、Shuffle 和 Half-time。
- **练习设置**：按小节逐渐加速，设置目标 BPM，或在指定练习时长后结束。
- **常用节奏**：保存自己的设置；鼠标悬停后点击右上角 × 删除预置或自定义节奏。
- **深浅色与专注模式**：支持键盘操作、窗口置顶，切换窗口或最小化后继续打拍。
- **离线使用**：字体随程序提供，鼓声在本地合成，设置保存在本机。

## 简易鼓机

点击左上角「鼓机」，选一个节奏，再用同一个速度盘控制 BPM。

| 节奏                 | 律动                                     |
| -------------------- | ---------------------------------------- |
| 基础摇滚 / Rock      | 八分踩镲，底鼓在 1、3 拍，军鼓在 2、4 拍 |
| 流行反拍 / Pop       | 切分底鼓和末拍开镲                       |
| 轻放克 / Funk        | 十六分踩镲、切分底鼓和轻军鼓             |
| 四拍迪斯科 / Disco   | 每拍底鼓、反拍开镲                       |
| 布鲁斯摇摆 / Shuffle | 三连音网格，长短 2:1 的踩镲              |
| 半拍律动 / Half-time | 军鼓落在第 3 拍，律动更舒展              |

所有鼓组都是一小节循环的 4/4 拍，BPM 以四分音符为一拍。播放中换鼓组会在下一小节衔接；点击鼓名可分别静音底鼓、军鼓和踩镲。

![鼓机深色界面](docs/images/drums-dark.png)

## 从源码运行

开发需要 **Node.js 22.12 或更新版本**。Windows 与 macOS 使用相同源码。

```sh
npm ci
npm start
```

构建当前系统的未打包应用目录：

```sh
npm run pack
```

生成可分发的安装包（在对应操作系统运行）：

```sh
npm run dist:win     # Windows EXE 安装程序和 ZIP
npm run dist:mac     # macOS DMG 和 ZIP
```

文件输出至 `dist/`。加上 `-- --x64` 或 `-- --arm64` 可指定架构。GitHub Release 自动在 Windows x64、Windows ARM64、Mac Apple Silicon 和 Mac Intel 环境中分别构建、验证安装及启动后发布。

浏览器预览：

```sh
npm run preview
```

在浏览器中打开终端打印的本机地址。桌面版额外提供窗口置顶和应用快捷键菜单。

## 快捷键

| 按键          | 操作                |
| ------------- | ------------------- |
| Space         | 开始 / 暂停         |
| ↑ / ↓         | 速度 ±1 BPM         |
| Shift + ↑ / ↓ | 速度 ±10 BPM        |
| T             | 拍击定速            |
| F             | 进入 / 退出专注模式 |
| M             | 静音 / 恢复         |
| ?             | 查看快捷键          |
| Esc           | 关闭弹窗 / 退出专注 |

输入框和获得焦点的按钮保留标准键盘行为。用 Tab 移到速度盘后，可以用方向键调速。

## 音频与测试

节拍时钟和发声运行在 **AudioWorklet 音频线程**中。非整数采样间隔保留余数，避免长期播放时误差累积；界面根据音频输出时间更新指示。暂停会清除鼓声尾音，切换拍号、分拍或鼓组时在小节边界衔接。

```sh
npm test                 # 16 项音频与时钟测试
npm run test:desktop     # 在 Windows / macOS 上检查真实窗口与音频输出
npm run test:packaged    # 检查已构建的应用
npm run format:check     # 代码格式
```

桌面测试使用独立的临时资料目录，不修改日常练习设置。CI 通过静音输出通道检查真实音频图与时钟，不依赖 runner 上的扬声器。发布还会验证 Windows 安装 / 卸载、Mac DMG 挂载与拷贝安装，以及四种 ZIP 解压后的应用。更多说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开源许可

应用源码、原创图标和文档使用 [MIT License](LICENSE)。内置 Instrument Sans、Instrument Serif 字体分别遵循随文件附带的 SIL Open Font License 1.1；详情见 [第三方声明](THIRD_PARTY_NOTICES.md)。
