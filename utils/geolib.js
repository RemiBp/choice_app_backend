/**
 * Local implementation of geolib's isPointWithinRadius function
 * to avoid Node.js 22 module resolution issues
 */

// Earth radius in meters
const EARTH_RADIUS = 6378137;

/**
 * Convert degrees to radians
 */
function toRad(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Get distance between two points in meters
 */
function getDistance(from, to) {
  const fromLat = from.latitude || from.lat;
  const fromLng = from.longitude || from.lng || from.lon;
  const toLat = to.latitude || to.lat;
  const toLng = to.longitude || to.lng || to.lon;
  
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLng - fromLng);
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return EARTH_RADIUS * c;
}

/**
 * Check if a point is within a given radius around another point
 */
function isPointWithinRadius(point, center, radius) {
  return getDistance(point, center) < radius;
}

module.exports = {
  isPointWithinRadius
};