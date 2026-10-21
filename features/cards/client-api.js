import { newsContract } from './contract.js';
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createCardsClient(bridge, t, z, automation) {
    const { featureRemote, unwrap, failure } = bridge;
    const newsSchema = newsContract(z);
    const newsRequest = async (input, signal) => {
      const parsed = newsSchema.manage.parse(input);
      signal?.throwIfAborted();
      const result = newsSchema.result.safeParse(unwrap(await featureRemote('whalewingCards').manageNews(parsed, signal)));
      if (!result.success) throw failure(t('badReply'), 'bad_reply');
      const value = result.data;
      const expected = { home: 'learning', list: 'fields', save: 'field', remove: 'field', reports: 'reports', report: 'report' }[input.action];
      if (!Object.hasOwn(value, expected) || value.field && value.field.id !== input.id || value.report && (value.report.fieldId !== input.fieldId || value.report.cutoff !== input.cutoff) || input.action === 'reports' && value.reports?.some(report => report.fieldId !== input.fieldId)) throw failure(t('badReply'), 'bad_reply');
      return value;
    };
    const newsScheduleRequest = async (input, signal) => newsSchema.scheduleResult.parse(unwrap(await featureRemote('whalewingCards').manageSchedules(newsSchema.scheduleInput.parse(input), signal)));

  return {
    newsRequest, newsScheduleRequest, openAutomation: automation.openAutomation,
    scheduleAdapter: Object.freeze({ validate: input => newsSchema.scheduleInput.parse(input), submit: newsScheduleRequest }),
  };
}
