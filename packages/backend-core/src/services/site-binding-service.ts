import {
  BindSiteInput,
  SharedStyleContext
} from "@wfb/shared/contracts.js";
import { AppRepository } from "../repositories/app-repository.js";

export class SiteBindingService {
  constructor(private readonly repository: AppRepository) {}

  async bindSite(input: BindSiteInput) {
    return this.repository.upsertSiteBinding(input);
  }

  async getBinding(repoId: string, userId: string) {
    return this.repository.getSiteBinding(repoId, userId);
  }

  async saveSharedStyleContext(
    siteId: string,
    sharedStyleContext: SharedStyleContext
  ) {
    return this.repository.saveSharedStyleContext(siteId, sharedStyleContext);
  }
}
