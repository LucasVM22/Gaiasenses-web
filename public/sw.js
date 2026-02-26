self.addEventListener('install', event => {
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	clients.claim();
});

self.addEventListener('push', function (event) {
	if (event.data) {
		const data = event.data.json();
		const options = {
			body: data.body,
			icon: data.icon || '/icon.png',
			badge: '/badge.png',
			vibrate: [100, 50, 100],
			data: {
				dateOfArrival: Date.now(),
				primaryKey: '2',
			},
		};
		event.waitUntil(self.registration.showNotification(data.title, options));
	}
	console.log('Notification received');
})
 
self.addEventListener('notificationclick', function (event) {
	console.log('Notification click received.');
	event.notification.close();
	event.waitUntil(clients.openWindow('https://gaiasenses-web.vercel.app/'));
	//event.waitUntil(clients.openWindow('https://gaiasenses-web.vercel.app/pt/map3?lat=-22.8305&lng=-43.2192&mode=map&composition=stormEye&play=false&initial=false'));
})