import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readTgz } from './tar.mjs';

/**
 * 同事电脑上的一键安装与还原：只动 DSH 的 app.asar、desktop profile 的清单与其中的插件目录，以及安装器自己的目录。
 * 插件以 npm 包（依赖已打进包内）解压到 profile 的 node_modules 并以 file: 登记——DSH 只给 profile 内的包路由宿主依赖，
 * 以后 DSH 自己运行 pnpm 时也能从同一个包离线重建。
 */
export const PLUGIN = 'dsh-whalewing';
export const SCHEDULE = '@deepseek-ai/dsh-experimental-schedule-bundle';
export const EXE = 'DeepSeek Harness.exe';
const STATE_SCHEMA = 2;

export class InstallError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new InstallError(code, message); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async target => Boolean(await fs.lstat(target).catch(() => null));
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const slash = value => value.split(path.sep).join('/');

/** 所有路径集中在这里推导；安装器自己的文件都在 DSH 数据目录下的 whalewing。 */
export function locations({ dsh, home = defaultHome(), profile = 'desktop' }) {
  const profileDir = path.join(home, 'profiles', profile), root = path.join(home, 'whalewing');
  return {
    dsh, home, profileDir, root,
    exe: path.join(dsh, EXE), asar: path.join(dsh, 'resources', 'app.asar'),
    manifest: path.join(profileDir, 'package.json'),
    pluginDir: path.join(profileDir, 'node_modules', ...PLUGIN.split('/')),
    backupDir: path.join(root, 'backup'), hostBackup: path.join(root, 'backup', 'app.asar'),
    previousPlugin: path.join(root, 'backup', 'previous-plugin'), state: path.join(root, 'install-state.json'),
  };
}
export function defaultHome() { return process.env.DSH_HOME || path.join(os.homedir(), '.dsh'); }

/** 写入同目录临时文件、读回比对后改名替换，避免写到一半的文件留在原位。 */
async function writeAtomic(target, bytes) {
  const temp = `${target}.whalewing-${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, bytes);
    if (sha256(await fs.readFile(temp)) !== sha256(bytes)) fail('WRITE_VERIFY', `写入校验失败：${target}`);
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    if (error instanceof InstallError) throw error;
    if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) fail('LOCKED', `无法写入 ${target}：文件被占用或没有权限。请完全退出 DeepSeek Harness（包括右下角托盘图标）后重试；如果 DSH 装在 Program Files 下，请右键“以管理员身份运行”。`);
    throw error;
  }
  if (sha256(await fs.readFile(target)) !== sha256(bytes)) fail('WRITE_VERIFY', `写入后读回不一致：${target}`);
}

/** 列出正在运行、且属于这个安装目录的 DSH 进程（安装器自己借用 DSH 运行，需排除自身）。 */
export function runningDsh(dsh) {
  if (process.platform !== 'win32') return [];
  const command = `Get-CimInstance Win32_Process -Filter "Name='${EXE}'" | ForEach-Object { "$($_.ProcessId)\`t$($_.ExecutablePath)" }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map(line => line.split('\t')).filter(([pid, exe]) => pid && exe && Number(pid) !== process.pid && samePath(path.dirname(exe), dsh)).map(([pid]) => Number(pid));
}

