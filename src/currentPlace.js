// The phone's (or computer's) current location: { lat, lng, accuracy }.
export const getCurrentPlace = () => new Promise((resolve, reject) => {
  if (!('geolocation' in navigator)) { reject(new Error("This browser can't share its location.")); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
    (err) => reject(new Error(err.code === 1
      ? 'Location is blocked. Allow location for this website in the browser settings, then try again.'
      : "Couldn't get your location. Make sure Location is turned on, then try again.")),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
  );
});
