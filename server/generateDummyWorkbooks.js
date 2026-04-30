import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectoryPath = path.resolve(__dirname, '../data');
const otdFilePath = path.join(dataDirectoryPath, 'otd_data.xlsx');
const laborUtilizationFilePath = path.join(dataDirectoryPath, 'labor_utilization.xlsx');
const controllableCostsFilePath = path.join(dataDirectoryPath, 'controllable_costs.xlsx');

const OTD_MONTH_COLUMNS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const LABOR_MONTH_COLUMNS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CONTROLLABLE_COSTS_SHEET_NAMES = {
  costs: 'Controllable Costs',
  categoryKey: 'Cost Category Key',
  elementKey: 'Cost Element Key'
};

const beatlesPrograms = [
  { program: 'Penny Lane Lanterns', projectId: 'BTL-001', site: 'Abbey Road', type: 'Tea Kettle' },
  { program: 'Octopus Garden Club', projectId: 'BTL-002', site: 'Blue Meanie Pier', type: 'Bubble Machine' },
  { program: 'Eleanor Rigby Threads', projectId: 'BTL-003', site: 'Liverpool North', type: 'Window Shade' },
  { program: 'Here Comes the Sunhats', projectId: 'BTL-004', site: 'Sun King Yard', type: 'Sunhat Press' },
  { program: 'Lucy Sky Kaleidoscopes', projectId: 'BTL-005', site: 'Pepperland East', type: 'Glass Carousel' },
  { program: 'Blackbird Midnight Seed', projectId: 'BTL-006', site: 'Blackbird Grove', type: 'Seed Hopper' },
  { program: 'Lady Madonna Piano Works', projectId: 'BTL-007', site: 'Piano Dock', type: 'Key Cabinet' },
  { program: 'Norwegian Wood Workshop', projectId: 'BTL-008', site: 'Savile Row', type: 'Cedar Bench' },
  { program: 'All You Need Confetti', projectId: 'BTL-009', site: 'Love Parade Hall', type: 'Ribbon Cannon' },
  { program: 'Helter Skelter Springs', projectId: 'BTL-010', site: 'Helter Ridge', type: 'Coil Rack' },
  { program: 'Maxwell Hammer Repair', projectId: 'BTL-011', site: 'Silver Forge', type: 'Tool Chest' },
  { program: 'Hello Goodbye Signals', projectId: 'BTL-012', site: 'Signal House', type: 'Lantern Switch' },
  { program: 'Get Back Transit', projectId: 'BTL-013', site: 'Rooftop Dock', type: 'Seat Rail' },
  { program: 'Sgt Pepper Sundries', projectId: 'BTL-014', site: 'Pepperland West', type: 'Band Trunk' },
  { program: 'Magical Mystery Motors', projectId: 'BTL-015', site: 'Mystery Loop', type: 'Bus Beacon' },
  { program: 'Day Tripper Dispatch', projectId: 'BTL-016', site: 'Daybreak Yard', type: 'Ticket Punch' },
  { program: 'Revolution Radio Kits', projectId: 'BTL-017', site: 'Revolver Hill', type: 'Dial Console' },
  { program: 'Paperback Writer Supplies', projectId: 'BTL-018', site: 'Paperback Wharf', type: 'Fountain Pen' },
  { program: 'Strawberry Fields Jam', projectId: 'BTL-019', site: 'Strawberry Field', type: 'Jam Kettle' },
  { program: 'Yellow Submarine Bubbles', projectId: 'BTL-020', site: 'Submarine Bay', type: 'Bubble Vat' },
  { program: 'Fixing a Hole Carpentry', projectId: 'BTL-021', site: 'Fixer Alley', type: 'Patch Kit' },
  { program: 'While My Guitar Gently Wires', projectId: 'BTL-022', site: 'Guitar Walk', type: 'Copper Loom' },
  { program: 'Across the Universe Telescopes', projectId: 'BTL-023', site: 'Universe Point', type: 'Pocket Scope' },
  { program: 'Ob La Di Parade Whistles', projectId: 'BTL-024', site: 'Parade Square', type: 'Whistle Mold' }
];