async function readState(where) {
  const text = await fs.readFile(where.state, 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (text === null) return null;
  const state = JSON.parse(text);
  if (state.schema !== STATE_SCHEMA) fail('STATE', `安装记录格式不认识：${where.state}`);
  return state;
}
const writeState = (where, state) => writeAtomic(where.state, Buffer.from(JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + '\n'));

async function readManifest(where) {
  const text = await fs.readFile(where.manifest, 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (text === null) fail('NO_PROFILE', `没有找到 DSH 的配置（${where.manifest}）。请先打开一次 DeepSeek Harness，进入主界面后完全退出，再运行安装。`);
  try { return JSON.parse(text); }
  catch { fail('PROFILE_JSON', `DSH 配置文件不是合法 JSON：${where.manifest}。请先在 DSH 里修好配置或联系管理员。`); }
}
const writeManifest = (where, data) => writeAtomic(where.manifest, Buffer.from(JSON.stringify(data, null, 2) + '\n'));

async function preflight(where, { adapter, running }) {
  if (!await exists(where.exe) || !await exists(where.asar)) fail('NO_DSH', `${where.dsh} 不是 DeepSeek Harness 安装目录（缺少 ${EXE} 或 resources\\app.asar）。`);
  const pids = running(where.dsh);
  if (pids.length) fail('RUNNING', `DeepSeek Harness 还在运行（进程 ${pids.join('、')}）。请完全退出 DSH（包括右下角托盘图标）后再运行。`);
  const bytes = await fs.readFile(where.asar);
  let version;
  try { version = adapter.readVersion(bytes); } catch { fail('ASAR', 'DSH 程序包无法识别，可能已损坏或被其他工具改过。请重新安装 DeepSeek Harness 后再试。'); }
  if (version !== adapter.version) fail('VERSION', `这台电脑的 DeepSeek Harness 是 ${version}，本安装包只支持 ${adapter.version}。请改装 ${adapter.version} 版本后再运行；其他版本需要等待新的适配。`);
  return { bytes, version };
}

/** 把插件包解压到目标旁边的临时目录，校验包名后整体换入。 */
async function extractPlugin(entries, target) {
  const fresh = `${target}.whalewing-new`;
  await fs.rm(fresh, { recursive: true, force: true });
  for (const entry of entries) {
    const relative = entry.path.replace(/^package(\/|$)/, '');
    if (!relative) continue;
    const destination = path.join(fresh, ...relative.split('/'));
    if (entry.type === 'dir') await fs.mkdir(destination, { recursive: true });
    else { await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, entry.data); }
  }
  return fresh;
}

/** 安装或升级：可重复运行，已完成的步骤自动跳过。 */
export async function install({ dsh, home, profile, tarball, pluginVersion, adapter, running = runningDsh, log = () => {} }) {
  const where = locations({ dsh, home, profile });
  const packageBytes = await fs.readFile(tarball).catch(() => fail('PAYLOAD', `安装包不完整：缺少 ${tarball}。请重新解压整个安装包。`));
  let entries;
  try { entries = readTgz(packageBytes); } catch (error) { fail('PAYLOAD', `插件包无法读取（${error.message}）。请重新解压整个安装包。`); }
  const packageJson = entries.find(entry => entry.path === 'package/package.json');
  if (!packageJson || JSON.parse(packageJson.data.toString('utf8')).name !== PLUGIN) fail('PAYLOAD', '插件包内容不对，请重新下载安装包。');
  const { bytes, version } = await preflight(where, { adapter, running });
  const manifest = await readManifest(where);
  let adapted;
  try { adapted = adapter.adaptArchive(bytes); }
  catch { fail('ADAPT', `DSH ${version} 的程序文件和适配基线不一致（可能被其他插件或工具改过）。为安全起见没有做任何修改；请重新安装 DeepSeek Harness ${adapter.version} 后再试。`); }
  const state = await readState(where) ?? { schema: STATE_SCHEMA, installedAt: new Date().toISOString(), dsh: where.dsh, profileDir: where.profileDir, host: null, profile: null };
  state.pluginVersion = pluginVersion; state.dshVersion = version;
  await fs.mkdir(where.root, { recursive: true });

  // 1. 宿主适配：先备份原包并记录，再原子替换。
  const current = sha256(bytes), target = sha256(adapted);
  if (current === target) {
    state.host ??= { mode: 'already-adapted', adaptedSha256: target };
    log('宿主适配：已是适配版，跳过');
  } else {
    await fs.mkdir(where.backupDir, { recursive: true });
    const backup = await fs.readFile(where.hostBackup).catch(() => null);
    if (!backup || sha256(backup) !== current) await writeAtomic(where.hostBackup, bytes);
    state.host = { mode: 'adapted-by-installer', originalSha256: current, adaptedSha256: target, backup: path.relative(where.root, where.hostBackup) };
    await writeState(where, state);
    await writeAtomic(where.asar, adapted);
    log(`宿主适配：已备份原程序并写入适配版（${version}）`);
  }

  // 2. 插件包：留一份在安装器目录，作为 profile 清单里 file: 的来源。
  state.profile ??= { previousDependency: manifest.dependencies?.[PLUGIN] ?? null, hadDependencies: manifest.dependencies !== undefined, addedBundles: [], movedPrevious: null, previousLink: null, spec: null };
  const kept = path.join(where.root, path.basename(tarball));
  await writeAtomic(kept, packageBytes);

  // 3. 插件目录：首次安装时 profile 里原有的同名插件（目录挪进备份、链接记下目标）让位；之后的安装直接替换自己的版本。
  const fresh = await extractPlugin(entries, where.pluginDir);
  const existing = await fs.lstat(where.pluginDir).catch(() => null);
  const first = state.profile.spec === null;
  if (existing?.isSymbolicLink()) {
    if (first) { state.profile.previousLink = await fs.readlink(where.pluginDir); await writeState(where, state); }
    await fs.unlink(where.pluginDir);
  } else if (existing && first) {
    await fs.mkdir(where.backupDir, { recursive: true }); await fs.rm(where.previousPlugin, { recursive: true, force: true });
    await fs.rename(where.pluginDir, where.previousPlugin);
    state.profile.movedPrevious = path.relative(where.root, where.previousPlugin);
    await writeState(where, state);
  } else if (existing) await fs.rm(where.pluginDir, { recursive: true, force: true });
  await fs.rename(fresh, where.pluginDir);
  log(`插件文件：已安装到 ${where.pluginDir}`);

  // 4. profile 清单：登记插件与 bundle，只记录自己加的部分，还原时只撤回这些。
  const spec = `file:${slash(kept)}`;
  manifest.dependencies = { ...manifest.dependencies, [PLUGIN]: spec };
  manifest.dsh ??= {}; manifest.dsh.profile ??= {};
  const bundles = manifest.dsh.profile.bundles ??= [];
  if (!Array.isArray(bundles)) fail('PROFILE_JSON', `DSH 配置里的 bundles 不是列表：${where.manifest}`);
  if (!bundles.includes(PLUGIN)) {
    const at = bundles.indexOf(SCHEDULE);
    at >= 0 ? bundles.splice(at, 0, PLUGIN) : bundles.push(PLUGIN);
    if (!state.profile.addedBundles.includes(PLUGIN)) state.profile.addedBundles.push(PLUGIN);
  }
  if (!bundles.includes(SCHEDULE)) { bundles.push(SCHEDULE); if (!state.profile.addedBundles.includes(SCHEDULE)) state.profile.addedBundles.push(SCHEDULE); }
  state.profile.spec = spec;
  await writeState(where, state);
  await writeManifest(where, manifest);
  for (const name of await fs.readdir(where.root)) if (name.endsWith('.tgz') && name !== path.basename(kept)) await fs.rm(path.join(where.root, name), { force: true });
  log('DSH 配置：已登记鲸翼插件');
  return { where, state };
}

/** 一键还原：只撤回安装器做过的改动；DSH 已被升级或改动时不覆盖程序文件。知识库与插件数据保留。 */
export async function restore({ dsh, home, profile, running = runningDsh, log = () => {} }) {
  const where = locations({ dsh, home, profile });
  const state = await readState(where);
  if (!state) fail('NO_STATE', `没有找到鲸翼的安装记录（${where.state}），无需还原。`);
  const pids = running(where.dsh);
  if (pids.length) fail('RUNNING', `DeepSeek Harness 还在运行（进程 ${pids.join('、')}）。请完全退出 DSH（包括右下角托盘图标）后再运行。`);
  const report = { host: 'skipped', profile: 'unchanged', plugin: 'unchanged' };

  // 1. 宿主程序
  if (state.host?.mode === 'adapted-by-installer') {
    const current = await fs.readFile(where.asar).catch(() => null);
    const hash = current && sha256(current);
    if (hash === state.host.originalSha256) report.host = 'already-original';
    else if (hash === state.host.adaptedSha256) {
      const backup = await fs.readFile(path.join(where.root, state.host.backup)).catch(() => null);
      if (!backup || sha256(backup) !== state.host.originalSha256) fail('BACKUP', `原程序备份缺失或已损坏（${path.join(where.root, state.host.backup)}），没有改动程序文件。请重新安装 DeepSeek Harness 来恢复原程序。`);
      await writeAtomic(where.asar, backup);
      report.host = 'restored';
    } else report.host = 'changed';
  } else if (state.host?.mode === 'already-adapted') report.host = 'not-ours';
  log({ restored: '宿主程序：已恢复为原版', 'already-original': '宿主程序：已经是原版', changed: '宿主程序：DSH 已被升级或改动，为避免覆盖新版本，没有还原程序文件', 'not-ours': '宿主程序：安装前就已是适配版，没有原版备份，保持不变', skipped: '宿主程序：没有记录，保持不变' }[report.host]);

  // 2. profile 清单
  const manifestText = await fs.readFile(where.manifest, 'utf8').catch(() => null);
  if (manifestText && state.profile) {
    const manifest = JSON.parse(manifestText);
    if (manifest.dependencies?.[PLUGIN] === state.profile.spec) {
      if (state.profile.previousDependency) manifest.dependencies[PLUGIN] = state.profile.previousDependency;
      else delete manifest.dependencies[PLUGIN];
      if (state.profile.hadDependencies === false && Object.keys(manifest.dependencies).length === 0) delete manifest.dependencies;
    }
    const bundles = manifest.dsh?.profile?.bundles;
    if (Array.isArray(bundles)) manifest.dsh.profile.bundles = bundles.filter(bundle => !state.profile.addedBundles.includes(bundle));
    const next = JSON.stringify(manifest, null, 2) + '\n';
    if (next !== manifestText) { await writeManifest(where, manifest); report.profile = 'restored'; }
  }
  log(report.profile === 'restored' ? 'DSH 配置：已撤回鲸翼登记' : 'DSH 配置：无需改动');

  // 3. 插件目录：只删鲸翼自己的包；安装前原有的同名插件放回原处。
  const installed = await fs.lstat(where.pluginDir).catch(() => null);
  if (installed?.isSymbolicLink()) { await fs.unlink(where.pluginDir); report.plugin = 'removed'; }
  else if (installed) {
    const name = await fs.readFile(path.join(where.pluginDir, 'package.json'), 'utf8').then(text => JSON.parse(text).name).catch(() => null);
    if (name === PLUGIN) { await fs.rm(where.pluginDir, { recursive: true, force: true }); report.plugin = 'removed'; }
  }
  if (state.profile?.movedPrevious && !await exists(where.pluginDir)) { await fs.rename(path.join(where.root, state.profile.movedPrevious), where.pluginDir); report.plugin = 'previous-restored'; }
  if (state.profile?.previousLink && !await exists(where.pluginDir)) { await fs.symlink(state.profile.previousLink, where.pluginDir, 'junction'); report.plugin = 'previous-restored'; }
  log({ removed: '插件文件：已移除', 'previous-restored': '插件文件：已移除，并放回安装前原有的版本', unchanged: '插件文件：无需改动' }[report.plugin]);

  // 4. 安装器自己的目录：程序已还原（或本来就不是我们改的）就整体删除；程序被升级时保留备份与记录。
  if (report.host === 'changed') {
    for (const name of await fs.readdir(where.root)) if (name.endsWith('.tgz')) await fs.rm(path.join(where.root, name), { force: true });
    log(`保留了原程序备份与安装记录：${where.root}`);
  } else await fs.rm(where.root, { recursive: true, force: true });
  return { where, report };
}

/** 只读查看当前状态。 */
export async function status({ dsh, home, profile, adapter }) {
  const where = locations({ dsh, home, profile });
  const bytes = await fs.readFile(where.asar).catch(() => null);
  let version = null, host = 'missing';
  if (bytes) {
    try { version = adapter.readVersion(bytes); } catch { version = '无法识别'; }
    try { host = sha256(adapter.adaptArchive(bytes)) === sha256(bytes) ? 'adapted' : 'original'; } catch { host = 'unknown'; }
  }
  const state = await readState(where).catch(() => null);
  const manifest = await fs.readFile(where.manifest, 'utf8').then(JSON.parse).catch(() => null);
  const installed = await fs.readFile(path.join(where.pluginDir, 'package.json'), 'utf8').then(JSON.parse).catch(() => null);
  return { where, version, host, state, registered: Boolean(manifest?.dsh?.profile?.bundles?.includes?.(PLUGIN)), installed: installed?.name === PLUGIN ? installed.version : null };
}
