// lib/report-generator.js
// On-demand Trip/Track report generation, per Trip_Track_Reference_Spec.md
// section 3. Deliberately channel-agnostic: parsing the trigger text and
// building the .xlsx both work the same regardless of where the request
// came from (WhatsApp today, potentially something else later) — only the
// "watch for incoming messages" wiring in app.js is WhatsApp-specific.

const ExcelJS = require('exceljs');

const REQUEST_HEADER = 'Report Generator Claw Schema';
const DATE_RANGE_RE = /^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?\s*-\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?$/;

function ddmmyyyyToIso(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

// Parses a message against the exact "Report Generator Claw Schema"
// pattern. Pure text matching, no fuzzy/AI interpretation, per spec.
// Returns null if the text doesn't match; never throws for malformed input.
function parseReportRequest(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 5 || lines[0] !== REQUEST_HEADER) return null;

  const [, company, vehicle, reportTypeLine, dateRangeLine] = lines;

  const typeMatch = reportTypeLine.match(/^Report Type:\s*(trip|track)$/i);
  if (!typeMatch) return null;
  const reportType = typeMatch[1][0].toUpperCase() + typeMatch[1].slice(1).toLowerCase(); // 'Trip' | 'Track'

  const rangeMatch = dateRangeLine.match(DATE_RANGE_RE);
  if (!rangeMatch) return null;
  const [, startDdmmyyyy, startTime, endDdmmyyyy, endTime] = rangeMatch;

  if (!company || !vehicle) return null;

  return {
    company,
    vehicle,
    reportType,
    startDate: ddmmyyyyToIso(startDdmmyyyy),
    startTime: startTime ? `${startTime}:00` : '00:00:00',
    endDate: ddmmyyyyToIso(endDdmmyyyy),
    endTime: endTime ? `${endTime}:00` : '23:59:59',
  };
}

function sanitizeForFilename(s) {
  return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}

const REPORT_TABLES = {
  Trip: { table: 'trip_records', timeColumn: 'start_time' },
  Track: { table: 'raw_tracks', timeColumn: 'arrive_time' },
};

// Reads from the already-collected local database and builds an .xlsx
// buffer. Independent of whatever triggered the request.
async function generateReport(request, db) {
  const { table, timeColumn } = REPORT_TABLES[request.reportType];
  const startBoundary = `${request.startDate} ${request.startTime}`;
  const endBoundary = `${request.endDate} ${request.endTime}`;

  const rows = db.prepare(`
    SELECT * FROM ${table}
    WHERE LOWER(company) = LOWER(?) AND LOWER(vehicle) = LOWER(?)
      AND (date || ' ' || ${timeColumn}) BETWEEN ? AND ?
    ORDER BY date, ${timeColumn}
  `).all(request.company, request.vehicle, startBoundary, endBoundary);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(request.reportType);

  if (rows.length === 0) {
    ws.addRow(['No data found for this company/vehicle/date range.']);
  } else {
    const columns = Object.keys(rows[0]).filter((c) => c !== 'id' && c !== 'fetched_at');
    ws.addRow(columns);
    ws.getRow(1).font = { bold: true };
    for (const row of rows) ws.addRow(columns.map((c) => row[c]));
    ws.columns.forEach((col) => { col.width = 18; });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${sanitizeForFilename(request.company)}_${sanitizeForFilename(request.vehicle)}_${request.reportType}_${request.startDate}_to_${request.endDate}.xlsx`;
  return { buffer, filename, rowCount: rows.length };
}

module.exports = { parseReportRequest, generateReport, REQUEST_HEADER };
