// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  cloudinary: {
    cloud_name: 'egmontkollegiet-dev',
    api_key: '847733283445576',
    api_secret: 'oWrtkHnYekzL1ba-ks537vnWUXg',
    upload_preset: 'ml_default'
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
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