const laborFacilities = [
  'Blonde on Blonde Works',
  'Desolation Row Plant',
  'Highway 61 Forge',
  'Tambourine North Yard',
  'Nashville Skyline Hub',
  'Shelter from the Storm Center',
  'Tangled Up in Blue Campus',
  'Rolling Stone Depot',
  'Freewheelin Assembly',
  'Johanna Harbor'
];

const laborPools = [
  { name: 'Tambourine Operations', code: 'T184' },
  { name: 'Skyline Fabrication', code: 'S274' },
  { name: 'Row Materials', code: 'R318' },
  { name: 'Storm Planning', code: 'P442' },
  { name: 'Blue Assembly', code: 'B157' },
  { name: 'Harmonica Quality', code: 'H603' },
  { name: 'Quinn Logistics', code: 'Q219' },
  { name: 'Ramona Maintenance', code: 'M728' },
  { name: 'Isis Scheduling', code: 'I355' },
  { name: 'Jokerman Support', code: 'J481' }
];

const laborWorkerSubtypes = [
  'Harmonica Technician',
  'Ballad Planner',
  'Skyline Scheduler',
  'Highway Fabricator',
  'Tambourine Coordinator',
  'Storm Analyst',
  'Blue Assembly Lead',
  'Freewheelin Inspector',
  'Desolation Mechanic',
  'Isis Materials Handler'
];

const laborCategories = [
  { value: 'Labor Direct', group: 'direct' },
  { value: 'Core Labor Direct', group: 'direct' },
  { value: 'Labor Direct Assembly', group: 'direct' },
  { value: 'Labor Direct Field Support', group: 'direct' },
  { value: 'Nashville Labor Direct Crew', group: 'direct' },
  { value: 'Labor Indirect', group: 'indirect' },
  { value: 'Labor Indirect Planning', group: 'indirect' },
  { value: 'Shared Labor Indirect Services', group: 'indirect' },
  { value: 'Program Office', group: 'other' },
  { value: 'Rolling Stock Support', group: 'other' },
  { value: 'Absence Coverage', group: 'other' },
  { value: 'Special Projects Reserve', group: 'other' }
];

const laborFirstNames = [
  'Johanna',
  'Ramona',
  'Maggie',
  'Sara',
  'Corrina',
  'Lily',
  'Rosemary',
  'Isis',
  'Delia',
  'Quinn',
  'Willie',
  'Jack',
  'Silvio',
  'Annie',
  'Hazel',
  'Terry',
  'Eddie',
  'Ruben',
  'George',
  'Sadie'
];

const laborLastNames = [
  'Mercer',
  'Sloan',
  'Hollis',
  'Bennett',
  'Rivers',
  'Parker',
  'Keaton',
  'Marlowe',
  'Dalton',
  'Caldwell',
  'Bell',
  'Harmon',
  'Sutter',
  'Nash',
  'Rowe',
  'Quincy',
  'Farrow',
  'Wilder',
  'Blaine',
  'Carroll'
];

const controllableCostAddresses = [
  'Folsom Yard',
  'Ring of Fire Plaza',
  'Walk the Line Depot',
  'Jackson Crossing',
  'San Quentin Annex',
  'Hurt Ridge',
  'June Carter Center',
  'Ghost Riders Base'
];

const controllableCostCategories = [
  { name: 'Rail Operations', controllable: 'Controllable' },
  { name: 'Wardrobe', controllable: 'Controllable' },
  { name: 'Security', controllable: 'Uncontrollable' },
  { name: 'Facilities', controllable: 'Uncontrollable' },
  { name: 'Travel', controllable: 'Uncontrollable' },
  { name: 'Utilities', controllable: 'Uncontrollable' }
];

