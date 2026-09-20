chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === 'fonts') {
    chrome.fontSettings.getFontList(sendResponse);
    return true;
  }
});
