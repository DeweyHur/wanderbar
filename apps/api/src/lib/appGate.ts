/**
 * The oldest phone app that may still be used. Raise it (or set MIN_APP_VERSION on Vercel) once the new
 * build is on Play internal testing and TestFlight, never before: older apps are sent to the store to
 * update, and they can't if the new build isn't there yet.
 */
export const MIN_APP_VERSION = "0.8.0";

export const minAppVersion = () => process.env.MIN_APP_VERSION?.trim() || MIN_APP_VERSION;

/** Where the apps are updated: Play internal testing, and TestFlight (the iPhone app isn't on the App Store). */
export const APP_STORES = {
  android: "https://play.google.com/store/apps/details?id=app.wanderbar.mobile",
  ios: "itms-beta://beta.itunes.apple.com/v1/app/6831952410",
  iosWeb: "https://testflight.apple.com/join/GXYmr5wE",
};
