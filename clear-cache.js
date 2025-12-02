// Clear browser cache script
// Run this in your browser console or add to public/index.html temporarily

console.log('🔄 Clearing all caches...');

// Clear service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      registration.unregister();
      console.log('✅ Service worker unregistered');
    });
  });
}

// Clear all caches
if ('caches' in window) {
  caches.keys().then(names => {
    names.forEach(name => {
      caches.delete(name);
      console.log('✅ Cache deleted:', name);
    });
  });
}

// Clear local storage
localStorage.clear();
console.log('✅ Local storage cleared');

// Clear session storage
sessionStorage.clear();
console.log('✅ Session storage cleared');

console.log('✨ Cache cleared! Please refresh the page (Cmd+Shift+R or Ctrl+Shift+R)');
