self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'HSCVPL PLM', {
      body:  data.body  || '',
      icon:  '/logo.png',
      badge: '/logo.png',
      tag:   data.tag   || 'plm',
      data:  { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url && 'focus' in client) return client.focus()
      }
      return clients.openWindow(event.notification.data.url)
    })
  )
})
