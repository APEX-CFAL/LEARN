/* Section S — housekeeping, not a study feature. */
import { def } from '../../core/registry.js';

def('system.keyTest', { title: 'Check that an API key works', tokens: 5, parse: 'text', temperature: 0,
  build() { return { system: '', user: 'Reply with only: OK' }; } });
