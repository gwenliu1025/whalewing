
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createSkillsClient(bridge, t) {
    const { featureRemote, unwrap, failure } = bridge;
    const skillRequest = async (input, signal) => unwrap(await featureRemote('whalewingSkills').manageSkills(input, signal));
    const resolveSkillEdit = async (entry, signal) => {
      if (entry?.origin !== 'builtin' || !entry.editId) return entry;
      const target = (await skillRequest({ action: 'read', id: entry.editId }, signal)).entry;
      if (!target) return entry;
      if (target.origin !== 'override' || target.baseId !== entry.id || target.baseHash !== entry.hash) throw failure(t('skillOverrideConflict'), 'skill_origin_conflict');
      return target;
    };

  return {
    skillRequest, resolveSkillEdit,
  };
}
