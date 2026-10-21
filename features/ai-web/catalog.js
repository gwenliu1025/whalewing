import { aiWebIcons } from '../../src/utilities/ai-web-icons.js';

/** 只持有经核验的官方地址；登录、额度与网页内容均由厂商和宿主浏览器持有。 */
export const aiWebEntries = Object.freeze([
  { id: 'deepseek', name: 'DeepSeek', provider: '深度求索', url: 'https://chat.deepseek.com/', description: '问答、写作与代码交流', keywords: '深度求索 代码' },
  { id: 'doubao', name: '豆包', provider: '字节跳动', url: 'https://www.doubao.com/chat/', description: '日常问答与内容创作', keywords: 'doubao 字节' },
  { id: 'kimi', name: 'Kimi', provider: '月之暗面', url: 'https://www.kimi.com/', description: '阅读资料与整理思路', keywords: '月之暗面 kimi' },
  { id: 'qianwen', name: '千问', provider: '阿里巴巴', url: 'https://www.qianwen.com/', description: '通用问答与办公辅助', keywords: '通义 qwen 千问 阿里' },
  { id: 'yuanbao', name: '腾讯元宝', provider: '腾讯', url: 'https://yuanbao.tencent.com/', description: '提问、搜索与资料阅读', keywords: '腾讯 yuanbao' },
  { id: 'qingyan', name: '智谱清言', provider: '智谱', url: 'https://www.chatglm.cn/', description: '通用问答与内容整理', keywords: '清华 智谱 glm zhipu' },
  { id: 'wenxin', name: '文心助手', provider: '百度', url: 'https://wenxin.baidu.com/', description: '工作与学习问答', keywords: '百度 文心一言' },
  { id: 'chatgpt', name: 'ChatGPT', provider: 'OpenAI', url: 'https://chatgpt.com/', description: '问答、写作与资料分析', keywords: 'openai gpt' },
  { id: 'gemini', name: 'Gemini', provider: 'Google', url: 'https://gemini.google.com/', description: '通用问答与创意交流', keywords: 'google 谷歌' },
  { id: 'claude', name: 'Claude', provider: 'Anthropic', url: 'https://claude.ai/', description: '写作、分析与代码交流', keywords: 'anthropic claude' },
].map(entry => Object.freeze({ ...entry, avatar: aiWebIcons[entry.id].data, builtin: true, revision: 0 })));
