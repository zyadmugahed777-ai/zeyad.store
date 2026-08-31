/**
 * Zeyad For Business - Engineering & Design Calculator Service
 * Authoritative estimation calculators for Solar Systems, Majalis, and Kitchens.
 * Eliminates 404 broken routes and provides instant smart estimations.
 * Delegates product lookup to SqliteProductRepo.
 */

const { currencyService } = require('./currency-service');
const { getRepositories } = require('../repositories');

class CalculatorService {
  constructor() {}

  async calculateSolar({ dailyConsumptionKwh = 10, backupHours = 8, systemType = 'hybrid', currency = 'SAR' }) {
    const repos = getRepositories();
    const consumption = Math.max(1, parseFloat(dailyConsumptionKwh) || 10);
    const backup = Math.max(2, parseFloat(backupHours) || 8);

    // Peak sun hours in Yemen ~ 5.5 hours
    const peakSunHours = 5.5;
    const requiredSolarKw = (consumption / peakSunHours) * 1.25; // 25% safety margin
    const panelWattage = 550;
    const panelsCount = Math.ceil((requiredSolarKw * 1000) / panelWattage);

    // Battery storage required in kWh
    const batteryCapacityKwh = (consumption * (backup / 24)) * 1.2;
    // Gel / Tubular / Lithium calculation: 48V system standard
    const batteryCount200Ah = Math.ceil((batteryCapacityKwh * 1000) / (48 * 200 * 0.8));

    // Inverter size
    const inverterKva = Math.max(3, Math.ceil(requiredSolarKw * 1.3));

    // Pricing benchmark in SAR
    const panelPriceSar = 110; // per 550W panel
    const batteryPriceSar = 260; // per 200Ah battery
    const inverterPriceSar = inverterKva * 350; // Inverter pricing
    const accessoriesAndInstallSar = 300;

    const estimatedTotalSar = (panelsCount * panelPriceSar) + (batteryCount200Ah * batteryPriceSar) + inverterPriceSar + accessoriesAndInstallSar;

    const targetCurrency = currencyService.normalizeCurrency(currency);
    const estimatedTotal = await currencyService.convertPrice(estimatedTotalSar, targetCurrency);

    // Fetch related products from solar department via repository
    const recommendedProducts = await repos.products.findSolarRecommendations(3);

    return {
      success: true,
      data: {
        system: {
          inverterKva: `${inverterKva} KVA`,
          panelsCount: `${panelsCount} ألواح (${panelWattage}W)`,
          batteryCount: `${batteryCount200Ah} بطاريات (200Ah)`,
          dailyProduction: `${Math.round(requiredSolarKw * peakSunHours * 10) / 10} كيلوواط/ساعة يومياً`,
          backupHours: `${backup} ساعات تشغيل ليلي`
        },
        estimated_price_sar: Math.round(estimatedTotalSar),
        estimated_price: estimatedTotal,
        currency: targetCurrency,
        formatted_price: currencyService.formatPrice(estimatedTotal, targetCurrency),
        recommendedProducts
      }
    };
  }

  /*
   * The majlis form on the storefront posts `length`, `width`, `type` and
   * `wood`; this method only ever read `lengthMeters`, `widthMeters`,
   * `fabricQuality` and `woodType`. Not one field matched, so every request
   * fell through to the defaults and the page returned the SAME estimate --
   * 3,332 SAR, "11.9 متر طولي", luxury/premium -- whatever the customer typed.
   * A 3x4 standard majlis and a 5x6 royal one were quoted identically.
   *
   * Both spellings are accepted now. The pricing formula below is untouched.
   */
  async calculateMajlis(input = {}) {
    /* The trailing values are the defaults this method already had, kept so a
       caller that sends nothing is priced exactly as it was before. */
    const lengthMeters = input.lengthMeters != null ? input.lengthMeters : (input.length != null ? input.length : 5);
    const widthMeters = input.widthMeters != null ? input.widthMeters : (input.width != null ? input.width : 4);
    const fabricQuality = input.fabricQuality || input.type || 'luxury';
    const woodType = input.woodType || input.wood || 'premium';
    const currency = input.currency || 'SAR';

    const length = Math.max(2, parseFloat(lengthMeters) || 5);
    const width = Math.max(2, parseFloat(widthMeters) || 4);

    // Total perimeter for U-shape or L-shape seating
    const totalRunningMeters = Math.max(4, Math.round(((length * 2) + width) * 0.85 * 10) / 10);
    const seatsCount = Math.round(totalRunningMeters / 0.75);

    // Rate per running meter in SAR
    let baseRatePerMeterSar = 180;
    if (fabricQuality === 'luxury') baseRatePerMeterSar += 60;
    if (fabricQuality === 'royal') baseRatePerMeterSar += 120;
    if (woodType === 'premium') baseRatePerMeterSar += 40;

    const estimatedTotalSar = totalRunningMeters * baseRatePerMeterSar;
    const targetCurrency = currencyService.normalizeCurrency(currency);
    const estimatedTotal = await currencyService.convertPrice(estimatedTotalSar, targetCurrency);

    return {
      success: true,
      data: {
        dimensions: {
          runningMeters: `${totalRunningMeters} متر طولي`,
          capacity: `${seatsCount} أشخاص تقريباً`,
          fabricQuality,
          woodType
        },
        estimated_price_sar: Math.round(estimatedTotalSar),
        estimated_price: estimatedTotal,
        currency: targetCurrency,
        formatted_price: currencyService.formatPrice(estimatedTotal, targetCurrency)
      }
    };
  }

  async calculateKitchen({ lengthMeters = 4, material = 'aluminum', currency = 'SAR' }) {
    const length = Math.max(2, parseFloat(lengthMeters) || 4);

    // Rate per meter in SAR
    let ratePerMeterSar = 450; // standard aluminum
    if (material === 'aluminum_luxury') ratePerMeterSar = 650;
    if (material === 'wood_mdf') ratePerMeterSar = 750;
    if (material === 'solid_wood') ratePerMeterSar = 1100;

    const estimatedTotalSar = length * ratePerMeterSar;
    const targetCurrency = currencyService.normalizeCurrency(currency);
    const estimatedTotal = await currencyService.convertPrice(estimatedTotalSar, targetCurrency);

    return {
      success: true,
      data: {
        dimensions: {
          runningMeters: `${length} متر طولي`,
          material
        },
        estimated_price_sar: Math.round(estimatedTotalSar),
        estimated_price: estimatedTotal,
        currency: targetCurrency,
        formatted_price: currencyService.formatPrice(estimatedTotal, targetCurrency)
      }
    };
  }
}

const calculatorServiceInstance = new CalculatorService();

module.exports = {
  CalculatorService,
  calculatorService: calculatorServiceInstance
};
