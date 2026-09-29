// Lossless JSON encoding of Firestore values, so backups restore with the right types.
const { Timestamp, GeoPoint, DocumentReference } = require('firebase-admin/firestore');

function encode(v) {
  if (v instanceof Timestamp) return { __t: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof DocumentReference) return { __t: 'ref', p: v.path };
  if (v instanceof GeoPoint) return { __t: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof Uint8Array) return { __t: 'bytes', b: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}

function decode(v, db) {
  if (Array.isArray(v)) return v.map(x => decode(x, db));
  if (v && typeof v === 'object') {
    switch (v.__t) {
      case 'ts': return new Timestamp(v.s, v.n);
      case 'ref': return db.doc(v.p);
      case 'geo': return new GeoPoint(v.lat, v.lng);
      case 'bytes': return Buffer.from(v.b, 'base64');
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x, db)]));
  }
  return v;
}

module.exports = { encode, decode };
