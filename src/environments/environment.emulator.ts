// Local development against the Firebase emulators (auth 9099, firestore 8181), seeded with
// anonymised prod data by ops/restore.js. `ng serve -c emulator`.
export const environment = {
  emulators: true,
  production: false,
  cloudinary: {
    // Anonymised data still points at prod product images; delivery URLs are public.
    // No upload preset, so uploads fail instead of landing in the prod account.
    cloud_name: 'egmontkollegiet',
    upload_preset: ''
  },
  // Buy me a coffee link on Aktuelt (#87); hidden while empty.
  maker: {
    coffeeUrl: ''
  },
  firebase: {
    apiKey: 'demo-key',
    authDomain: 'demo-kollegianeren.firebaseapp.com',
    projectId: 'demo-kollegianeren',
    storageBucket: 'demo-kollegianeren.appspot.com',
    messagingSenderId: '0'
  }
};