const controllableCostElements = [
  {
    costCategory: 'Wardrobe',
    costElement: 'JC-101',
    costElementDescription: 'Man in Black Tailoring',
    baseCost: 182000,
    keyControllable: 'Controllable'
  },
  {
    costCategory: 'Rail Operations',
    costElement: 'JC-102',
    costElementDescription: 'Folsom Rail Brake Service',
    baseCost: 246000,
    keyControllable: 'Controllable'
  },
  {
    costCategory: 'Travel',
    costElement: 'JC-103',
    costElementDescription: 'Jackson Guest Travel',
    baseCost: 138000,
    keyControllable: 'Controllable'
  },
  {
    costCategory: 'Security',
    costElement: 'JC-104',
    costElementDescription: 'San Quentin Perimeter Cameras',
    baseCost: 228000,
    keyControllable: 'Uncontrollable'
  },
  {
    costCategory: 'Utilities',
    costElement: 'JC-105',
    costElementDescription: 'Ring of Fire Generator Diesel',
    baseCost: 264000,
    keyControllable: 'Uncontrollable'
  },
  {
    costCategory: 'Rail Operations',
    costElement: 'JC-106',
    costElementDescription: 'I Walk the Line Dispatch Tools',
    baseCost: 174000,
    keyControllable: 'Controllable'
  },
  {
    costCategory: 'Facilities',
    costElement: 'JC-107',
    costElementDescription: 'Hurt Facility Repairs',
    baseCost: 196000
  },
  {
    costCategory: 'Wardrobe',
    costElement: 'JC-108',
    costElementDescription: 'Carter Harmony Greenroom Kits',
    baseCost: 121000
  },
  {
    costCategory: 'Travel',
    costElement: 'JC-109',
    costElementDescription: 'Ghost Riders Crew Lodging',
    baseCost: 167000
  },
  {
    costCategory: 'Facilities',
    costElement: 'JC-110',
    costElementDescription: 'Folsom Stage Lighting Lease',
    baseCost: 212000,
    keyControllable: 'Uncontrollable'
  }
];

function createRng(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function roundNumber(value) {
  return Number(value.toFixed(2));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createWorkbook(rows, sheetName) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  return workbook;
}

function createWorkbookWithSheets(sheets) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach(({ name, rows }) => {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });

  return workbook;
}

function createOtdRows() {
  const rng = createRng(1964);

  return beatlesPrograms.flatMap((project, projectIndex) => {
    const contractRow = {
      '2026': 'Contract Commitment',
      Program: project.program,
      'Project ID': project.projectId,
      Site: project.site,
      Type: project.type
    };
    const deliveredRow = {
      '2026': 'Actual Delivered',
      Program: project.program,
      'Project ID': project.projectId,
      Site: project.site,
      Type: project.type
    };

    OTD_MONTH_COLUMNS.forEach((month, monthIndex) => {
      const activeChance = rng();
      const isActiveMonth =
        monthIndex >= projectIndex % 4 && activeChance > 0.12;

      if (!isActiveMonth) {
        contractRow[month] = null;
        deliveredRow[month] = null;
        return;
      }

      const baseline =
        4200 +
        projectIndex * 235 +
        monthIndex * 380 +
        rng() * 7200 +
        (projectIndex % 3) * 415;
      const commitment = Math.round(baseline);
      const delivered = roundNumber(
        clampNumber(commitment * (0.84 + rng() * 0.19), 0, commitment * 1.08)
      );

      contractRow[month] = commitment;
      deliveredRow[month] = delivered;
    });

    return [contractRow, deliveredRow];
  });
}

function createEmployeeName(index) {
  const firstName = laborFirstNames[index % laborFirstNames.length];
  const lastName = laborLastNames[Math.floor(index / laborFirstNames.length) % laborLastNames.length];

  return `${firstName} ${lastName}`;
}

function createEmployeeId(index) {
  const prefix = String.fromCharCode(65 + (index % 26));
  const suffix = String(10000 + index).slice(-5);

  return `${prefix}${suffix}`;
}

function getHoursValue(rng, categoryGroup, workerType, timeType) {
  let value = Math.pow(rng(), 0.68) * 300;

  if (categoryGroup === 'indirect') {
    value *= 0.8;
  } else if (categoryGroup === 'other') {
    value *= 0.58;
  }

  if (workerType === 'Contractor') {
    value *= 0.93;
  }

  if (timeType === 'Part Time' || timeType === 'P') {
    value *= 0.6;
  }

  if (rng() < 0.05) {
    value *= 0.18;
  }

  return roundNumber(clampNumber(value, 0, 300));
}

