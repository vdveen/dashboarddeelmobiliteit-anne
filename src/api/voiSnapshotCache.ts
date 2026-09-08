import { VoiFeatureCollection } from './voiSnapshots';

/** Completed frames only. In-flight requests remain owned by their caller. */
export class VoiSnapshotCache {
  private entries = new Map<string, { data: VoiFeatureCollection; bytes: number }>();
  constructor(private maxFrames = 4, private maxBytes = 20 * 1024 * 1024) {}
  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.data;
  }
  has(key: string) { return this.entries.has(key); }
  put(key: string, data: VoiFeatureCollection, bytes: number) {
    this.entries.delete(key);
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.maxBytes) return;
    this.entries.set(key, { data, bytes });
    while (this.entries.size > this.maxFrames || Array.from(this.entries.values()).reduce((n, e) => n + e.bytes, 0) > this.maxBytes) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }
  clear() { this.entries.clear(); }
}
