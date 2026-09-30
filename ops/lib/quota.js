// Spark plan quotas reset at midnight US Pacific time.
const SPARK = { reads: 50000, writes: 20000, deletes: 20000 };

function pacificMidnight(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now).map(p => [p.type, p.value]));
  const secondsIntoDay = (+parts.hour % 24) * 3600 + (+parts.minute) * 60 + (+parts.second);
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - secondsIntoDay * 1000);
}

async function series(accessToken, projectId, metric, start, end, alignmentSeconds) {
  const q = new URLSearchParams({
    filter: `metric.type="firestore.googleapis.com/${metric}"`,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': `${alignmentSeconds}s`,
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?${q}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  const body = await res.json();
  if (body.error) throw new Error(`Cloud Monitoring: ${body.error.message}`);
  return (body.timeSeries?.[0]?.points || []).map(p => ({ end: p.interval.endTime, value: +p.value.int64Value }));
}

// Document reads counted so far in the current quota day. Cloud Monitoring lags a few minutes.
async function usedToday(accessToken, projectId, metric = 'document/read_count') {
  const points = await series(accessToken, projectId, metric, pacificMidnight(), new Date(), 60);
  return points.reduce((sum, p) => sum + p.value, 0);
}

// Reads, writes and deletes per Pacific quota day for the last `days` days, oldest first. Hourly
// buckets are summed into days, because Monitoring aligns daily buckets to UTC.
async function dailyUsage(accessToken, projectId, days) {
  const today = pacificMidnight();
  const start = new Date(today.getTime() - (days - 1) * 864e5);
  const byDay = {};
  for (const [key, metric] of [['reads', 'document/read_count'], ['writes', 'document/write_count'], ['deletes', 'document/delete_count']]) {
    for (const p of await series(accessToken, projectId, metric, start, new Date(), 3600)) {
      const day = pacificMidnight(new Date(Date.parse(p.end) - 1)).toISOString().slice(0, 10);
      (byDay[day] ||= { day, reads: 0, writes: 0, deletes: 0 })[key] += p.value;
    }
  }
  return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
}

module.exports = { SPARK, pacificMidnight, series, usedToday, dailyUsage };
