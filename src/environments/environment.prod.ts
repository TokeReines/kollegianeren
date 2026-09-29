// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  emulators: false,
  production: true,
  // Unsigned upload preset only; Cloudinary API keys and secrets never belong in the app.
  cloudinary: {
    cloud_name: 'egmontkollegiet',
    upload_preset: 'l8l2znwi'
  },
  // Buy me a coffee link on Aktuelt (#87); hidden while empty.
  maker: {
    coffeeUrl: ''
  },
  firebase: {
    apiKey: 'AIzaSyBbDKH9Nm0tyzvCyM8JzUVRZhaCegjlKP4',
    authDomain: 'ehp.firebaseapp.com',
    databaseURL: 'https://ehp.firebaseio.com',
    projectId: 'firebase-ehp',
    storageBucket: 'firebase-ehp.appspot.com',
    messagingSenderId: '844857538913'
  }
};


/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
