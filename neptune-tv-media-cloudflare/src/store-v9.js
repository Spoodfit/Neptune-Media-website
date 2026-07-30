import { StudioStore as LegacyStore } from './store-v8.js';
import { json } from './security.js';

export class StudioStore extends LegacyStore {
  async editorialContext(body) {
    const response = await super.editorialContext(body);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.occurrence?.occurrenceId) return json(result, response.status);

    const occurrenceDraft = this.readEditorialDraft('occurrence', result.occurrence.occurrenceId);
    if (!occurrenceDraft) return json(result, response.status);

    return json({
      ...result,
      editorial: occurrenceDraft,
    }, response.status);
  }
}
