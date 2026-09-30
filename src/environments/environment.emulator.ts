// Local development against the Firebase emulators (auth 9099, firestore 8181), seeded with
// anonymised prod data by ops/restore.js. `ng serve -c emulator`.
export const environment = {
  emulators: true,
  production: false,
  cloudinary: {
    // Anonymised data still points at prod product images; delivery URLs are public.
    // Uploads go to the dev/ folder (unsigned preset kollegianeren_dev), never among prod's.
    cloud_name: 'egmontkollegiet',
    upload_preset: 'kollegianeren_dev'
  },
  firebase: {
    apiKey: 'demo-key',
    authDomain: 'demo-kollegianeren.firebaseapp.com',
    projectId: 'demo-kollegianeren',
    storageBucket: 'demo-kollegianeren.appspot.com',
    messagingSenderId: '0'
  }
};
