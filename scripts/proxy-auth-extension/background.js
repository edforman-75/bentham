// 2Captcha Proxy Credentials for India (Mumbai)
// IMPORTANT: Before using this extension, replace TWOCAPTCHA_API_KEY with your actual 2Captcha API key
// Get your key from: https://2captcha.com/enterpage
const TWOCAPTCHA_API_KEY = 'YOUR_TWOCAPTCHA_API_KEY_HERE';  // <-- Replace this!
const PROXY_USERNAME = `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-maharashtra-city-mumbai-session-H0lyoUM0x-sessTime-60`;
const PROXY_PASSWORD = TWOCAPTCHA_API_KEY;

// Handle proxy authentication
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    console.log('Proxy auth requested for:', details.challenger);
    callback({
      authCredentials: {
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD
      }
    });
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

console.log('Proxy Auth Helper loaded');
