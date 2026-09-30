// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  emulators: false,
  production: false,
  // Unsigned upload preset only; Cloudinary API keys and secrets never belong in the app.
  // The production account (the old dev account was disabled), uploading into its dev/ folder.
  cloudinary: {
    cloud_name: 'egmontkollegiet',
    upload_preset: 'kollegianeren_dev'
  },
  firebase: {
    apiKey: 'AIzaSyBQYwdOvSjikzel3fLDmO7wY75byglR5T4',
    authDomain: 'kollegianeren.firebaseapp.com',
    databaseURL: 'https://kollegianeren.firebaseio.com',
    projectId: 'kollegianeren',
    storageBucket: 'kollegianeren.appspot.com',
    messagingSenderId: '507071028000'
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
