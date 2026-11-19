function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function containsAny(value, terms) {
  return terms.some((term) => value.includes(term));
}

const FACILITY_CATEGORIES = [
  'leased land and buildings',
  'utilities',
  'enterprise facility services',
  'facility repair & maint',
  'facility repair and maint',
  'facility purchased serv',
  'facility purchased service',
  'facility moa net',
  'allocations-occupancy'
];

const NON_FACILITY_CATEGORY_TERMS = [
  'settlement',
  'group insurance',
  'payroll taxes',
  'savings incentive',
  'incentive-',
  'pension',
  'retirement plan',
  'post retirement',
  'recruit/reloc/moving',
  'pto-',
  'travel',
  'tuition reimbursement',
  'computer hardware',
  'computer software',
  'legal services',
  'allocations-information services',
  'allocations-sector_hq',
  'allocations-sector hq',
  'allocations-service center',
  'allocations-other internal',
  'allocations-other external',
  'allocations-corporate',
  'allocations-state tax',
  'allocations-sector_ncta',
  'allocations-sector ncta',
  'excess compensation'
];

export function classifyFacilityCost(row) {
  const category = normalize(row.level3Category);
  const description = normalize(row.costElementDescription);

  if (FACILITY_CATEGORIES.includes(category)) {
    return {
      facilityStatus: 'Facility',
      facilityReason: `Level 3 category: ${row.level3Category}`
    };
  }

  if (containsAny(category, NON_FACILITY_CATEGORY_TERMS)) {
    return {
      facilityStatus: 'Not Facility',
      facilityReason: `Level 3 category: ${row.level3Category}`
    };
  }

  if (category === 'deprec in-service') {
    if (containsAny(description, ['facilit', 'leasehold', 'lh improve'])) {
      return {
        facilityStatus: 'Facility',
        facilityReason: `Facility-related depreciation description: ${row.costElementDescription}`
      };
    }

    if (containsAny(description, ['mach', 'equip'])) {
      return {
        facilityStatus: 'Not Facility',
        facilityReason: `Equipment depreciation description: ${row.costElementDescription}`
      };
    }

    return {
      facilityStatus: 'Needs Review',
      facilityReason: 'Depreciation category is mixed.'
    };
  }

  if (category === 'taxes and insurance') {
    if (containsAny(description, ['franchise'])) {
      return {
        facilityStatus: 'Not Facility',
        facilityReason: `Non-facility tax description: ${row.costElementDescription}`
      };
    }

    if (containsAny(description, ['property', 'real estate', 'bldg', 'building'])) {
      return {
        facilityStatus: 'Facility',
        facilityReason: `Property-related tax/insurance description: ${row.costElementDescription}`
      };
    }

    return {
      facilityStatus: 'Needs Review',
      facilityReason: 'Taxes and Insurance is a mixed category.'
    };
  }

  if (category === 'other miscellaneous overhead') {
    if (containsAny(description, ['subcontract', 'subcontr'])) {
      return {
        facilityStatus: 'Not Facility',
        facilityReason: `Labor/subcontract description: ${row.costElementDescription}`
      };
    }

    return {
      facilityStatus: 'Needs Review',
      facilityReason: 'Other Miscellaneous Overhead is a mixed category.'
    };
  }

  return {
    facilityStatus: 'Needs Review',
    facilityReason: 'No conservative facility rule matched.'
  };
}
