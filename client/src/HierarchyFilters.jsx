import { useEffect, useMemo, useRef, useState } from 'react';
import {
  makeBusinessUnitChildToken,
  makeBusinessUnitDivisionToken,
  makeFacilityGroupToken,
  makeFacilityOriginalToken,
  parseBusinessUnitFilterToken,
  parseFacilityFilterToken
} from './hierarchyFilterUtils';
import './hierarchyFilter.css';

const FALLBACK_DIVISION_LABEL = 'Other / Unassigned';

function normalizeLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeLabel(value).toLowerCase();
}

function setIndeterminate(element, indeterminate) {
  if (element) {
    element.indeterminate = indeterminate;
  }
}

function HierarchyFilter({
  entries,
  value,
  onChange,
  allLabel,
  inputId,
  ariaLabel,
  menuAriaLabel,
  searchPlaceholder,
  searchAriaLabel,
  makeParentToken,
  makeChildToken,
  getTokenLabel,
  loading = false,
  warning = '',
  flat = false
}) {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [expandedParents, setExpandedParents] = useState(() => new Set());
  const selectedSet = useMemo(() => new Set(value), [value]);
  const normalizedSearch = normalizeKey(searchText);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const visibleEntries = useMemo(() => {
    if (!normalizedSearch) {
      return entries;
    }

    return entries
      .map((entry) => {
        const parentMatches = normalizeKey(entry.parent).includes(normalizedSearch);
        const matchingChildren = entry.children.filter((child) =>
          normalizeKey(child).includes(normalizedSearch)
        );

        if (!parentMatches && matchingChildren.length === 0) {
          return null;
        }

        return {
          ...entry,
          visibleChildren: parentMatches ? entry.children : matchingChildren
        };
      })
      .filter(Boolean);
  }, [entries, normalizedSearch]);

  const emitChange = (nextValues) => {
    onChange?.([...new Set(nextValues)]);
  };

  const toggleParent = (entry) => {
    const parentToken = makeParentToken(entry);
    const childTokens = entry.children.map((child) => makeChildToken(entry, child));
    const nextSet = new Set(value);

    if (nextSet.has(parentToken)) {
      nextSet.delete(parentToken);
    } else {
      childTokens.forEach((token) => nextSet.delete(token));
      nextSet.add(parentToken);
    }

    emitChange([...nextSet]);
  };

  const toggleChild = (entry, child) => {
    const parentToken = makeParentToken(entry);
    const childTokens = entry.children.map((candidateChild) =>
      makeChildToken(entry, candidateChild)
    );
    const childToken = makeChildToken(entry, child);
    const nextSet = new Set(value);

    if (nextSet.has(parentToken)) {
      nextSet.delete(parentToken);
      childTokens.forEach((token) => {
        if (token !== childToken) {
          nextSet.add(token);
        }
      });
      emitChange([...nextSet]);
      return;
    }

    if (nextSet.has(childToken)) {
      nextSet.delete(childToken);
    } else {
      nextSet.add(childToken);
    }

    const allChildrenSelected = childTokens.length > 0
      && childTokens.every((token) => nextSet.has(token));

    if (allChildrenSelected) {
      childTokens.forEach((token) => nextSet.delete(token));
      nextSet.add(parentToken);
    }

    emitChange([...nextSet]);
  };

  const summary = (() => {
    if (value.length === 0) {
      return allLabel;
    }

    if (value.length === 1) {
      return getTokenLabel(value[0]) || allLabel;
    }

    return `${value.length} selected`;
  })();

  return (
    <div className={`hierarchy-filter${flat ? ' hierarchy-filter-flat' : ''}`} ref={rootRef}>
      <div className="hierarchy-filter-control-wrap">
        <button
          id={inputId}
          type="button"
          className={`hierarchy-filter-control${isOpen ? ' hierarchy-filter-control-open' : ''}`}
          aria-haspopup="tree"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          onClick={() => setIsOpen((currentValue) => !currentValue)}
        >
          <span className={`hierarchy-filter-summary${value.length === 0 ? ' hierarchy-filter-summary-placeholder' : ''}`}>
            {summary}
          </span>
          <span className="hierarchy-filter-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false">
              <path d="M4 6.25 8 10l4-3.75" />
            </svg>
          </span>
        </button>
        {value.length > 0 ? (
          <button
            type="button"
            className="hierarchy-filter-clear"
            aria-label={`Clear ${ariaLabel.toLowerCase()}`}
            title="Clear filter"
            onClick={(event) => {
              event.stopPropagation();
              emitChange([]);
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="hierarchy-filter-menu" role="tree" aria-label={menuAriaLabel}>
          <div className="hierarchy-filter-search-wrap">
            <input
              type="search"
              className="hierarchy-filter-search"
              value={searchText}
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel}
              autoFocus
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <div className="hierarchy-filter-list">
            {visibleEntries.map((entry) => {
              const parentToken = makeParentToken(entry);
              const childTokens = entry.children.map((child) => makeChildToken(entry, child));
              const parentSelected = selectedSet.has(parentToken);
              const selectedChildCount = childTokens.filter((token) => selectedSet.has(token)).length;
              const parentIndeterminate = !parentSelected && selectedChildCount > 0;
              const expanded = expandedParents.has(entry.parent);
              const showChildren = normalizedSearch ? true : expanded;
              const childrenToRender = entry.visibleChildren ?? entry.children;

              return (
                <div
                  className="hierarchy-filter-group"
                  key={entry.key ?? entry.parent}
                  role="treeitem"
                  aria-expanded={entry.children.length > 0 ? showChildren : undefined}
                >
                  <div className="hierarchy-filter-group-row">
                    <button
                      type="button"
                      className={`hierarchy-filter-expand${entry.children.length === 0 ? ' hierarchy-filter-expand-empty' : ''}`}
                      aria-label={`${showChildren ? 'Collapse' : 'Expand'} ${entry.parent}`}
                      disabled={entry.children.length === 0}
                      onClick={() => {
                        setExpandedParents((currentParents) => {
                          const nextParents = new Set(currentParents);

                          if (nextParents.has(entry.parent)) {
                            nextParents.delete(entry.parent);
                          } else {
                            nextParents.add(entry.parent);
                          }

                          return nextParents;
                        });
                      }}
                    >
                      {entry.children.length > 0 ? (showChildren ? '−' : '+') : ''}
                    </button>
                    <label className="hierarchy-filter-group-label">
                      <input
                        type="checkbox"
                        checked={parentSelected}
                        ref={(element) => setIndeterminate(element, parentIndeterminate)}
                        onChange={() => toggleParent(entry)}
                      />
                      <span className="hierarchy-filter-group-name">{entry.parent}</span>
                      {entry.children.length > 0 ? (
                        <span className="hierarchy-filter-count">{entry.children.length}</span>
                      ) : null}
                    </label>
                  </div>

                  {showChildren && childrenToRender.length > 0 ? (
                    <div className="hierarchy-filter-children" role="group">
                      {childrenToRender.map((child) => {
                        const childToken = makeChildToken(entry, child);
                        const childSelected = parentSelected || selectedSet.has(childToken);

                        return (
                          <label className="hierarchy-filter-child" key={child} role="treeitem">
                            <input
                              type="checkbox"
                              checked={childSelected}
                              onChange={() => toggleChild(entry, child)}
                            />
                            <span>{child}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {!loading && visibleEntries.length === 0 ? (
              <div className="hierarchy-filter-empty">No matches</div>
            ) : null}
            {loading ? (
              <div className="hierarchy-filter-empty">Loading…</div>
            ) : null}
          </div>

          {warning ? (
            <div className="hierarchy-filter-warning">{warning}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function mergeFacilityGroups(mappedGroups, fallbackGroups) {
  const groupsByKey = new Map();

  (Array.isArray(mappedGroups) ? mappedGroups : []).forEach((entry) => {
    const group = normalizeLabel(entry?.group);

    if (!group) {
      return;
    }

    groupsByKey.set(normalizeKey(group), {
      parent: group,
      children: [...new Set(
        (Array.isArray(entry?.originals) ? entry.originals : [])
          .map(normalizeLabel)
          .filter(Boolean)
      )].sort((left, right) => left.localeCompare(right))
    });
  });

  (Array.isArray(fallbackGroups) ? fallbackGroups : []).forEach((groupValue) => {
    const group = normalizeLabel(groupValue);
    const key = normalizeKey(group);

    if (group && !groupsByKey.has(key)) {
      groupsByKey.set(key, { parent: group, children: [] });
    }
  });

  return [...groupsByKey.values()].sort((left, right) =>
    left.parent.localeCompare(right.parent)
  );
}

function canonicalizeFacilitySelections(values, entries) {
  const groupByKey = new Map(entries.map((entry) => [normalizeKey(entry.parent), entry.parent]));
  const originalByKey = new Map();

  entries.forEach((entry) => {
    entry.children.forEach((original) => {
      originalByKey.set(normalizeKey(original), original);
    });
  });

  return [...new Set((Array.isArray(values) ? values : []).map((value) => {
    const parsed = parseFacilityFilterToken(value);

    if (parsed.type === 'group') {
      return makeFacilityGroupToken(parsed.label);
    }

    if (parsed.type === 'original') {
      return makeFacilityOriginalToken(parsed.label);
    }

    const normalized = normalizeKey(parsed.label);

    if (groupByKey.has(normalized)) {
      return makeFacilityGroupToken(groupByKey.get(normalized));
    }

    if (originalByKey.has(normalized)) {
      return makeFacilityOriginalToken(originalByKey.get(normalized));
    }

    return makeFacilityGroupToken(parsed.label);
  }).filter(Boolean))];
}

export function FacilityHierarchyFilter({
  options = [],
  value = [],
  onChange,
  allLabel = 'All facilities',
  inputId = 'global-filter-facility'
}) {
  const [mappedGroups, setMappedGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isCancelled = false;

    async function loadGroupings() {
      try {
        const response = await fetch('/api/facility-groupings');

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();

        if (!isCancelled) {
          setMappedGroups(Array.isArray(payload?.groups) ? payload.groups : []);
          setLoadError('');
        }
      } catch (error) {
        if (!isCancelled) {
          setMappedGroups([]);
          setLoadError(error?.message || 'Unable to load facility groupings.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadGroupings();

    return () => {
      isCancelled = true;
    };
  }, []);

  const entries = useMemo(
    () => mergeFacilityGroups(mappedGroups, options),
    [mappedGroups, options]
  );
  const canonicalValue = useMemo(
    () => canonicalizeFacilitySelections(value, entries),
    [value, entries]
  );

  return (
    <HierarchyFilter
      entries={entries}
      value={canonicalValue}
      onChange={onChange}
      allLabel={allLabel}
      inputId={inputId}
      ariaLabel="Filter dashboard by Facility"
      menuAriaLabel="Facility groups"
      searchPlaceholder="Search groups or facilities"
      searchAriaLabel="Search facility groups"
      makeParentToken={(entry) => makeFacilityGroupToken(entry.parent)}
      makeChildToken={(_entry, child) => makeFacilityOriginalToken(child)}
      getTokenLabel={(token) => parseFacilityFilterToken(token).label}
      loading={loading}
      warning={loadError ? 'Group details unavailable; group-level filtering still works.' : ''}
    />
  );
}

function mergeBusinessUnitHierarchy(hierarchy, fallbackBusinessUnits) {
  const divisionsByKey = new Map();
  const mappedBusinessUnitKeys = new Set();

  (Array.isArray(hierarchy) ? hierarchy : []).forEach((entry) => {
    const division = normalizeLabel(entry?.division);

    if (!division) {
      return;
    }

    const businessUnits = [...new Set(
      (Array.isArray(entry?.businessUnits) ? entry.businessUnits : [])
        .map(normalizeLabel)
        .filter(Boolean)
    )].sort((left, right) => left.localeCompare(right));

    businessUnits.forEach((businessUnit) => mappedBusinessUnitKeys.add(normalizeKey(businessUnit)));
    divisionsByKey.set(normalizeKey(division), {
      parent: division,
      matchParent: division,
      children: businessUnits
    });
  });

  const fallbackBusinessUnitsFiltered = [...new Set(
    (Array.isArray(fallbackBusinessUnits) ? fallbackBusinessUnits : [])
      .map(normalizeLabel)
      .filter((businessUnit) => businessUnit && !mappedBusinessUnitKeys.has(normalizeKey(businessUnit)))
  )].sort((left, right) => left.localeCompare(right));

  if (fallbackBusinessUnitsFiltered.length > 0) {
    divisionsByKey.set('__fallback__', {
      parent: FALLBACK_DIVISION_LABEL,
      matchParent: '',
      children: fallbackBusinessUnitsFiltered
    });
  }

  return [...divisionsByKey.values()].sort((left, right) =>
    left.parent.localeCompare(right.parent)
  );
}

function canonicalizeBusinessUnitSelections(values, entries) {
  const divisionByKey = new Map();
  const businessUnitLocations = new Map();

  entries.forEach((entry) => {
    const matchParent = entry.matchParent ?? entry.parent;
    divisionByKey.set(normalizeKey(entry.parent), matchParent);

    entry.children.forEach((businessUnit) => {
      const key = normalizeKey(businessUnit);
      const locations = businessUnitLocations.get(key) ?? [];
      locations.push({ division: matchParent, businessUnit });
      businessUnitLocations.set(key, locations);
    });
  });

  const selections = [];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const parsed = parseBusinessUnitFilterToken(value);

    if (parsed.type === 'division') {
      selections.push(makeBusinessUnitDivisionToken(parsed.division));
      return;
    }

    if (parsed.type === 'businessUnit') {
      selections.push(makeBusinessUnitChildToken(parsed.division, parsed.businessUnit));
      return;
    }

    const matchingLocations = businessUnitLocations.get(normalizeKey(parsed.businessUnit)) ?? [];

    if (matchingLocations.length > 0) {
      matchingLocations.forEach(({ division, businessUnit }) => {
        selections.push(makeBusinessUnitChildToken(division, businessUnit));
      });
      return;
    }

    const matchingDivision = divisionByKey.get(normalizeKey(parsed.businessUnit));

    if (matchingDivision !== undefined) {
      selections.push(makeBusinessUnitDivisionToken(matchingDivision));
      return;
    }

    selections.push(value);
  });

  return [...new Set(selections.filter(Boolean))];
}

export function BusinessUnitHierarchyFilter({
  hierarchy = [],
  options = [],
  value = [],
  onChange,
  allLabel = 'All business units',
  inputId = 'global-filter-businessUnit'
}) {
  const entries = useMemo(
    () => mergeBusinessUnitHierarchy(hierarchy, options),
    [hierarchy, options]
  );
  const canonicalValue = useMemo(
    () => canonicalizeBusinessUnitSelections(value, entries),
    [value, entries]
  );

  return (
    <HierarchyFilter
      entries={entries}
      value={canonicalValue}
      onChange={onChange}
      allLabel={allLabel}
      inputId={inputId}
      ariaLabel="Filter dashboard by Business Unit"
      menuAriaLabel="Business units by division"
      searchPlaceholder="Search divisions or business units"
      searchAriaLabel="Search divisions or business units"
      makeParentToken={(entry) => makeBusinessUnitDivisionToken(entry.matchParent ?? entry.parent)}
      makeChildToken={(entry, child) =>
        makeBusinessUnitChildToken(entry.matchParent ?? entry.parent, child)
      }
      getTokenLabel={(token) => parseBusinessUnitFilterToken(token).label}
    />
  );
}


export function FlatCheckboxFilter({
  options = [],
  value = [],
  onChange,
  allLabel = 'All options',
  inputId = 'global-filter-flat',
  ariaLabel = 'Filter dashboard',
  menuAriaLabel = 'Filter options',
  searchPlaceholder = 'Search options',
  searchAriaLabel = 'Search options'
}) {
  const normalizedOptions = useMemo(() => [...new Set(
    (Array.isArray(options) ? options : [])
      .map(normalizeLabel)
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right)), [options]);

  const optionByKey = useMemo(
    () => new Map(normalizedOptions.map((option) => [normalizeKey(option), option])),
    [normalizedOptions]
  );

  const canonicalValue = useMemo(() => [...new Set(
    (Array.isArray(value) ? value : [])
      .map((selectedValue) => {
        const normalizedValue = normalizeLabel(selectedValue);
        return optionByKey.get(normalizeKey(normalizedValue)) ?? normalizedValue;
      })
      .filter(Boolean)
  )], [value, optionByKey]);

  const entries = useMemo(
    () => normalizedOptions.map((option) => ({ parent: option, children: [] })),
    [normalizedOptions]
  );

  return (
    <HierarchyFilter
      entries={entries}
      value={canonicalValue}
      onChange={onChange}
      allLabel={allLabel}
      inputId={inputId}
      ariaLabel={ariaLabel}
      menuAriaLabel={menuAriaLabel}
      searchPlaceholder={searchPlaceholder}
      searchAriaLabel={searchAriaLabel}
      makeParentToken={(entry) => entry.parent}
      makeChildToken={() => ''}
      getTokenLabel={(token) => normalizeLabel(token)}
      flat
    />
  );
}
