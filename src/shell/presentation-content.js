import * as shared from './common-presentation.js';
import * as experts from '../../features/experts/client-presentation.js';
import * as assistant from '../../features/assistant/client-presentation.js';
import * as knowledge from '../../features/knowledge/client-presentation.js';
import * as skills from '../../features/skills/client-presentation.js';
import * as automation from '../../features/automation/client-presentation.js';
import * as cards from '../../features/cards/client-presentation.js';
import * as ai_web from '../../features/ai-web/client-presentation.js';
import * as model_world from '../../features/model-world/client-presentation.js';
import { explainError as explainCommonError } from '../error-guide.js';

const domains = [experts, assistant, knowledge, skills, automation, cards, ai_web, model_world];
/** 组合层拒收同名词条，不解释领域业务。 */
const combine = language => {
  const result = {};
  for (const content of [shared, ...domains]) for (const [key, value] of Object.entries(content[language] ?? {})) {
    if (Object.hasOwn(result, key)) throw new Error(`重复界面词条：${key}`);
    result[key] = value;
  }
  return result;
};
export const zh = combine('zh');
export const en = { ...zh, ...combine('en') };
export const css = [
  shared.styles[0],
  automation.styles[0],
  shared.styles[1],
  assistant.styles[0],
  shared.styles[2],
  assistant.styles[1],
  shared.styles[3],
  assistant.styles[2],
  shared.styles[4],
  knowledge.styles[0],
  assistant.styles[3],
  shared.styles[5],
  knowledge.styles[1],
  shared.styles[6],
  knowledge.styles[2],
  shared.styles[7],
  knowledge.styles[3],
  shared.styles[8],
  experts.styles[0],
  shared.styles[9],
  experts.styles[1],
  shared.styles[10],
  knowledge.styles[4],
  shared.styles[11],
  knowledge.styles[5],
  shared.styles[12],
  knowledge.styles[6],
  assistant.styles[4],
  shared.styles[13],
  assistant.styles[5],
  shared.styles[14],
  experts.styles[2],
  assistant.styles[6],
  shared.styles[15],
  assistant.styles[7],
  knowledge.styles[7],
  shared.styles[16],
  experts.styles[3],
  shared.styles[17],
  knowledge.styles[8],
  shared.styles[18],
  knowledge.styles[9],
  shared.styles[19],
  knowledge.styles[10],
  shared.styles[20],
  knowledge.styles[11],
  assistant.styles[8],
  knowledge.styles[12],
  shared.styles[21],
  knowledge.styles[13],
  assistant.styles[9],
  skills.styles[0],
  shared.styles[22],
  assistant.styles[10],
  knowledge.styles[14],
  shared.styles[23],
  knowledge.styles[15],
  shared.styles[24],
  cards.styles[0],
  shared.styles[25],
  automation.styles[1],
  cards.styles[1],
  automation.styles[2],
  shared.styles[26],
  automation.styles[3],
  shared.styles[27],
  assistant.styles[11],
  skills.styles[1],
  cards.styles[2],
  shared.styles[28],
  cards.styles[3],
  shared.styles[29],
  cards.styles[4],
  shared.styles[30],
  cards.styles[5],
  shared.styles[31],
  assistant.styles[12],
  cards.styles[6],
  shared.styles[32],
  cards.styles[7],
  automation.styles[4],
  ai_web.styles[0],
  shared.styles[33]
].join('');
export const explainError = (code, message) => explainCommonError(code, message, domains);
