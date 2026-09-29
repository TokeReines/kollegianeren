// Firestore rules evaluations on prod since a given time, split by result (ALLOW / DENY / ERROR).
const path = require('path');
const { init } = require("./lib/firebase");
const { accessToken, projectId } = init('prod');
const since = process.argv[2] || new Date(Date.now() - 3600e3).toISOString();
(async () => {
  const q = new URLSearchParams({
    filter: 'metric.type="firestore.googleapis.com/rules/evaluation_count"',
    'interval.startTime': since, 'interval.endTime': new Date().toISOString(),
    'aggregation.alignmentPeriod': '3600s', 'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM', 'aggregation.groupByFields': 'metric.label.result',
  });
  const r = await (await fetch(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${q}`, { headers: { Authorization: `Bearer ${await accessToken()}` } })).json();
  if (r.error) throw new Error(r.error.message);
  const out = {};
  for (const s of r.timeSeries || []) out[s.metric.labels.result] = s.points.reduce((a, p) => a + +p.value.int64Value, 0);
  console.log(`rules evaluations on ${projectId} since ${since}:`, JSON.stringify(out));
})().catch(e => { console.error(e.message); process.exit(1); });
