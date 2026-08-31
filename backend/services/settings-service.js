/**
 * Zeyad For Business - Settings Service
 * Canonical Settings Service with legacy compatibility mapping.
 * Eliminates duplicate/divergent settings between Admin and Public.
 * 
 * Uses Settings Repository for data access.
 */

const { getRepositories } = require('../repositories');

const CANONICAL_ALIASES = {
  // Canonical -> [Legacy Aliases]
  site_name: ['store_name_ar', 'store_name_en'],
  contact_phone: ['support_phone'],
  contact_whatsapp: ['whatsapp_number'],
  contact_email: ['support_email'],
  default_currency: ['currency'],
  exchange_rate: ['exchange_rate_sar_yer']
};

// Reverse map: Alias -> Canonical
const ALIAS_TO_CANONICAL = {};
Object.entries(CANONICAL_ALIASES).forEach(([canonical, aliases]) => {
  aliases.forEach(alias => {
    ALIAS_TO_CANONICAL[alias] = canonical;
  });
});

class SettingsService {
  constructor(repo) {
    this._repo = repo || null;
  }

  get repo() {
    return this._repo || getRepositories().settings;
  }

  resolveKey(key) {
    return ALIAS_TO_CANONICAL[key] || key;
  }

  async get(key, defaultValue = '') {
    const canonical = this.resolveKey(key);
    const aliases = CANONICAL_ALIASES[canonical] || [];
    const searchKeys = [canonical, ...aliases];

    const rows = (await this.repo.findByKeys(searchKeys)) || [];
    return this._extractValue(rows, canonical, defaultValue);
  }

  _extractValue(rows, canonical, defaultValue) {
    if (!rows || rows.length === 0) return defaultValue;

    // Prefer canonical key if found and not empty
    const canonicalRow = rows.find(r => r.key === canonical && r.value !== null && r.value !== '');
    if (canonicalRow) return canonicalRow.value;

    // Fallback to first non-empty alias
    const aliasRow = rows.find(r => r.value !== null && r.value !== '');
    if (aliasRow) return aliasRow.value;

    return rows[0].value !== null ? rows[0].value : defaultValue;
  }

  async getNumber(key, defaultValue = 0) {
    const val = await this.get(key, defaultValue);
    const num = Number(val);
    return isNaN(num) ? defaultValue : num;
  }

  async getBoolean(key, defaultValue = false) {
    const val = await this.get(key, defaultValue);
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') {
      const s = val.toLowerCase().trim();
      return s === 'true' || s === '1' || s === 'yes';
    }
    return defaultValue;
  }

  async getJSON(key, defaultValue = null) {
    const val = await this.get(key, null);
    if (!val) return defaultValue;
    try {
      return JSON.parse(val);
    } catch {
      return defaultValue;
    }
  }

  async getAll() {
    const rows = (await this.repo.findAll()) || [];
    return this._formatSettings(rows);
  }

  _formatSettings(rows) {
    const result = {};
    
    rows.forEach(r => {
      result[r.key] = r.value || '';
    });

    // Mirror canonical values to legacy aliases to guarantee consistency
    Object.entries(CANONICAL_ALIASES).forEach(([canonical, aliases]) => {
      const val = result[canonical] || '';
      aliases.forEach(alias => {
        if (!result[alias] || result[canonical]) {
          result[alias] = val;
        }
      });
    });

    return result;
  }

  async set(key, value, type = 'string', groupName = 'general') {
    const canonical = this.resolveKey(key);
    const aliases = CANONICAL_ALIASES[canonical] || [];
    const allKeysToUpdate = [canonical, ...aliases];

    const strValue = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');

    const entries = allKeysToUpdate.map(k => ({
      key: k,
      value: strValue,
      type,
      group_name: groupName
    }));

    await this.repo.bulkUpsert(entries);
    return true;
  }

  async setMany(settingsObj, groupName = 'general') {
    const entries = [];
    Object.entries(settingsObj).forEach(([k, v]) => {
      const canonical = this.resolveKey(k);
      const aliases = CANONICAL_ALIASES[canonical] || [];
      const allKeys = [canonical, ...aliases];
      const strValue = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
      const type = typeof v === 'number' ? 'number' : 'string';

      allKeys.forEach(keyName => {
        entries.push({
          key: keyName,
          value: strValue,
          type,
          group_name: groupName
        });
      });
    });

    await this.repo.bulkUpsert(entries);
    return true;
  }
}

const settingsServiceInstance = new SettingsService();

module.exports = {
  SettingsService,
  settingsService: settingsServiceInstance
};
