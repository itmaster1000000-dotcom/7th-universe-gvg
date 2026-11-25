importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// v52: tiny fetch handler so Chrome can offer one-tap "Install app".
// It only passes page loads straight to the network (nothing is cached), so alerts and the site behave as before.
self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(function () {
      return new Response('You are offline. Please check your internet and reload.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});
