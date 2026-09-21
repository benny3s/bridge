/* 베니브릿지 — FCM 백그라운드 알림 서비스워커 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCSueePQfiHaRxUSZxoropiFjiq9arAaTs",
  authDomain: "benny-meeting.firebaseapp.com",
  projectId: "benny-meeting",
  storageBucket: "benny-meeting.firebasestorage.app",
  messagingSenderId: "925758544707",
  appId: "1:925758544707:web:a0c55e596ae0b15e7fadf6"
});

var messaging = firebase.messaging();
var APP_URL = 'https://benny3s.github.io/bridge/';

/* 새 SW가 즉시 교체·제어되도록 (안 하면 기존 탭이 닫힐 때까지 예전 SW가 남아 알림클릭 이동이 안 됨) */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
var NOTIF_ICON = 'https://benny3s.github.io/bridge/notif-icon.png';   /* 큰 아이콘(브랜드 로고) */
var NOTIF_BADGE = 'https://benny3s.github.io/bridge/notif-badge.png'; /* 상태바 모노크롬 배지 */

/* 앱이 꺼져 있거나 백그라운드일 때 (data 메시지) */
messaging.onBackgroundMessage(function (payload) {
  var d = (payload && payload.data) || {};
  var n = (payload && payload.notification) || d || {};
  var title = n.title || '베니브릿지';
  var options = {
    body: n.body || '',
    icon: n.icon || NOTIF_ICON,
    badge: NOTIF_BADGE,
    /* route/focusId: 클릭 시 앱이 해당 화면으로 이동하는 데 사용 (서버가 넣어주면 정밀, 없으면 앱이 로그인 기준 기본값) */
    data: { url: d.url || APP_URL, route: d.route || '', focusId: d.focusId || '' }
  };
  self.registration.showNotification(title, options);
});

/* 알림 클릭 → 열린 앱이 있으면 포커스 + 라우트 전달(postMessage), 없으면 해시로 새로 열기 */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var nd = event.notification.data || {};
  var route = nd.route || '', focusId = nd.focusId || '';
  var hash = route ? ('#notif=' + encodeURIComponent(route) + (focusId ? (':' + encodeURIComponent(focusId)) : '')) : '';
  var url = (nd.url || APP_URL) + hash;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && (c.url.indexOf('bridge') >= 0 || c.url.indexOf('benny-meeting') >= 0) && 'focus' in c) {
          try { c.postMessage({ type: 'notif-click', route: route, focusId: focusId }); } catch (e) {}
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
