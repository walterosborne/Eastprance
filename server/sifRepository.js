import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createTimer,
  formatDuration,
  logDebug
} from './debugLogger.js';

const SIF_KPI_NAME = 'Significant Injuries or Fatalities (SIF)';
const SIF_KPI_UPPER = 'SIF INCIDENTS';
const POTENTIAL_SIF_KPI_NAME = 'Potential Significant Injuries or Fatalities (psif)';
const POTENTIAL_SIF_KPI_UPPER = 'POTENTIAL SIF INCIDENTS';
const NMFR_KPI_NAME = 'Near Miss Frequency Rate (NMFR)';
const NMFR_KPI_UPPER = 'NEAR MISS FREQUENCY RATE';
const INCIDENT_ORG_UNIT_NAME = 'Defense';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sifFilePath = path.resolve(__dirname, '../data/sif_data.json');

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeKpiName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSifRow(row) {
  return {
    ...row,
    kpi_name: normalizeKpiName(row.kpi_name),
    kpi_upper: normalizeText(row.kpi_upper),
    org_unit_type: normalizeText(row.org_unit_type),
    org_unit_name: normalizeText(row.org_unit_name),
    date: row.date ?? '',
    actual_value: normalizeNumber(row.actual_value)
  };
}

async function readIncidentData({ scope, kpiName, kpiUpper }) {
  const stopTimer = createTimer();

  logDebug(scope, 'Loading incident JSON data.', {
    filePath: sifFilePath,
    kpiName,
    kpiUpper,
    orgUnitName: INCIDENT_ORG_UNIT_NAME
  });

  const rawFile = await fs.readFile(sifFilePath, 'utf8');
  const parsed = JSON.parse(rawFile);
  const rows = (Array.isArray(parsed) ? parsed : [parsed])
    .map(normalizeSifRow)
    .filter(
      (row) =>
        row.kpi_name === kpiName &&
        row.kpi_upper === kpiUpper &&
        row.org_unit_name === INCIDENT_ORG_UNIT_NAME
    );

  logDebug(scope, 'Incident JSON data loaded.', {
    source: 'json',
    fileName: path.basename(sifFilePath),
    rowCount: rows.length,
    kpiName,
    kpiUpper,
    orgUnitName: INCIDENT_ORG_UNIT_NAME,
    duration: formatDuration(stopTimer())
  });

  return {
    source: 'json',
    fileName: path.basename(sifFilePath),
    rowCount: rows.length,
    kpiName,
    kpiUpper,
    orgUnitName: INCIDENT_ORG_UNIT_NAME,
    rows
  };
}

export async function readSifData() {
  return readIncidentData({
    scope: 'sif',
    kpiName: SIF_KPI_NAME,
    kpiUpper: SIF_KPI_UPPER
  });
}

export async function readPotentialSifData() {
  return readIncidentData({
    scope: 'potential-sif',
    kpiName: POTENTIAL_SIF_KPI_NAME,
    kpiUpper: POTENTIAL_SIF_KPI_UPPER
  });
}

export async function readNmfrData() {
  return readIncidentData({
    scope: 'nmfr',
    kpiName: NMFR_KPI_NAME,
    kpiUpper: NMFR_KPI_UPPER
  });
}
