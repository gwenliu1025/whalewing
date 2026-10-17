import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inspectArchive, adaptArchive } from '../host-adapter/archive.mjs';
import { VERSION } from '../host-adapter/adapter.mjs';
import { install, restore, status, InstallError, EXE, defaultHome } from './core.mjs';

// 由 DSH 自带的 Electron 以 Node 模式运行（同事电脑不需要另装 Node）；直接读写 app.asar 的字节，不经过 Electron 的 asar 虚拟文件系统。
process.noAsar = true;
const here = path.dirname(fileURLToPath(import.meta.url));
const adapter = {
  version: VERSION,
  adaptArchive,
  readVersion: bytes => JSON.parse(Buffer.from(inspectArchive(bytes).entries.get('dsh/package.json').bytes).toString('utf8')).version,
};

function options(argv) {
  const [command, ...rest] = argv, result = { command };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, '');
    if (!['dsh', 'home', 'profile', 'tarball'].includes(key) || rest[i + 1] === undefined) throw new InstallError('USAGE', `不认识的参数：${rest[i]}`);
    result[key] = rest[i + 1];
  }
  // 借 DSH 自己的程序运行时，程序所在目录就是安装目录。
  result.dsh ??= path.basename(process.execPath).toLowerCase() === EXE.toLowerCase() ? path.dirname(process.execPath) : undefined;
  if (!result.dsh) throw new InstallError('USAGE', '请用 --dsh 指定 DeepSeek Harness 的安装目录');
  result.home ??= defaultHome();
  return result;
}

const say = line => process.stdout.write(`  ${line}\n`);

async function main() {
  const opts = options(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(path.join(here, 'manifest.json'), 'utf8'));
  opts.tarball ??= path.join(here, manifest.tarball);
  say(`鲸翼 ${manifest.pluginVersion}（适配 DeepSeek Harness ${VERSION}）`);
  say(`DSH 安装目录：${opts.dsh}`);
  say(`DSH 数据目录：${opts.home}`);
  say('');
  if (opts.command === 'install') {
    const { where } = await install({ ...opts, pluginVersion: manifest.pluginVersion, adapter, log: say });
    say('');
    say('安装完成。现在打开 DeepSeek Harness，左侧会出现“鲸翼”。');
    say(`如需撤回，运行同目录下的“还原鲸翼”。安装记录：${where.state}`);
  } else if (opts.command === 'restore') {
    const { report } = await restore({ ...opts, log: say });
    say('');
    say(report.host === 'changed' ? '还原完成（程序文件未动，见上方说明）。' : '还原完成，DeepSeek Harness 已回到安装前的状态。');
    say('个人知识库和插件数据没有删除；不再需要时可以手动删掉知识库目录。');
  } else if (opts.command === 'status') {
    const result = await status({ ...opts, adapter });
    say(`DSH 版本：${result.version ?? '未找到'}；程序状态：${{ adapted: '已适配', original: '原版', unknown: '无法识别', missing: '未找到' }[result.host]}`);
    say(`鲸翼：${result.registered && result.installed ? `已安装 ${result.installed}` : '未安装'}${result.state ? `（安装器记录 ${result.state.pluginVersion}）` : ''}`);
  } else throw new InstallError('USAGE', '用法：installer.mjs install|restore|status [--dsh 目录] [--home 目录]');
}

main().catch(error => {
  process.stdout.write(`\n  没有完成：${error instanceof InstallError ? error.message : `意外错误 ${error?.stack ?? error}`}\n`);
  process.exitCode = 1;
});
