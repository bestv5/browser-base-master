import {app} from 'electron';

const REMOVE_CHROME_COMPONENT_PATTERNS = [
  /^https:\/\/accounts\.google\.com(\/|$)/,
];

const CHROME_COMPONENT_PATTERN = / Chrome\\?.([^\s]+)/g;

const COMPONENTS_TO_REMOVE = [
  / Electron\\?.([^\s]+)/g,
  ` ${app.name}/${app.getVersion()}`,
];

// TODO(sentialx): script to update stable Chrome version?
const COMPONENTS_TO_REPLACE: [string | RegExp, string][] = [
  [CHROME_COMPONENT_PATTERN, ' Chrome/120.0.0.0'],
];

const urlMatchesPatterns = (url: string, patterns: RegExp[]) =>
  patterns.some((pattern) => url.match(pattern));

/**
 * Checks if a given url is suitable for removal of Chrome
 * component from the user agent string.
 * @param url
 */
const shouldRemoveChromeString = (url: string) =>
  urlMatchesPatterns(url, REMOVE_CHROME_COMPONENT_PATTERNS);

let chromeVersion = process.versions.chrome;
console.log(`Chromium version: ${chromeVersion}`);
if (!chromeVersion) {
  chromeVersion = "120.0.0.0";
}
export const ChromeUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + chromeVersion + " Safari/537.36";
export const ChromeAppVersion = "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + chromeVersion + " Safari/537.36";

export const getUserAgentForURL = (userAgent: string, url: string) => {
  return ChromeUserAgent;
  if (userAgent == null || userAgent == "") {
    return userAgent;
  }
  let componentsToRemove = [...COMPONENTS_TO_REMOVE];

  // For accounts.google.com, we remove Chrome/*.* component
  // from the user agent, to fix compatibility issues on Google Sign In.
  // WATCH: https://developers.googleblog.com/2020/08/guidance-for-our-effort-to-block-less-secure-browser-and-apps.html
  if (shouldRemoveChromeString(url)) {
    componentsToRemove = [...componentsToRemove, CHROME_COMPONENT_PATTERN];
  }

  // Replace the components.
  [
    // Convert components to remove to pairs.
    ...componentsToRemove.map((x): [string | RegExp, string] => [x, '']),
    ...COMPONENTS_TO_REPLACE,
  ].forEach((x) => (userAgent = userAgent.replace(x[0], x[1])));

  return userAgent;
};
