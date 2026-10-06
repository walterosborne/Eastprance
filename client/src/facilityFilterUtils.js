const FACILITY_GROUP_PREFIX = '__qmi_facility_group__:';
const FACILITY_ORIGINAL_PREFIX = '__qmi_facility_original__:';

function normalizeComparable(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function makeFacilityGroupToken(group) {
  return `${FACILITY_GROUP_PREFIX}${String(group ?? '').trim()}`;
}

export function makeFacilityOriginalToken(original) {
  return `${FACILITY_ORIGINAL_PREFIX}${String(original ?? '').trim()}`;
}

export function parseFacilityFilterToken(value) {
  const text = String(value ?? '').trim();

  if (text.startsWith(FACILITY_GROUP_PREFIX)) {
    return {
      type: 'group',
      label: text.slice(FACILITY_GROUP_PREFIX.length)
    };
  }

  if (text.startsWith(FACILITY_ORIGINAL_PREFIX)) {
    return {
      type: 'original',
      label: text.slice(FACILITY_ORIGINAL_PREFIX.length)
    };
  }

  return {
    type: 'legacy',
    label: text
  };
}

export function isFacilityFilterToken(value) {
  const text = String(value ?? '').trim();
  return text.startsWith(FACILITY_GROUP_PREFIX) || text.startsWith(FACILITY_ORIGINAL_PREFIX);
}

export function facilityFilterMatches(selectedValue, groupValue, originalValue) {
  const selection = parseFacilityFilterToken(selectedValue);
  const normalizedSelection = normalizeComparable(selection.label);
  const normalizedGroup = normalizeComparable(groupValue);
  const normalizedOriginal = normalizeComparable(originalValue);

  if (!normalizedSelection) {
    return false;
  }

  if (selection.type === 'group') {
    return normalizedSelection === normalizedGroup;
  }

  if (selection.type === 'original') {
    return normalizedSelection === normalizedOriginal;
  }

  // Backward-compatible behavior for presets saved before the hierarchical filter.
  return normalizedSelection === normalizedGroup || normalizedSelection === normalizedOriginal;
}
