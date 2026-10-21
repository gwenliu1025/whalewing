# 文本预览：二级插件起步模板

这是独立 DSH 开发示例，提供文本预览、弹窗、刷新、离页提示及两秒可取消操作。没有磁盘数据、定时任务、网络或模型请求，不随鲸翼自动安装。关闭后临时输入清空。

接口与安装、卸载、源码删除的完整规则只在鲸翼包根的 [EXTENDING.md](../../EXTENDING.md)。复制本目录到独立项目后，从所配套的 `dsh-whalewing` 安装包根目录读取同名文件，或取得该版本的完整开源源码；不要把当前开发主线当作已封版兼容说明。

## 开发

1. 复制整个目录到自己的源码仓库，包括 `src/`、`scripts/`、`tests/`、LICENSE。
2. 在 `package.json` 修改 `name` 与 `whalewingExtension.id`。Host、Client、原生行 id 和 ModuleLoader id 从这两项派生；构建后无需再手改四处身份。
3. 修改描述、`locale/`、图标及 `src/client.js` 的功能界面。功能标题用自己的名字，保留所用代码的许可。
4. 在本目录运行：

```sh
npm install
npm run build
npm test
```

构建更新 `client.js` 与 `cordis.patch.yml`，不手改生成物。React external，由 DSH 提供；模板没有额外 Host 运行依赖。`npm test` 独立检查身份一致、生成物、缺鲸翼时不阻塞启动及本地任务取消，不依赖鲸翼内部测试或源码。

## 运行与验收

- 使用独立测试 profile，通过 DSH「插件 → 添加插件」填 `link:<此目录绝对路径>`，安装后启用。预置产物只适用于未改身份的原样模板；修改源码后先构建。
- 输入文字并预览；运行本地演示并停止等待；切换页签保留临时输入。然后依 [EXTENDING.md](../../EXTENDING.md) 核对缺依赖、开关、重开、卸载及迟到结果清理。
- 测试不等于原生安装和页面验收。卸载是原生操作，删除源码前还要解除所有已知 profile 的 `link:` 使用关系。

支持的 DSH 版本由本包 `engines.dsh` 指定。当前 `private: true`、`0.0.0` 是开发起点；鲸翼 v1 尚待首个封版确定包版本范围，暂不填写 `peerDependencies.dsh-whalewing`，不以猜测范围代替验证。
