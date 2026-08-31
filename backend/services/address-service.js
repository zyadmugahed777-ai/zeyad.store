/**
 * Zeyad For Business - Canonical Address Service
 * Single Source of Truth for Customer & Guest Addresses, Coordinate Validation,
 * Tenant Isolation, Default Flags, and Snapshot Resolution.
 * Refactored in Phase 1 Batch 5D to use Repository Layer (SqliteAddressRepo).
 */

const { getRepositories } = require('../repositories');

class AddressService {
  get repo() {
    return getRepositories().addresses;
  }

  get tx() {
    return getRepositories().tx;
  }

  /**
   * Validate and sanitize coordinates
   */
  validateCoordinates(lat, lng) {
    if (lat === undefined || lat === null || lng === undefined || lng === null || lat === '' || lng === '') {
      return { latitude: null, longitude: null, isValid: true };
    }
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (Number.isNaN(nLat) || Number.isNaN(nLng)) {
      return { latitude: null, longitude: null, isValid: false, error: 'الإحداثيات الجغرافية غير صحيحة' };
    }
    if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
      return { latitude: null, longitude: null, isValid: false, error: 'نطاق الإحداثيات الجغرافية غير صالح' };
    }
    return { latitude: Number(nLat.toFixed(7)), longitude: Number(nLng.toFixed(7)), isValid: true };
  }

  /**
   * Get addresses for customer or guest session
   */
  async getAddresses({ customerId = null, guestId = null }) {
    if (customerId) {
      return await this.repo.findByCustomer(customerId);
    }
    if (guestId) {
      return await this.repo.findByGuest(guestId);
    }
    return [];
  }

  /**
   * Get a single address, enforcing ownership.
   *
   * The old contract was "check ownership *if* an owner was supplied", which
   * quietly meant "return anybody's address when neither was" -- and the route
   * supplies neither for a caller with no session and no guest header. So
   * `GET /api/addresses/7` with no cookies at all returned address 7,
   * coordinates included.
   *
   * Ownership is now mandatory. A caller who cannot say who they are gets
   * nothing. `internal: true` is the single explicit escape hatch, for the
   * service's own post-write reads where ownership was established moments
   * earlier by the very call doing the writing.
   */
  async getAddressById(id, { customerId = null, guestId = null, internal = false } = {}) {
    const address = await this.repo.findById(id);
    if (!address) return null;

    if (internal) return address;

    if (customerId) {
      return Number(address.customer_id) === Number(customerId) ? address : null;
    }
    if (guestId) {
      return String(address.guest_id) === String(guestId) ? address : null;
    }

    return null;
  }

  /**
   * Create new address
   */
  async createAddress(data, { customerId = null, guestId = null } = {}) {
    // Ownership comes from the caller's context argument and never from the
    // payload. `data` is a request body: falling back to data.customerId let
    // an unauthenticated caller post {"customerId": 101, ...} and file an
    // address into customer 101's address book.
    const effectiveCustomerId = customerId;
    const effectiveGuestId = customerId ? null : guestId;

    const title = (data.title || 'عنوان التوصيل').trim();
    const country = (data.country || 'اليمن').trim();
    const province = (data.province || data.city || 'صنعاء').trim();
    const city = (data.city || data.province || 'صنعاء').trim();
    const district = (data.district || '').trim();
    const street = (data.street || '').trim();
    const addressLine = (data.address_line || data.addressDetail || data.address_detail || '').trim();
    const buildingInfo = (data.building_info || data.buildingInfo || '').trim();
    const notes = (data.notes || '').trim();

    if (!city) {
      throw new Error('يرجى تحديد المدينة أو المحافظة');
    }

    const coordCheck = this.validateCoordinates(data.latitude, data.longitude);
    if (!coordCheck.isValid) {
      throw new Error(coordCheck.error);
    }

    const isDefault = data.is_default ? 1 : 0;

    // Format comprehensive address
    let formattedAddress = (data.formatted_address || '').trim();
    if (!formattedAddress) {
      const parts = [country, province, city, district, street, addressLine, buildingInfo].filter(Boolean);
      formattedAddress = [...new Set(parts)].join(' - ');
    }

    const createdId = await this.tx.run(async (client) => {
      const { getRepositories: getRepos } = require('../repositories');
      const txRepos = getRepos(null, client);

      // If marked default, unset other defaults
      if (isDefault) {
        await txRepos.addresses.clearDefaults(effectiveCustomerId, effectiveGuestId);
      }

      return await txRepos.addresses.create({
        customer_id: effectiveCustomerId ? Number(effectiveCustomerId) : null,
        guest_id: effectiveCustomerId ? null : (effectiveGuestId ? String(effectiveGuestId) : null),
        title,
        country,
        province,
        city,
        district: district || null,
        street: street || null,
        address_line: addressLine || null,
        formatted_address: formattedAddress,
        building_info: buildingInfo || null,
        latitude: coordCheck.latitude,
        longitude: coordCheck.longitude,
        is_default: isDefault,
        notes: notes || null
      });
    });

    // Ownership was just established by this very insert.
    return await this.getAddressById(createdId, { internal: true });
  }

  /**
   * Update address with security boundary check
   */
  async updateAddress(id, data, { customerId = null, guestId = null } = {}) {
    // Same rule as createAddress: the payload does not get a vote on whose
    // address this is. Reading data.customerId here made the ownership check
    // below self-approving -- the attacker supplied both the id being edited
    // and the identity it was checked against.
    const existing = await this.getAddressById(id, { customerId, guestId });
    if (!existing) {
      throw new Error('العنوان غير موجود أو لا تملك صلاحية الوصول إليه');
    }

    const title = data.title !== undefined ? String(data.title).trim() : existing.title;
    const country = data.country !== undefined ? String(data.country).trim() : existing.country;
    const province = data.province !== undefined ? String(data.province).trim() : existing.province;
    const city = data.city !== undefined ? String(data.city).trim() : existing.city;
    const district = data.district !== undefined ? String(data.district).trim() : existing.district;
    const street = data.street !== undefined ? String(data.street).trim() : existing.street;
    const addressLine = data.address_line !== undefined ? String(data.address_line).trim() : (data.addressDetail !== undefined ? String(data.addressDetail).trim() : existing.address_line);
    const buildingInfo = data.building_info !== undefined ? String(data.building_info).trim() : (data.buildingInfo !== undefined ? String(data.buildingInfo).trim() : existing.building_info);
    const notes = data.notes !== undefined ? String(data.notes).trim() : existing.notes;

    let latitude = existing.latitude;
    let longitude = existing.longitude;
    if (data.latitude !== undefined || data.longitude !== undefined) {
      const coordCheck = this.validateCoordinates(data.latitude, data.longitude);
      if (!coordCheck.isValid) {
        throw new Error(coordCheck.error);
      }
      latitude = coordCheck.latitude;
      longitude = coordCheck.longitude;
    }

    let formattedAddress = (data.formatted_address || '').trim();
    if (!formattedAddress) {
      const parts = [country, province, city, district, street, addressLine, buildingInfo].filter(Boolean);
      formattedAddress = [...new Set(parts)].join(' - ');
    }

    const wasDefault = existing.is_default === true || existing.is_default === 1;
    const isDefault = data.is_default !== undefined ? (data.is_default ? 1 : 0) : (wasDefault ? 1 : 0);

    await this.tx.run(async (client) => {
      const { getRepositories: getRepos } = require('../repositories');
      const txRepos = getRepos(null, client);

      if (isDefault && !wasDefault) {
        await txRepos.addresses.clearDefaults(existing.customer_id, existing.guest_id);
      }

      await txRepos.addresses.update(id, {
        title,
        country,
        province,
        city,
        district: district || null,
        street: street || null,
        address_line: addressLine || null,
        formatted_address: formattedAddress,
        building_info: buildingInfo || null,
        latitude,
        longitude,
        is_default: isDefault,
        notes: notes || null
      });
    });

    // Ownership was verified at the top of this method.
    return await this.getAddressById(id, { internal: true });
  }

  /**
   * Delete address with security boundary check
   */
  async deleteAddress(id, { customerId = null, guestId = null } = {}) {
    const existing = await this.getAddressById(id, { customerId, guestId });
    if (!existing) {
      throw new Error('العنوان غير موجود أو لا تملك صلاحية حذفه');
    }

    await this.repo.delete(id);
    return { success: true, id };
  }

  /**
   * Set address as default
   */
  async setDefault(id, { customerId = null, guestId = null } = {}) {
    return await this.updateAddress(id, { is_default: true }, { customerId, guestId });
  }
}

const addressService = new AddressService();
module.exports = { AddressService, addressService };
