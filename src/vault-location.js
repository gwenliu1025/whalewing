import path from 'node:path';
import { lstatSync, readdirSync } from 'node:fs';

function hasData(root) {
  try {
    const info = lstatSync(root);
    // 不完整目录、文件或链接仍是待核对材料；由 Vault 拒收，不能借默认值变化绕开。
    return !info.isDirectory() || readdirSync(root).length > 0;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

/** Electron 的 Node 子进程沿用桌面可执行文件；普通 CLI 不写 Node 安装目录。 */
export function vaultLocation(configRoot, dshHome, runtime = process) {
  if (configRoot) return { root: configRoot };
  const legacy = path.join(dshHome, 'whalewing-vault');
  const desktop = runtime.platform === 'win32' && runtime.versions.electron && runtime.env.ELECTRON_RUN_AS_NODE === '1';
  if (!desktop) return { root: legacy };
  const installation = path.dirname(runtime.execPath);
  const root = path.join(path.dirname(installation), 'whalewing-vault');
  const installedLegacy = path.join(installation, 'whalewing-vault');
  // 保持原有 DSH_HOME 优先级；有旧材料时只提示迁移，显式配置才切换到新库。
  if (hasData(legacy)) {
    if (root === legacy) return { root };
    return { root: legacy, notice: '继续使用原有知识库，不自动切换或合并。新桌面默认位于 DSH 安装目录的同级 whalewing-vault；现有库若在安装目录内，卸载存在删除风险。迁移前先保留并核对原件，再显式设置 vaultRoot。' };
  }
  if (root !== installedLegacy && hasData(installedLegacy)) return { root: installedLegacy, notice: '继续使用安装目录内的原有知识库；卸载 DSH 存在删除该库的风险。请先将完整知识库保留并核对到安装目录同级的 whalewing-vault，再显式设置 vaultRoot；此处不自动搬迁、切换或合并。' };
  return { root };
}
