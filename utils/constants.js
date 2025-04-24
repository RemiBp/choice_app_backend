// Constants for heatmap calculations
module.exports = {
  EARTH_RADIUS_METERS: 6371000, // Radius of the Earth in meters
  HEATMAP_GRID_SIZE_DEGREES: 0.001, // Grid size for heatmap calculations
  HEATMAP_INTENSITY_NORMALIZATION: 100, // Normalization factor for heatmap intensity
  RECOMMENDATION_TIME_THRESHOLD: 0.2, // Threshold for time-based recommendations
  RECOMMENDATION_DAY_THRESHOLD: 0.2, // Threshold for day-based recommendations
  RECOMMENDATION_INTENSITY_HIGH: 0.8, // Threshold for high intensity
  RECOMMENDATION_INTENSITY_LOW: 0.2, // Threshold for low intensity
  DEFAULT_ACTIVE_USER_RADIUS_METERS: 500, // Default radius for active user search
  DEFAULT_ACTIVE_USER_TIMESPAN_MINUTES: 30, // Default timespan for active user search
  MAX_ACTIVE_USERS_RETURNED: 50, // Max number of active users to return
  DEFAULT_INSIGHTS_RADIUS_METERS: 1000, // Default radius for insights
  DEFAULT_INSIGHTS_TIMESPAN_DAYS: 7, // Default timespan for insights
  MIN_ACTIVITY_POINTS_FOR_INSIGHTS: 10, // Minimum activity points for generating insights
  INSIGHTS_PEAK_TIME_THRESHOLD: 0.3, // Threshold for peak time insights
  INSIGHTS_PEAK_DAY_THRESHOLD: 0.3, // Threshold for peak day insights
  MAX_INSIGHTS_RETURNED: 5, // Max number of insights to return
  DEFAULT_NEARBY_SEARCH_RADIUS_METERS: 1000, // Default radius for nearby searches
  DEFAULT_NEARBY_SEARCH_TIMESPAN_MINUTES: 60, // Default timespan for nearby searches
  MAX_NEARBY_SEARCHES_RETURNED: 20, // Max number of nearby searches to return
  USER_ACTIVITY_ACTIONS: {
    SEARCH: 'search',
    VIEW: 'view',
    FAVORITE: 'favorite',
    CLICK: 'click',
    SHARE: 'share',
    CALL: 'call'
  },
  DEFAULT_UNKNOWN_USERNAME: 'Utilisateur Inconnu', // Default username if not found
  DEFAULT_TIMEZONE: 'Europe/Paris' // Default timezone for date calculations
}; 