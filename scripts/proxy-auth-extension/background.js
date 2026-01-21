// 2Captcha Proxy Credentials for India (Mumbai)
const PROXY_USERNAME = 'uae16ff7557af05d3-zone-custom-region-in-st-maharashtra-city-mumbai-session-H0lyoUM0x-sessTime-60';
const PROXY_PASSWORD = 'uae16ff7557af05d3';

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
