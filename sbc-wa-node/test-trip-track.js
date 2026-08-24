// Manual test: runs one collection cycle, then exercises report generation
// against whatever landed in the DB. `node test-trip-track.js`
const Database = require('better-sqlite3');
const tripTrack = require('./lib/trip-track');
const { parseReportRequest, generateReport } = require('./lib/report-generator');

async function main() {
  const db = new Database('/data/node_storage.db');

  console.log('=== Running one Trip & Track collection cycle ===');
  const result = await tripTrack.runCollection(db);
  console.log('Result:', result);

  console.log('\n=== Sample trip_records rows ===');
  console.log(db.prepare('SELECT * FROM trip_records LIMIT 3').all());
  console.log('trip_records count:', db.prepare('SELECT COUNT(*) c FROM trip_records').get().c);

  console.log('\n=== Sample raw_tracks rows ===');
  console.log(db.prepare('SELECT * FROM raw_tracks LIMIT 3').all());
  console.log('raw_tracks count:', db.prepare('SELECT COUNT(*) c FROM raw_tracks').get().c);

  console.log('\n=== parseReportRequest test ===');
  const sample = `Report Generator Claw Schema
ABC Logistics Sdn Bhd
WXY1234
Report Type: Trip
01/08/2026 - 07/08/2026`;
  console.log(JSON.stringify(parseReportRequest(sample), null, 2));

  console.log('\n=== generateReport test, using a real company/vehicle from trip_records ===');
  const sampleRow = db.prepare('SELECT company, vehicle, date FROM trip_records ORDER BY id DESC LIMIT 1').get();
  if (sampleRow) {
    const request = {
      company: sampleRow.company,
      vehicle: sampleRow.vehicle,
      reportType: 'Trip',
      startDate: '2026-01-01',
      startTime: '00:00:00',
      endDate: '2026-12-31',
      endTime: '23:59:59',
    };
    console.log('Request:', request);
    const report = await generateReport(request, db);
    console.log('rowCount:', report.rowCount, 'filename:', report.filename, 'buffer bytes:', report.buffer.length);
  } else {
    console.log('(no trip_records yet to test report generation against)');
  }

  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
