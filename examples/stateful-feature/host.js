import { Service } from '@deepseek-ai/cordis';
import { bindTypertRemote, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { packageName, featureId } from './identity.js';
import { contract, namespace } from './contract.js';
import { SavedTextStore } from './store.js';

export default class SavedText extends Service {
  static inject = ['whalewing', 'typert', 'storageDomain', 'profileContext'];
  constructor(ctx) {
    super(ctx, namespace);
    ctx.whalewing.features.register(ctx, { id: featureId, api: 1, package: packageName, tab: { keepAlive: true } });
    this.store = new SavedTextStore(ctx);
    this.typertRemote = bindTypertRemote(this, namespace, { namespace });
    ctx.typert.register(contract.host);
    ctx.effect(() => () => this.store.close());
  }
  async manage(raw, signal) {
    try { return await this.store.manage(raw, signal); }
    catch (error) { throw new RemoteError(error.code || error.name || 'ERROR', error.message, {}); }
  }
}