function createLaborUtilizationRows() {
  const rng = createRng(1975);
  const rows = [];

  for (let index = 0; index < 120; index += 1) {
    const facility = laborFacilities[index % laborFacilities.length];
    const pool = laborPools[(index * 3) % laborPools.length];
    const category = laborCategories[(index * 5) % laborCategories.length];
    const workerType = index % 5 === 0 ? 'Contractor' : 'Employee';
    const unionType = index % 4 === 0 ? 'No' : 'Yes';
    const timeTypeOptions = ['Full time', 'Part Time', 'F', 'P'];
    const timeType = timeTypeOptions[index % timeTypeOptions.length];
    const workerSubtype = laborWorkerSubtypes[(index * 7) % laborWorkerSubtypes.length];

    const row = {
      MyID: createEmployeeId(index),
      'Employee Name': createEmployeeName(index),
      'Forecasted CC': facility,
      Pool: pool.name,
      'Location Code': pool.code,
      'Union Type': unionType,
      'Worker Type': workerType,
      'Worker Subtype': workerSubtype,
      'Time Type': timeType,
      'Labor Category': category.value,
      Measure: 'Hours'
    };

    let annualTotal = 0;

    LABOR_MONTH_COLUMNS.forEach((month) => {
      const hours = getHoursValue(rng, category.group, workerType, timeType);

      row[month] = hours;
      annualTotal += hours;
    });

    row['2026'] = roundNumber(annualTotal);
    rows.push(row);
  }

  return rows;
}

function createControllableCostCategoryKeyRows() {
  return controllableCostCategories.map((category) => ({
    'Cost Category': category.name,
    Controllable: category.controllable
  }));
}

function createControllableCostElementKeyRows() {
  return controllableCostElements
    .filter((element) => element.keyControllable)
    .map((element) => ({
      'Cost Category': element.costCategory,
      'Cost Element': element.costElement,
      'Cost Element Description': element.costElementDescription,
      Controllable: element.keyControllable
    }));
}

function createControllableCostsRows() {
  const rng = createRng(1932);
  const rows = [];
  const years = [2025, 2026];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  years.forEach((year, yearIndex) => {
    quarters.forEach((quarter, quarterIndex) => {
      controllableCostAddresses.forEach((address, addressIndex) => {
        controllableCostElements.forEach((element, elementIndex) => {
          if (rng() < 0.08) {
            return;
          }

          const seasonalFactor = 0.86 + quarterIndex * 0.07;
          const yearFactor = 1 + yearIndex * 0.05;
          const addressFactor = 0.9 + (addressIndex % 4) * 0.055;
          const elementFactor = 0.94 + (elementIndex % 5) * 0.045;
          const varianceFactor = 0.9 + rng() * 0.24;
          const cost =
            element.baseCost *
            seasonalFactor *
            yearFactor *
            addressFactor *
            elementFactor *
            varianceFactor;

          rows.push({
            'Cost Category': element.costCategory,
            Address: address,
            'Cost Element': element.costElement,
            'Cost Element Description': element.costElementDescription,
            Cost: roundNumber(cost),
            Quarter: quarter,
            Year: year
          });
        });
      });
    });
  });

  return rows;
}

const otdWorkbook = createWorkbook(createOtdRows(), '2026 Commitments');
const laborUtilizationWorkbook = createWorkbook(
  createLaborUtilizationRows(),
  '2026 Labor Utilization'
);
const controllableCostsWorkbook = createWorkbookWithSheets([
  {
    name: CONTROLLABLE_COSTS_SHEET_NAMES.costs,
    rows: createControllableCostsRows()
  },
  {
    name: CONTROLLABLE_COSTS_SHEET_NAMES.categoryKey,
    rows: createControllableCostCategoryKeyRows()
  },
  {
    name: CONTROLLABLE_COSTS_SHEET_NAMES.elementKey,
    rows: createControllableCostElementKeyRows()
  }
]);

XLSX.writeFile(otdWorkbook, otdFilePath);
XLSX.writeFile(laborUtilizationWorkbook, laborUtilizationFilePath);
XLSX.writeFile(controllableCostsWorkbook, controllableCostsFilePath);

console.log(`Wrote ${path.relative(process.cwd(), otdFilePath)}`);
console.log(`Wrote ${path.relative(process.cwd(), laborUtilizationFilePath)}`);
console.log(`Wrote ${path.relative(process.cwd(), controllableCostsFilePath)}`);
